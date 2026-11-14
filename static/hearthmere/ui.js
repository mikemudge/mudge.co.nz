// Hearthmere — the DOM overlay: HUD, build menu, alerts, inspector, toasts,
// dialogs (DESIGN §13).
//
// This module owns the whole DOM except the <canvas> and <link> that main.js
// injects. It is a PURE READER of simulation state (§2): it reads fields,
// calls documented command methods on other modules, and emits bus events.
// It never writes a villager, a building inventory, a stock or a clock.
//
// Nothing here touches the DOM at module scope — the file must import cleanly
// under Node 22 headless (§18). Every document.* call lives under init().
//
// Performance shape (§2: 60fps at 200 villagers): the DOM is built once and
// then *diffed*. Panels cache a cheap signature of the data they last drew and
// skip the whole rebuild when it has not changed; the top bar writes text
// nodes and bar widths in place. See UI.update().

import {
  CATEGORIES, BUILDINGS, BUILDINGS_BY_CAT, BUILDING_BY_ID, ITEMS, FOOD_GROUPS,
  TIERS, ROLE_COLOURS, SEASON_NAMES, RESOURCE_INFO, MAX_VILLAGERS, INTRO_KEY,
  SAVE_KEY, SPEEDS, alertFor, obtainableAt, ALERTS, TERRAIN,
} from './constants.js';
// The one number the variety tooltip needs that is not in constants.js. Reading
// it keeps the tooltip's wording and economy's counting rule the same rule.
import { VARIETY_EATEN_DAYS } from './economy.js';
import { fmtNum, fmtDays, titleCase, clamp, shade, toIdx } from './utils.js';

/* ------------------------------------------------------------------ *
 * Static tables
 * ------------------------------------------------------------------ */

// §13 froze this row as wood/stone/plank/iron/tools, but iron and tools are
// tier 3: a Hamlet watched two counters that could never move (ADDENDUM AK2).
// These are the candidates, in ledger order; which of them the row actually
// shows is decided per tier by `obtainableAt`, and one the town cannot reach
// yet reads as locked rather than as zero.
const HUD_GOODS = ['wood', 'stone', 'plank', 'brick', 'iron', 'tools'];

/**
 * ADDENDUM AK3: what makes each item, and what each item is for — the same
 * duty §16.8 puts on an idle building, applied to a number in the HUD. Derived
 * from the building roster once, on first hover, and never again: the roster is
 * static and this walks all 66 defs.
 */
let GOOD_SOURCE = null;

function goodSources() {
  if (GOOD_SOURCE) return GOOD_SOURCE;
  const m = {};
  const row = (id) => (m[id] || (m[id] = { from: [], use: [], into: [] }));
  const push = (arr, d) => { if (arr[arr.length - 1] !== d) arr.push(d); };
  for (let i = 0; i < BUILDINGS.length; i++) {
    const d = BUILDINGS[i];
    const out = (id) => { if (id) push(row(id).from, d); };
    if (d.gathers) {
      out(d.gathers.item);
      if (d.gathers.alt) out(d.gathers.alt.item);
      if (d.gathers.byproduct) out(d.gathers.byproduct.item);
    }
    if (d.grows) {
      out(d.grows.item);
      if (d.grows.alt) out(d.grows.alt.item);
    }
    const rs = d.recipes || (d.recipe ? [d.recipe] : []);
    for (let k = 0; k < rs.length; k++) {
      for (const id in (rs[k].out || {})) out(id);
      for (const id in (rs[k].in || {})) push(row(id).into, d);
    }
    for (const id in (d.cost || {})) push(row(id).use, d);
  }
  GOOD_SOURCE = m;
  return m;
}

/**
 * A tab's buildings in the order the player meets them, not the order the
 * roster declares them: the Apiary is tier 1 and was sitting eleventh. Sorted
 * by tier and stable, so the deliberate groupings inside a tier survive — the
 * farms stay together and a processing step still follows its input. Built
 * once per tab; the roster never changes at runtime.
 */
const CAT_ORDER = {};

function catDefs(cat) {
  if (CAT_ORDER[cat]) return CAT_ORDER[cat];
  const out = (BUILDINGS_BY_CAT[cat] || []).slice();
  out.sort((a, b) => a.tier - b.tier);
  CAT_ORDER[cat] = out;
  return out;
}

/**
 * defId -> the building that replaces it in place. §7 has always let a Cottage
 * be upgraded by placing a House over it, charging only the difference and
 * keeping the residents, and nothing in the UI ever said so.
 */
const UPGRADE_TO = {};
for (let i = 0; i < BUILDINGS.length; i++) {
  const d = BUILDINGS[i];
  if (d.upgradeFrom) UPGRADE_TO[d.upgradeFrom] = d;
}

/** Enough English for the building roster: Quarry -> Quarries, Hut -> Huts. */
function plural(name) {
  const s = String(name);
  return /[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s + 's';
}

function upperFirst(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** "Sawmill, Carpenter +14" — a ledger list, trimmed to `max`. */
function defNames(defs, max) {
  const names = [];
  for (let i = 0; i < defs.length && names.length < max; i++) names.push(defs[i].name);
  const extra = defs.length - names.length;
  return names.join(', ') + (extra > 0 ? ' +' + extra : '');
}

/** The tier of the earliest building that makes `defs` — 0 if nothing does. */
function earliestTier(defs) {
  let t = 0;
  for (let i = 0; i < defs.length; i++) if (!t || defs[i].tier < t) t = defs[i].tier;
  return t;
}

// §13 names four overlays. The hotkeys clash with the speed keys (see the
// HOTKEYS table below), so these are bound to Shift+1..4 and F1..F4.
const OVERLAYS = [
  { id: 'roads', name: 'Roads', hint: 'Road network and what it reaches' },
  { id: 'happiness', name: 'Mood', hint: 'Happiness heatmap' },
  { id: 'food', name: 'Food', hint: 'Market and granary reach' },
  { id: 'raid', name: 'Raids', hint: 'Raid approach paths from the passes' },
];

// §8's VS enum, in its frozen declaration order, so a numeric `v.state` can be
// named without importing villagers.js (which would be a cycle at boot).
const VS_ORDER = [
  'IDLE', 'WALK', 'WORK', 'HAUL_PICKUP', 'HAUL_DROP', 'GO_HOME', 'SLEEP',
  'GO_EAT', 'FLEE', 'FIGHT', 'LEAVING',
];

const SEASON_CLASS = ['spring', 'summer', 'autumn', 'winter'];

/** How long the after-action line holds the banner slot, in wall milliseconds. */
const RAID_REPORT_MS = 16000;

// Every idle reason (§7, frozen strings) gets plain words and a fix the player
// can perform right now — §16.8 guarantees one exists, so if a reason ever
// lands here without an entry that is a Tier-1 bug, not a UI gap.
const IDLE_INFO = {
  'no road': {
    say: 'No road reaches its door, so it produces nothing at all.',
    fix: 'Lay a dirt path (R) from your network to a tile touching its footprint.',
  },
  'no workers': {
    say: 'Nobody is working here.',
    fix: 'Raise its priority below, or build a Cottage so more villagers settle.',
  },
  'no materials': {
    say: 'Waiting on materials.',
    fix: 'Make more, and check a road links the store holding it to this door.',
  },
  'output full': {
    say: 'Its output shelf is full — nothing has been carried away.',
    fix: 'Build a store that takes what it makes, or a Stockpile nearer to it.',
  },
  'resource exhausted': {
    say: 'Nothing left to gather within its radius.',
    fix: 'Demolish it and rebuild beside a fresh deposit — the valley has more.',
  },
  'out of season': {
    say: 'Nothing grows in Winter.',
    fix: 'Fill the granary before Winter. Hunting, fishing and the coop still work.',
  },
  paused: {
    say: 'Paused by you.',
    fix: 'Press Resume to set it working again.',
  },
  night: {
    say: 'The workers are asleep.',
    fix: 'Nothing to do — they are back at dawn.',
  },
  'under construction': {
    say: 'Still being built.',
    fix: 'Build a Builder’s Hut; until then idle villagers build at 0.6× speed.',
  },
  'no storage': {
    say: 'No store in the valley will take what it makes.',
    fix: 'Build a Granary for food, a Stockpile for goods, an Armoury for arms.',
  },
  // N2.3 / U4. The generic wording stands only until `cutOffCause` names the
  // culprit; laying more road here is the one remedy that provably cannot work.
  'cut off': {
    say: 'A road touches it, but no route runs back to the town centre.',
    fix: 'Something solid stands in the last gap — open it, or the building stays retired.',
  },
};

// The three storage classes (G3). A full class names one building, not three:
// "build a Granary" and "build a Stockpile" are different actions.
const STORAGE_CLASS = {
  food: { name: 'food', store: 'Granary' },
  good: { name: 'goods', store: 'Stockpile' },
  arms: { name: 'arms', store: 'Armoury' },
};

// Town-wide problems the alerts panel raises itself (§13). Keys match ALERTS.
const TOWN_FIX = {
  starving: 'Place a Forager’s Hut or Fisherman’s Hut now — neither needs any input.',
  'food low': 'Add a food building today. Food is the ceiling on everything else.',
  homeless: 'Place a Cottage — six timber buys four beds.',
  unemployed: 'Place a workshop or a Stockpile. Idle hands still haul and build.',
  'no soldiers': 'Build a Barracks and let villagers garrison it before the raid lands.',
  'storage full': 'Build another Stockpile, Granary or Warehouse.',
};

function storageClass(cls) {
  return STORAGE_CLASS[cls] || null;
}

// ADDENDUM AO3. A repair reuses the construction delivery path, so a building
// no carrier can reach is one a repair would reserve materials for and then
// wait on for ever — the unroaded hut, wearing a new hat. These name the
// blocker in the same voice as the idle reasons above, and every one names a
// fix the player can perform right now (§16.8).
const REPAIR_BLOCKED = {
  wall: {
    say: 'Walls are never repaired — no carrier can reach one, so the materials would never arrive.',
    fix: 'Pull the weak sections down and lay them again. A palisade section is 1–2 wood.',
  },
  'no road': {
    say: 'Nothing can be carried here — no road reaches its door, so a repair would reserve the materials and then wait for ever.',
    fix: 'Lay a dirt path (R) from your network to a tile touching its footprint, then repair.',
  },
  'no door': {
    say: 'Nothing can be carried here — there is no tile beside it a carrier can stand on, so a repair would reserve the materials and then wait for ever.',
    fix: 'Clear or road a tile touching its footprint, then repair.',
  },
};

// §17's first question — "can you tell, in one glance, why the town is
// unhappy?" — answered from `economy.happinessParts`. `max` is the cap §9.6
// puts on each term, so a bar reads as "how much of this is left to win".
// `sign` is +1 for a term that lifts the mood and -1 for one that drags it;
// `health` is the one term that can do either.
const HAPPY_PARTS = [
  { key: 'housingScore', sign: 1, max: 20, name: 'Homes',
    fix: 'Build Cottages, then better housing — a tier-2 roof cheers more than a tier-1 one.' },
  { key: 'marketAccess', sign: 1, max: 15, name: 'A market in reach',
    fix: 'A Market within twelve tiles of a house is what makes it count.' },
  { key: 'civicScore', sign: 1, max: 20, name: 'Something to enjoy',
    fix: 'A Well, a Chapel, a Tavern — civic buildings cheer every house in radius.' },
  { key: 'health', sign: 0, max: 10, name: 'Health',
    fix: 'Feed the town more than one thing: variety is most of health.' },
  { key: 'homelessPenalty', sign: -1, max: 20, name: 'Sleeping rough',
    fix: 'Every villager without a bed costs the whole town. Place a Cottage.' },
  { key: 'raidGrief', sign: -1, max: 25, name: 'Grief after the raid',
    fix: 'It fades over the days. Soldiers are how you stop the next one.' },
  { key: 'unemployedPenalty', sign: -1, max: 10, name: 'Nothing to do',
    fix: 'Place a workshop or a Stockpile — idle hands still haul and build.' },
  { key: 'arrears', sign: -1, max: 20, name: 'Wages unpaid',
    fix: 'The treasury is empty. Sell goods, or pull down what you cannot keep.' },
];

// §10.7's reasons are written to fit "the game ended because …", which makes a
// poor opening line on its own. Each gets a sentence that says what happened.
const OVER_LEDE = {
  'the valley is empty':
    'The last villager is gone. Nobody is left to carry bread, cut timber or stand in the pass.',
};

const HOTKEYS = [
  ['Space', 'Pause / resume'],
  ['1…' + (SPEEDS.length - 1), 'Game speed, up to ' + SPEEDS[SPEEDS.length - 1] + '×'],
  ['R', 'Dirt path tool'],
  ['M', 'Show / hide the build menu'],
  ['Del', 'Demolish tool'],
  ['Esc', 'Cancel the current tool'],
  [', .', 'Cycle the alerts list'],
  ['⇧1…⇧4', 'Toggle the four map overlays'],
];

/* ------------------------------------------------------------------ *
 * DOM helpers (only ever called from init() onward)
 * ------------------------------------------------------------------ */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

/** Write only when the value actually differs — this runs at 60fps. */
function setText(node, value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (node._t !== s) {
    node._t = s;
    node.textContent = s;
  }
}

function setCls(node, cls) {
  if (node._c !== cls) {
    node._c = cls;
    node.className = cls;
  }
}

function setStyle(node, prop, value) {
  const key = '_s' + prop;
  if (node[key] !== value) {
    node[key] = value;
    node.style.setProperty(prop, value);
  }
}

function setToggle(node, cls, on) {
  const key = '_k' + cls;
  if (node[key] !== on) {
    node[key] = on;
    node.classList.toggle(cls, on);
  }
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* ------------------------------------------------------------------ *
 * Cross-module readers
 *
 * Every read of another module funnels through here so the seam surface is
 * one screenful and the handoff list is exact. Each reader takes the primary
 * contract name and falls back to the obvious synonyms, because a reader that
 * guesses wrong should degrade to a dash, never throw mid-frame.
 * ------------------------------------------------------------------ */

function numOf(v, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** Read `name` off `obj`, calling it when it is a method. */
function ask(obj, name, arg, dflt) {
  if (!obj) return dflt;
  const v = obj[name];
  if (typeof v === 'function') {
    const r = arg === undefined ? v.call(obj) : v.call(obj, arg);
    return r === undefined || r === null ? dflt : r;
  }
  return v === undefined || v === null ? dflt : v;
}

function askNum(obj, name, arg, dflt) {
  return numOf(ask(obj, name, arg, dflt), dflt);
}

function listOf(mod, ...names) {
  if (!mod) return [];
  for (let i = 0; i < names.length; i++) {
    const v = mod[names[i]];
    if (Array.isArray(v)) return v;
    if (typeof v === 'function') {
      const r = v.call(mod);
      if (Array.isArray(r)) return r;
    }
  }
  return [];
}

function buildingList(game) {
  return listOf(game.buildings, 'list', 'all', 'buildings', 'instances');
}

function villagerList(game) {
  return listOf(game.villagers, 'list', 'all', 'villagers', 'agents');
}

function findById(mod, arr, id) {
  if (id === undefined || id === null || id < 0) return null;
  if (mod) {
    if (typeof mod.byId === 'function') {
      const b = mod.byId(id);
      if (b) return b;
    }
    if (typeof mod.get === 'function') {
      const b = mod.get(id);
      if (b) return b;
    }
    if (mod.byIdMap && mod.byIdMap[id]) return mod.byIdMap[id];
  }
  for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
  return null;
}

function buildingById(game, id) {
  return findById(game.buildings, buildingList(game), id);
}

function villagerById(game, id) {
  return findById(game.villagers, villagerList(game), id);
}

/**
 * Why a repair cannot be offered on this building, or '' when it can.
 *
 * The reachability test is the same pair of cached fields
 * `buildings.repairState().deliverable` reads — never a second rule — so the
 * answer the inspector gives before a repair and the answer the simulation
 * gives during one are one answer. Walls and gates are refused outright: they
 * have no door by construction, and rebuilding a 1–2 wood section is the honest
 * remedy rather than a second materials path (AO3.4).
 */
function repairBlocker(b, def) {
  if (def && (def.wall || def.gate)) return 'wall';
  if (!b.connected) return 'no road';
  if (!(b.doorIdx >= 0)) return 'no door';
  return '';
}

function defOf(b) {
  return b ? BUILDING_BY_ID[b.defId] || null : null;
}

function buildingName(game, id) {
  const b = buildingById(game, id);
  const d = defOf(b);
  return d ? d.name : '';
}

/** §8's `v.state` may be the numeric enum or its name; normalise to the name. */
function stateName(v) {
  const s = v.state;
  if (typeof s === 'string') return s.toUpperCase();
  const n = VS_ORDER[s | 0];
  return n || 'IDLE';
}

function itemName(id) {
  const it = ITEMS[id];
  return it ? it.name : titleCase(id || '');
}

function itemIcon(id) {
  const it = ITEMS[id];
  return it ? it.icon : '•';
}

function itemColour(id) {
  const it = ITEMS[id];
  return it ? it.colour : '#8a7a63';
}

/** Compass name for a raid pass, whatever shape `passes` turns out to hold. */
function passName(p, gridW, gridH) {
  if (p === null || p === undefined) return 'a pass';
  if (typeof p === 'string') return /pass/i.test(p) ? p : p + ' Pass';
  if (typeof p.name === 'string') return /pass/i.test(p.name) ? p.name : p.name + ' Pass';
  const x = numOf(p.x, -1);
  const y = numOf(p.y, -1);
  if (x < 0 || y < 0) return 'a pass';
  const dx = x - gridW / 2;
  const dy = y - gridH / 2;
  const face = Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'East' : 'West')
    : (dy > 0 ? 'South' : 'North');
  return face + ' Pass';
}

function joinList(parts) {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/* ------------------------------------------------------------------ *
 * Plain-language descriptions
 * ------------------------------------------------------------------ */

/**
 * U3's patch floor for a gathering def, in words. Null for a def with no
 * floor — stone, clay and iron carry hundreds of units on one node, so a
 * single node is never futile there and no minimum is declared.
 */
function gatherNeed(def) {
  const g = def && def.gathers;
  const min = g && g.minPerDay > 0 ? g.minPerDay : 0;
  if (!min) return null;
  const what = itemName(g.item).toLowerCase();
  return {
    min,
    what,
    text: 'Needs a patch worth ' + fmtNum(min) + ' ' + what + ' a day — below that its'
      + ' own ' + (def.jobs || 2) + ' workers eat more than they pick.',
  };
}

/** Split `'no materials: flour'` into its ALERTS key and its parameter. */
function reasonParts(reason) {
  const colon = reason.indexOf(':');
  if (colon < 0) return { key: reason, arg: '' };
  return { key: reason.slice(0, colon).trim(), arg: reason.slice(colon + 1).trim() };
}

/**
 * Plain words plus a fix for an idle reason (§16.8). `b` sharpens the wording
 * when it is available; the generic form still stands alone. `cause` is
 * `UI.causeOf()`'s answer for `'cut off'` and is ignored for every other
 * reason — see the `'cut off'` branch for why it is worth threading through.
 */
function idleInfo(reason, b, cause) {
  const { key, arg } = reasonParts(reason || '');
  const base = IDLE_INFO[key];
  const alert = alertFor(reason);
  const out = {
    label: alert ? alert.label : titleCase(key),
    severity: alert ? alert.severity : 2,
    // Fall back to the ALERTS entry so a reason added in constants.js is
    // self-describing here without a matching IDLE_INFO row (§16.8).
    say: (base && base.say) || (alert && alert.say) || titleCase(key) + '.',
    fix: (base && base.fix) || (alert && alert.fix) || '',
  };
  const def = defOf(b);

  if (key === 'no materials' && arg) {
    const name = itemName(arg);
    out.label = 'Waiting on ' + name;
    out.say = 'No ' + name.toLowerCase() + ' has arrived yet.';
    out.fix = 'Make more ' + name.toLowerCase()
      + ', and check a road links the store holding it to this door.';
  } else if (key === 'resource exhausted' && def && def.gathers) {
    const info = RESOURCE_INFO[def.gathers.resource];
    const what = info && info.name ? info.name.toLowerCase() : 'deposits';
    out.say = 'No ' + what + ' left within ' + def.gathers.radius + ' tiles.';
    out.fix = 'Demolish it and rebuild beside a fresh ' + what.replace(/s$/, '')
      + ' deposit — the valley has more.';
  } else if (key === 'no storage') {
    const cls = storageClass(arg);
    if (cls) {
      out.label = 'No room left for ' + cls.name;
      out.say = 'Every store that takes ' + cls.name + ' is full.';
      out.fix = 'Build a ' + cls.store + ' — that is the ' + cls.name
        + ' store. Pausing whatever keeps making it buys time.';
    }
  } else if (key === 'output full' && def) {
    out.fix = 'Build a store that accepts what it makes, or staff a Stockpile'
      + ' so a porter is free to fetch it.';
  } else if (key === 'no road') {
    // The most common way a new town fails, and it looks like nothing (M3).
    out.label = 'No road — it produces nothing';
  } else if (key === 'cut off') {
    // The town usually seals itself in: §6 forbids cutting the diagonal
    // between two blocked tiles, so two of its own buildings meeting at a
    // corner close the last gap (E2). Saying "lay a road" there sends the
    // player to do the one thing that cannot work, so the culprit is named.
    const where = cause ? ' at ' + cause.x + ',' + cause.y : '';
    if (cause && cause.keep) {
      out.label = 'Cut off — the only way back runs through the ' + cause.name;
      out.say = 'A road reaches its door, but the last gap back to the town is closed'
        + ' by the ' + cause.name + where + ' itself.';
      out.fix = 'That one cannot come down. Rebuild this on the town’s side of it —'
        + ' more road will not open the gap.';
    } else if (cause && cause.kind === 'building') {
      const what = cause.name || 'building';
      out.label = 'Cut off — the ' + what + ' seals it in';
      out.say = 'A road reaches its door, but the ' + what + where
        + ' seals the only way out.';
      out.fix = 'Pull down the ' + what + where
        + '. No amount of road reopens a gap a building is standing in.';
    } else if (cause && cause.kind === 'ground' && cause.water) {
      out.label = 'Cut off — the water closes the gap';
      out.say = 'A road reaches its door, but water closes the last gap'
        + where + ' back to the town centre.';
      if (cause.bridgeOk) {
        out.fix = 'Lay a Bridge across' + where + ' — three planks spans it.'
          + ' Road alone stops at the bank.';
      } else {
        const t = TIERS[Math.max(0, (cause.bridgeTier || 2) - 1)];
        out.fix = 'Only a Bridge crosses water, and that unlocks at '
          + ((t && t.name) || 'the next tier')
          + '. Until then, rebuild on the town’s side.';
      }
    } else if (cause && cause.kind === 'ground') {
      out.label = 'Cut off — the valley wall closes the gap';
      out.say = 'A road reaches its door, but the valley wall closes the last gap'
        + where + ' back to the town centre.';
      out.fix = 'Nothing can be built through that ground — move these buildings'
        + ' round to the town’s side of it.';
    } else {
      out.label = 'Cut off from the town centre';
    }
  }
  return out;
}

/**
 * The villager inspector's headline (§13: "carrying 6 planks to the Bakery").
 * Plain words for what this person is doing right now, never a state enum.
 *
 * villagers.js knows two things `v.state` cannot say — a peacetime soldier is
 * 'patrolling', and which leg of a gather trip a walker is on — and its answer
 * wins in exactly those two cases. Everywhere else ours names the load, the
 * building and the recipe, and is the more useful line.
 */
function activityOf(v, game) {
  // A walker with no haul task is mid gather trip: ours would say "walking to
  // the Woodcutter's Hut" for a man walking away from it toward the trees.
  const patrolling = numOf(v.patrolTo, -1) >= 0;
  const gatherLeg = !v.task && stateName(v) === 'WALK';
  if (patrolling || gatherLeg) {
    const said = ask(game.villagers, 'activityText', v, '');
    if (typeof said === 'string' && said) return said;
  }
  return activityFromState(v, game);
}

function activityFromState(v, game) {
  const st = stateName(v);
  const carry = v.carry && v.carry.qty > 0 ? v.carry : null;
  const task = v.task || null;
  const jobName = buildingName(game, v.jobId);
  const def = v.jobId >= 0 ? defOf(buildingById(game, v.jobId)) : null;

  const load = carry
    ? carry.qty + ' ' + itemName(carry.item).toLowerCase()
    : task ? task.qty + ' ' + itemName(task.item).toLowerCase() : '';

  switch (st) {
    case 'HAUL_PICKUP': {
      const from = task ? buildingName(game, task.fromId) : '';
      if (load && from) return 'fetching ' + load + ' from the ' + from;
      if (from) return 'walking to the ' + from + ' to load up';
      return 'on the way to collect a load';
    }
    case 'HAUL_DROP': {
      const to = task ? buildingName(game, task.toId) : '';
      if (load && to) return 'carrying ' + load + ' to the ' + to;
      if (load) return 'carrying ' + load + ' across town';
      if (to) return 'delivering to the ' + to;
      return 'delivering a load';
    }
    case 'WALK': {
      if (task && task.toId >= 0 && carry) {
        return 'carrying ' + load + ' to the ' + buildingName(game, task.toId);
      }
      if (task && task.fromId >= 0) {
        return 'walking to the ' + buildingName(game, task.fromId) + ' for ' + load;
      }
      if (jobName) return 'walking to the ' + jobName;
      return 'walking across the valley';
    }
    case 'WORK': {
      if (v.role === 'builder') {
        const site = jobName || 'a building site';
        return 'raising the ' + site;
      }
      if (def && def.gathers) {
        const info = RESOURCE_INFO[def.gathers.resource];
        const what = info && info.item ? itemName(info.item).toLowerCase() : 'the land';
        return 'gathering ' + what + ' for the ' + jobName;
      }
      if (def && def.grows) {
        return 'tending the ' + jobName;
      }
      if (def && def.recipe) {
        const outs = Object.keys(def.recipe.out || {});
        const made = outs.length ? itemName(outs[0]).toLowerCase() : 'goods';
        return 'making ' + made + ' at the ' + jobName;
      }
      return jobName ? 'working at the ' + jobName : 'working';
    }
    case 'GO_HOME':
      return v.homeId >= 0 ? 'walking home to the ' + buildingName(game, v.homeId) : 'walking home';
    case 'SLEEP':
      return v.homeId >= 0 ? 'asleep at home' : 'asleep in the open — no bed';
    case 'GO_EAT':
      return 'hungry, heading in to eat';
    case 'FLEE':
      return 'fleeing from raiders';
    case 'FIGHT':
      return 'fighting raiders';
    case 'LEAVING':
      return 'leaving the valley for good';
    default:
      if (v.jobId >= 0 && jobName) return 'idle at the ' + jobName;
      if (carry) return 'standing about holding ' + load;
      return 'idle — no work to do';
  }
}

/* ------------------------------------------------------------------ *
 * Building art (inspector thumbnail, §13 "name, art")
 * ------------------------------------------------------------------ */

function paintBuildingArt(cv, def) {
  const w = 96;
  const h = 74;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!def) return;

  const pal = def.palette || { roof: '#8c5a4a', wall: '#cfc0a3', trim: '#6b5138' };
  const cx = w / 2;
  const baseY = h - 13;
  const hw = 30;
  const hh = 15;
  const wallH = def.w >= 3 ? 20 : 17;

  // Ground shadow, then the three faces (§1: left 12% darker, right 22%).
  ctx.fillStyle = 'rgba(40,30,20,0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 4, hw * 0.92, hh * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const topY = baseY - wallH;
  ctx.fillStyle = shade(pal.wall, -0.12);
  ctx.beginPath();
  ctx.moveTo(cx - hw, baseY - hh);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx, baseY - wallH);
  ctx.lineTo(cx - hw, topY - hh);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shade(pal.wall, -0.24);
  ctx.beginPath();
  ctx.moveTo(cx + hw, baseY - hh);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx, baseY - wallH);
  ctx.lineTo(cx + hw, topY - hh);
  ctx.closePath();
  ctx.fill();

  // Roof: a ridge for houses and halls, a flat cap for fields and walls.
  const flat = def.shape === 'field' || def.shape === 'wall' || def.shape === 'yard';
  if (flat) {
    ctx.fillStyle = pal.roof;
    ctx.beginPath();
    ctx.moveTo(cx, topY - hh * 2);
    ctx.lineTo(cx + hw, topY - hh);
    ctx.lineTo(cx, topY);
    ctx.lineTo(cx - hw, topY - hh);
    ctx.closePath();
    ctx.fill();
  } else {
    const peak = topY - hh - 16;
    ctx.fillStyle = pal.roof;
    ctx.beginPath();
    ctx.moveTo(cx - hw, topY - hh);
    ctx.lineTo(cx, topY - hh * 2);
    ctx.lineTo(cx, peak + hh);
    ctx.lineTo(cx - hw + 4, peak + hh + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(pal.roof, -0.2);
    ctx.beginPath();
    ctx.moveTo(cx + hw, topY - hh);
    ctx.lineTo(cx, topY - hh * 2);
    ctx.lineTo(cx, peak + hh);
    ctx.lineTo(cx + hw - 4, peak + hh + 6);
    ctx.closePath();
    ctx.fill();
  }

  // A warm lit window, the signature of the night art (§1).
  ctx.fillStyle = 'rgba(240,196,110,0.92)';
  ctx.fillRect(cx - 13, baseY - wallH + 4, 5, 6);
  ctx.fillStyle = 'rgba(240,196,110,0.55)';
  ctx.fillRect(cx + 8, baseY - wallH + 4, 5, 6);

  ctx.strokeStyle = pal.trim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - hw, baseY - hh);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx + hw, baseY - hh);
  ctx.stroke();
}

/* ------------------------------------------------------------------ *
 * UI
 * ------------------------------------------------------------------ */

class UI {
  constructor(game) {
    // Constructor must not read other modules (§12) — only stash the handle.
    this.game = game;
    this.root = null;
    this.built = false;

    this.now = 0;
    this.tAlerts = 0;
    this.tInspect = 0;
    this.tMenu = 0;
    this.tVariety = 0;

    this.activeCat = CATEGORIES[0].id;
    this.menuOpen = true;
    this.alertsOpen = true;
    this.overlays = { roads: false, happiness: false, food: false, raid: false };

    this.toasts = [];
    this.toastSeq = 0;

    this.alertGroups = [];
    this.alertSig = '';
    this.alertCursor = -1;
    this.alertOffset = new Map();

    // Next Milestone (ADDENDUM AJ). The gate list per tier is derived once and
    // kept until the tier moves, which happens a handful of times per game.
    this.milestoneOpen = true;
    this.msTier = -1;
    this.msConds = null;
    this.msNext = null;
    this.msRows = [];
    this.msRowsTier = -1;
    // Which top-bar meter the milestone is holding open, by hover and by click.
    this.peekHover = '';
    this.peekPin = '';
    this.varietyBrief = '';
    this.varietyWant = '';

    // `buildings.cutOffCause()` is a real search, not a field read, so its
    // answer is cached per building and thrown away wholesale when the map
    // changes under it — `world.rev` moves on every road, solid and clearing.
    this.causeCache = new Map();
    this.causeRev = -1;

    // Repair (ADDENDUM AO3). `damagedIds` and `repairCost` both allocate, so
    // the plan is built once on the alerts cadence and then read by the alerts
    // rows, the after-action report and Repair All alike.
    this.damagedScratch = [];
    this.repPlan = null;
    this.elRepair = null;
    this.fixSig = '';

    this.selKind = '';
    this.selId = -1;
    this.inspectSig = '';

    this.raid = null;        // {wave, arriveDay, passes, active, count}
    this.raidReport = null;  // after-action line, shown in the banner slot
    // What this raid has burned, kept so the report can name it. §11's
    // `building:destroyed` carries the name and the spot; a bare count strands
    // the player with nothing to rebuild from.
    this.raidLost = [];
    this.lostSig = '';
    this.lostChips = [];
    this.lostOffset = new Map();
    this.bannerHold = false;
    this.tierShown = 0;
    this.lastSpeed = 1;
    this.gameOver = false;

    this.varietySig = '';
    this.happySig = '';
    this.modalOpen = false;   // input.js leaves Escape alone while this is true
    this.menuCat = '';
    this.tierUpUntil = 0;
    this.unsubs = [];
    this.perfMs = 0;
  }

  /* -------------------------------------------------------------- *
   * Boot
   * -------------------------------------------------------------- */

  init() {
    if (this.built) return;
    this.built = true;
    this.buildDom();
    this.bindEvents();
    this.bindKeys();
    this.refreshBuildMenu(true);
    this.maybeShowIntro();
  }

  buildDom() {
    const root = el('div', 'hm-ui');
    root.id = 'hm-ui';
    this.root = root;

    this.buildTopBar(root);
    this.buildBanner(root);
    // Alerts and the milestone share one flex column so a long alert list
    // shortens itself rather than pushing the goal off the bottom of the screen.
    const left = el('div', 'hm-left');
    this.elLeft = left;
    root.appendChild(left);
    this.buildAlerts(left);
    this.buildMilestone(left);
    this.buildInspector(root);
    this.buildMenu(root);
    this.buildToasts(root);
    this.buildTooltip(root);
    this.buildModals(root);

    document.body.appendChild(root);
    this.watchTopHeight();
  }

  /* ---- top bar --------------------------------------------------- */

  buildTopBar(root) {
    const bar = el('div', 'hm-top');
    this.elTop = bar;

    // Left: tier, clock, speed.
    const left = el('div', 'hm-top-left');

    const brand = el('div', 'hm-brand');
    brand.appendChild(el('div', 'hm-brand-name', 'Hearthmere'));

    // ADDENDUM AJ and the playtest that followed it: the tier the town is
    // heading for sits beside the tier it is, from day one, so arriving is a
    // payoff the player watched coming and not a surprise. The panel below
    // carries the detail; this line is the part you cannot miss.
    const goal = el('button', 'hm-goal');
    goal.type = 'button';
    goal.addEventListener('click', () => this.showMilestone());
    this.elTier = el('span', 'hm-brand-tier', 'Hamlet');
    goal.appendChild(this.elTier);
    this.elGoalSep = el('span', 'hm-goal-sep', '→');
    goal.appendChild(this.elGoalSep);
    this.elGoalNext = el('span', 'hm-goal-next', '');
    goal.appendChild(this.elGoalNext);
    this.elGoalCount = el('span', 'hm-goal-count', '');
    goal.appendChild(this.elGoalCount);
    brand.appendChild(goal);
    const gtrack = el('div', 'hm-goal-track');
    this.elGoalFill = el('span', 'hm-goal-fill');
    gtrack.appendChild(this.elGoalFill);
    brand.appendChild(gtrack);
    this.elGoal = goal;
    left.appendChild(brand);

    const clockWrap = el('div', 'hm-clock');
    const dial = el('div', 'hm-dial');
    this.elHand = el('div', 'hm-dial-hand');
    dial.appendChild(this.elHand);
    dial.appendChild(el('div', 'hm-dial-pin'));
    clockWrap.appendChild(dial);
    const clockText = el('div', 'hm-clock-text');
    this.elDay = el('div', 'hm-clock-day', 'Day 1');
    this.elSeason = el('div', 'hm-clock-season', 'Spring · Year 1');
    clockText.appendChild(this.elDay);
    clockText.appendChild(this.elSeason);
    clockWrap.appendChild(clockText);
    left.appendChild(clockWrap);

    // Driven off SPEEDS, never a second copy of it: `game.speed` is an index
    // into that array, and adding a gear should not need a UI edit.
    const speeds = el('div', 'hm-speeds');
    this.elSpeedBtns = [];
    for (let i = 0; i < SPEEDS.length; i++) {
      const b = el('button', 'hm-speed', i === 0 ? '‖' : SPEEDS[i] + '×');
      b.type = 'button';
      b.title = i === 0 ? 'Pause (Space)' : SPEEDS[i] + '× speed (' + i + ')';
      b.addEventListener('click', () => this.setSpeed(i));
      speeds.appendChild(b);
      this.elSpeedBtns.push(b);
    }
    left.appendChild(speeds);
    bar.appendChild(left);

    // Centre: the four meters that answer "is the town all right?".
    const mid = el('div', 'hm-top-mid');

    this.mPop = this.makeMeter(mid, 'pop', '\u{1f465}', 'People');
    this.mFood = this.makeMeter(mid, 'food', '\u{1f35e}', 'Food');
    this.mHealth = this.makeMeter(mid, 'health', '⚕', 'Health');
    this.mHappy = this.makeMeter(mid, 'happy', '☺', 'Happiness');
    this.mCoin = this.makeMeter(mid, 'coin', '\u{1fa99}', 'Coin');

    // The health meter's variety breakdown (§13: "this must be one glance").
    const vpop = el('div', 'hm-variety');
    vpop.appendChild(el('div', 'hm-variety-title', 'Nutrition variety'));
    this.elVarietyGrid = el('div', 'hm-variety-grid');
    vpop.appendChild(this.elVarietyGrid);
    this.elVarietyNote = el('div', 'hm-variety-note', '');
    vpop.appendChild(this.elVarietyNote);
    this.elVarietyAte = el('div', 'hm-variety-ate', '');
    vpop.appendChild(this.elVarietyAte);
    this.elVarietyMiss = el('div', 'hm-variety-miss', '');
    vpop.appendChild(this.elVarietyMiss);
    vpop.appendChild(el('div', 'hm-variety-foot',
      'A food counts when four or more sit in a store, or when anyone in town ate it'
      + ' within ' + VARIETY_EATEN_DAYS + ' days. Dotted foods are ones people ate'
      + ' rather than ones the stores are holding.'));
    this.mHealth.box.appendChild(vpop);
    this.mHealth.box.classList.add('hm-has-pop');

    // The food meter explains the days figure on hover too.
    const fpop = el('div', 'hm-variety hm-variety-sm');
    fpop.appendChild(el('div', 'hm-variety-title', 'Days of food remaining'));
    this.elFoodNote = el('div', 'hm-variety-note', '');
    fpop.appendChild(this.elFoodNote);
    this.mFood.box.appendChild(fpop);
    this.mFood.box.classList.add('hm-has-pop');

    this.buildHappyPop();

    bar.appendChild(mid);

    // Right: key goods.
    // Every candidate good gets a node once; the tier decides which are shown
    // and which read as locked (AK2), and each carries its own "where does this
    // come from" hover (AK3).
    const right = el('div', 'hm-top-right');
    this.goodEls = {};
    for (let i = 0; i < HUD_GOODS.length; i++) {
      const id = HUD_GOODS[i];
      const g = el('div', 'hm-good hm-has-pop');
      g.appendChild(el('span', 'hm-good-icon', itemIcon(id)));
      const vv = el('span', 'hm-good-val', '0');
      g.appendChild(vv);
      // What pending sites have claimed, shown rather than silently subtracted.
      const rs = el('span', 'hm-good-res', '');
      g.appendChild(rs);

      const pop = el('div', 'hm-variety hm-variety-sm hm-good-pop');
      pop.appendChild(el('div', 'hm-variety-title', itemName(id)));
      const have = el('div', 'hm-good-have', '');
      pop.appendChild(have);
      const lock = el('div', 'hm-good-lock', '');
      pop.appendChild(lock);
      const from = el('div', 'hm-variety-note', '');
      pop.appendChild(from);
      const use = el('div', 'hm-variety-note', '');
      pop.appendChild(use);
      const into = el('div', 'hm-variety-note', '');
      pop.appendChild(into);
      g.appendChild(pop);

      right.appendChild(g);
      this.goodEls[id] = { box: g, val: vv, res: rs, have, lock, from, use, into };
    }
    this.goodsTier = -1;
    bar.appendChild(right);

    root.appendChild(bar);
  }

  /**
   * The happiness meter's breakdown (§17.1). Rows are built once and only ever
   * patched, like every other panel here.
   */
  buildHappyPop() {
    const pop = el('div', 'hm-variety hm-variety-happy');
    pop.appendChild(el('div', 'hm-variety-title', 'Why the town feels this way'));
    this.elHappySum = el('div', 'hm-hsum', '');
    pop.appendChild(this.elHappySum);

    const rows = el('div', 'hm-hrows');
    this.happyRows = [];
    for (let i = 0; i < HAPPY_PARTS.length; i++) {
      const p = HAPPY_PARTS[i];
      const row = el('div', 'hm-hrow');
      row.appendChild(el('span', 'hm-hname', p.name));
      const track = el('span', 'hm-htrack');
      const fill = el('span', 'hm-hfill');
      track.appendChild(fill);
      row.appendChild(track);
      const val = el('span', 'hm-hval', '');
      row.appendChild(val);
      rows.appendChild(row);
      this.happyRows.push({ row, fill, val, def: p });
    }
    pop.appendChild(rows);

    this.elHappyFix = el('div', 'hm-variety-note', '');
    pop.appendChild(this.elHappyFix);
    pop.appendChild(el('div', 'hm-variety-foot',
      'Everyone starts at 45. Homes, a market in reach and civic buildings add to'
      + ' that; hunger, homelessness, idleness, grief and unpaid wages take it away.'
      + ' Above 55 migrants come; below 25 people leave.'));
    this.mHappy.box.appendChild(pop);
    this.mHappy.box.classList.add('hm-has-pop');
  }

  /** Panels position themselves below the top bar, whatever height it lands at. */
  watchTopHeight() {
    const apply = () => {
      const h = Math.round(this.elTop.getBoundingClientRect().height);
      if (h > 0 && h !== this.topH) {
        this.topH = h;
        this.root.style.setProperty('--hm-top-h', h + 'px');
      }
    };
    apply();
    if (typeof ResizeObserver === 'function') {
      this.topObserver = new ResizeObserver(apply);
      this.topObserver.observe(this.elTop);
    } else {
      window.addEventListener('resize', apply);
    }
  }

  makeMeter(parent, kind, icon, label) {
    const box = el('div', 'hm-meter hm-meter-' + kind);
    const head = el('div', 'hm-meter-head');
    head.appendChild(el('span', 'hm-meter-icon', icon));
    head.appendChild(el('span', 'hm-meter-label', label));
    box.appendChild(head);
    const val = el('div', 'hm-meter-val', '0');
    box.appendChild(val);
    const sub = el('div', 'hm-meter-sub', '');
    box.appendChild(sub);
    const track = el('div', 'hm-meter-track');
    const fill = el('div', 'hm-meter-fill');
    track.appendChild(fill);
    box.appendChild(track);
    parent.appendChild(box);
    return { box, val, sub, fill, track };
  }

  /* ---- raid banner ----------------------------------------------- */

  buildBanner(root) {
    const b = el('div', 'hm-banner');
    this.elBannerIcon = el('span', 'hm-banner-icon', '⚔');
    this.elBannerMain = el('span', 'hm-banner-main', '');
    this.elBannerSub = el('span', 'hm-banner-sub', '');
    b.appendChild(this.elBannerIcon);
    b.appendChild(this.elBannerMain);
    b.appendChild(this.elBannerSub);
    this.elBannerLost = el('div', 'hm-banner-lost');
    b.appendChild(this.elBannerLost);
    // AO3. The report names what burned; this is the other half of the same
    // question — what is still standing and hurt, and the single click that
    // puts it right.
    this.elBannerFix = el('div', 'hm-banner-fix');
    this.elFixAll = el('button', 'hm-fixall', '');
    this.elFixAll.type = 'button';
    this.elFixAll.addEventListener('click', () => this.repairAll());
    this.elBannerFix.appendChild(this.elFixAll);
    this.elBannerFix.style.display = 'none';
    b.appendChild(this.elBannerFix);
    // The report is worth reading twice, so hovering it stops the clock.
    b.addEventListener('mouseenter', () => { this.bannerHold = true; });
    b.addEventListener('mouseleave', () => { this.bannerHold = false; });
    b.style.display = 'none';
    this.elBanner = b;
    root.appendChild(b);
  }

  /* ---- alerts ---------------------------------------------------- */

  buildAlerts(root) {
    const p = el('aside', 'hm-panel hm-alerts');
    const head = el('div', 'hm-panel-head');
    head.appendChild(el('span', 'hm-panel-title', 'Alerts'));
    this.elAlertCount = el('span', 'hm-pill', '0');
    head.appendChild(this.elAlertCount);
    const fold = el('button', 'hm-fold', '–');
    fold.type = 'button';
    fold.title = 'Collapse';
    fold.addEventListener('click', () => {
      this.alertsOpen = !this.alertsOpen;
      setToggle(p, 'hm-collapsed', !this.alertsOpen);
      fold.textContent = this.alertsOpen ? '–' : '+';
    });
    head.appendChild(fold);
    p.appendChild(head);

    this.elAlertList = el('div', 'hm-alert-list');
    p.appendChild(this.elAlertList);
    this.elAlertEmpty = el('div', 'hm-alert-empty',
      'Nothing is wrong. Spend the quiet: a road, a food you do not have yet, or a wall.');
    p.appendChild(this.elAlertEmpty);
    p.appendChild(el('div', 'hm-panel-foot', 'Click an alert to fly to it · , . to cycle'));

    this.elAlerts = p;
    this.alertRows = [];
    root.appendChild(p);
  }


  /* ---- next milestone -------------------------------------------- */

  /**
   * ADDENDUM AJ. The alerts panel says what is broken; this says what the town
   * is working toward, so the quiet after the last alert still holds a
   * decision (§17). Built once; only ever patched.
   */
  buildMilestone(root) {
    const p = el('aside', 'hm-panel hm-milestone');
    const head = el('div', 'hm-panel-head');
    this.elMsTitle = el('span', 'hm-panel-title', 'Next Milestone');
    head.appendChild(this.elMsTitle);
    this.elMsPill = el('span', 'hm-pill', '');
    head.appendChild(this.elMsPill);
    const fold = el('button', 'hm-fold', '–');
    fold.type = 'button';
    fold.title = 'Collapse';
    fold.addEventListener('click', () => {
      this.milestoneOpen = !this.milestoneOpen;
      setToggle(p, 'hm-collapsed', !this.milestoneOpen);
      fold.textContent = this.milestoneOpen ? '–' : '+';
    });
    head.appendChild(fold);
    this.elMsFold = fold;
    p.appendChild(head);

    const body = el('div', 'hm-ms-body');
    this.elMsLede = el('div', 'hm-ms-lede', '');
    body.appendChild(this.elMsLede);
    const track = el('div', 'hm-ms-prog');
    this.elMsProg = el('span', 'hm-ms-prog-fill');
    track.appendChild(this.elMsProg);
    body.appendChild(track);
    this.elMsCount = el('div', 'hm-ms-count', '');
    body.appendChild(this.elMsCount);
    this.elMsRows = el('div', 'hm-ms-rows');
    body.appendChild(this.elMsRows);
    p.appendChild(body);

    this.elMsFoot = el('div', 'hm-panel-foot', '');
    p.appendChild(this.elMsFoot);

    this.elMilestone = p;
    setToggle(p, 'hm-collapsed', !this.milestoneOpen);
    root.appendChild(p);
  }

  /* ---- inspector -------------------------------------------------- */

  buildInspector(root) {
    const p = el('aside', 'hm-panel hm-inspector');
    const head = el('div', 'hm-panel-head');
    this.elInspTitle = el('span', 'hm-panel-title', 'Inspector');
    head.appendChild(this.elInspTitle);
    this.elInspTier = el('span', 'hm-pill', '');
    head.appendChild(this.elInspTier);
    const close = el('button', 'hm-fold', '×');
    close.type = 'button';
    close.title = 'Close (Esc)';
    close.addEventListener('click', () => this.clearSelection());
    head.appendChild(close);
    p.appendChild(head);

    this.elInspBody = el('div', 'hm-insp-body');
    p.appendChild(this.elInspBody);

    p.style.display = 'none';
    this.elInspector = p;
    root.appendChild(p);
  }

  /* ---- build menu -------------------------------------------------- */

  buildMenu(root) {
    const p = el('div', 'hm-panel hm-build');

    const tabs = el('div', 'hm-tabs');
    this.catTabs = {};
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const t = el('button', 'hm-tab', c.name);
      t.type = 'button';
      t.addEventListener('click', () => {
        this.activeCat = c.id;
        this.refreshBuildMenu(true);
      });
      tabs.appendChild(t);
      this.catTabs[c.id] = t;
    }
    this.buildOverlayBar(tabs);
    const fold = el('button', 'hm-tab hm-tab-fold', 'Hide · M');
    fold.type = 'button';
    fold.addEventListener('click', () => this.toggleMenu());
    tabs.appendChild(fold);
    this.elMenuFold = fold;
    p.appendChild(tabs);

    this.elGrid = el('div', 'hm-grid');
    p.appendChild(this.elGrid);

    this.elBuild = p;
    this.entryEls = new Map();
    root.appendChild(p);
  }

  /* ---- overlay toggles ---------------------------------------------- */

  // The overlay toggles ride in the build menu's tab row: it is the one strip
  // that is always on screen and never collides with a side panel.
  buildOverlayBar(parent) {
    const bar = el('div', 'hm-overlays');
    bar.appendChild(el('span', 'hm-overlays-label', 'Overlays'));
    this.overlayBtns = {};
    for (let i = 0; i < OVERLAYS.length; i++) {
      const o = OVERLAYS[i];
      const b = el('button', 'hm-ov', '');
      b.type = 'button';
      b.appendChild(el('span', 'hm-ov-key', '⇧' + (i + 1)));
      b.appendChild(el('span', 'hm-ov-name', o.name));
      b.title = o.hint + '  (Shift+' + (i + 1) + ')';
      b.addEventListener('click', () => this.toggleOverlay(o.id));
      bar.appendChild(b);
      this.overlayBtns[o.id] = b;
    }
    this.elOverlayBar = bar;
    parent.appendChild(bar);
  }

  /* ---- toasts, tooltip, modals -------------------------------------- */

  buildToasts(root) {
    this.elToasts = el('div', 'hm-toasts');
    root.appendChild(this.elToasts);
  }

  buildTooltip(root) {
    this.elTip = el('div', 'hm-tip');
    this.elTip.style.display = 'none';
    root.appendChild(this.elTip);
  }

  buildModals(root) {
    const shade_ = el('div', 'hm-modal-shade');
    shade_.style.display = 'none';
    const box = el('div', 'hm-modal');
    shade_.appendChild(box);
    this.elModalShade = shade_;
    this.elModal = box;
    root.appendChild(shade_);

    // Tier-up celebration (§17: "does unlocking a tier feel like an event?").
    const t = el('div', 'hm-tierup');
    t.style.display = 'none';
    this.elTierUp = t;
    this.elTierUpName = el('div', 'hm-tierup-name', '');
    this.elTierUpSub = el('div', 'hm-tierup-sub', '');
    this.elTierUpList = el('div', 'hm-tierup-list', '');
    const inner = el('div', 'hm-tierup-inner');
    inner.appendChild(el('div', 'hm-tierup-kicker', 'The valley grows'));
    inner.appendChild(this.elTierUpName);
    inner.appendChild(el('div', 'hm-tierup-rule'));
    inner.appendChild(this.elTierUpSub);
    inner.appendChild(this.elTierUpList);
    t.appendChild(inner);
    root.appendChild(t);
  }

  /* -------------------------------------------------------------- *
   * Event + key wiring
   * -------------------------------------------------------------- */

  bindEvents() {
    const bus = this.game.bus;
    if (!bus) return;
    const on = (name, fn) => this.unsubs.push(bus.on(name, fn));

    // §11: `toast` is the ONLY way any module shows a message, and this is
    // the only listener for it.
    on('toast', (p) => this.toast(p && p.text, p && p.kind));

    on('tier:changed', (p) => this.celebrateTier(p));
    on('raid:warned', (p) => this.onRaidWarned(p));
    on('raid:started', (p) => this.onRaidStarted(p));
    on('raid:ended', (p) => this.onRaidEnded(p));
    on('select:changed', () => { this.inspectSig = ''; this.tInspect = 0; });
    on('building:destroyed', (p) => {
      if (this.selKind === 'building' && p && p.id === this.selId) this.clearSelection();
      this.alertSig = '';
      if (p && p.byRaid && this.raidLost.length < 60) {
        const d = BUILDING_BY_ID[p.defId];
        this.raidLost.push({
          defId: p.defId,
          name: d ? d.name : titleCase(String(p.defId || 'building')),
          x: numOf(p.x, 0),
          y: numOf(p.y, 0),
        });
      }
    });
    // AO3. `building:damaged` is deliberately not listened for: a raid streams
    // hits, and every panel that cares already carries the damage in its own
    // signature — the alerts rows count the damaged set, and the inspector's
    // structural signature carries the damage block's shape.
    on('building:repaired', (p) => {
      this.alertSig = '';
      const d = p && BUILDING_BY_ID[p.defId];
      this.toast('The ' + (d ? d.name : 'building') + ' is whole again.', 'good');
    });
    on('building:completed', () => { this.alertSig = ''; this.tMenu = 0; });
    on('building:placed', () => { this.alertSig = ''; });
    on('day:ended', () => { this.alertSig = ''; this.tVariety = 0; });
    on('game:over', (p) => this.showGameOver(p));
  }

  bindKeys() {
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
  }

  handleKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key;
    // F2: a modal owns input while it is up. Escape dismisses it; nothing else
    // reaches the game, so tapping past the intro cannot arm a tool or pause.
    if (this.modalOpen) {
      if (k === 'Escape') {
        this.closeModal();
        e.preventDefault();
      }
      return;
    }
    if (e.shiftKey) {
      // Overlays live on Shift+1..4 — see the note on OVERLAYS.
      const n = '!@#$'.indexOf(k);
      const d = '1234'.indexOf(k);
      const i = n >= 0 ? n : d;
      if (i >= 0 && i < OVERLAYS.length) {
        this.toggleOverlay(OVERLAYS[i].id);
        e.preventDefault();
      }
      return;
    }
    if (k === 'F1' || k === 'F2' || k === 'F3' || k === 'F4') {
      this.toggleOverlay(OVERLAYS[Number(k.slice(1)) - 1].id);
      e.preventDefault();
      return;
    }

    // Bare digits are the gears, one per SPEEDS entry above pause (F1).
    if (k >= '1' && k <= '9') {
      const n = Number(k);
      if (n < SPEEDS.length) { this.setSpeed(n); return; }
    }

    switch (k) {
      case ' ':
        this.togglePause();
        e.preventDefault();
        break;
      case 'r': case 'R': this.chooseRoad(); break;
      case 'm': case 'M': this.toggleMenu(); break;
      case 'Delete': case 'Backspace':
        this.setTool('demolish', null);
        this.toast('Demolish tool — click a building to pull it down.', 'warn');
        e.preventDefault();
        break;
      case 'Escape':
        // F2 backs out one step at a time (drag, then tool, then selection);
        // input.js owns that ladder because it is the one holding the drag.
        this.cancelTool();
        break;
      case ',': this.cycleAlert(-1); break;
      case '.': this.cycleAlert(1); break;
      default: break;
    }
  }

  /* -------------------------------------------------------------- *
   * Command methods on other modules (§2: never mutate, always ask)
   * -------------------------------------------------------------- */

  /**
   * `n` is a gear — an index into SPEEDS. `game.speed` is the multiplier the
   * loop scales dt by, so the two are only the same number below 4×; every
   * gear is translated here rather than anywhere else.
   */
  setSpeed(n) {
    const game = this.game;
    const gear = n < 0 ? 0 : n >= SPEEDS.length ? SPEEDS.length - 1 : n | 0;
    const mult = SPEEDS[gear];
    if (gear > 0) this.lastSpeed = gear;
    if (typeof game.setSpeed === 'function') game.setSpeed(mult);
    else game.speed = mult;              // the loop's own field, not sim state
    if (typeof game.setSpeed !== 'function') {
      if (game.state === 'playing' || game.state === 'paused') {
        game.state = mult === 0 ? 'paused' : 'playing';
      }
    }
  }

  /** The gear currently running, found by multiplier — see setSpeed. */
  gearNow() {
    const mult = numOf(this.game.speed, 1);
    for (let i = SPEEDS.length - 1; i > 0; i--) if (mult >= SPEEDS[i]) return i;
    return 0;
  }

  togglePause() {
    this.setSpeed(numOf(this.game.speed, 1) === 0 ? this.lastSpeed || 1 : 0);
  }

  setTool(kind, defId) {
    const input = this.game.input;
    if (!input) return;
    if (typeof input.setTool === 'function') input.setTool(kind, defId);
    else input.tool = defId ? { kind, defId } : { kind };
    this.tMenu = 0;
  }

  /** Esc: hand the one-step-at-a-time backout to whoever holds the drag. */
  cancelTool() {
    if (this.peekPin) { this.peekPin = ''; this.syncPeek(); }
    const input = this.game.input;
    if (input && typeof input.cancel === 'function') { input.cancel(); return; }
    if (this.currentToolDef()) this.setTool('select', null);
    else this.clearSelection();
  }

  /** `R`: dirt path, then cobbled road once it unlocks. input.js keeps the phase. */
  chooseRoad() {
    const input = this.game.input;
    const cobbled = BUILDING_BY_ID.road;
    const allowed = !!cobbled && cobbled.tier <= this.tierNow();
    let id = 'path';
    if (input && typeof input.nextRoadTool === 'function') id = input.nextRoadTool(allowed);
    else if (allowed && this.currentToolDef() === 'path') id = 'road';
    this.chooseBuild(id);
  }

  chooseBuild(defId) {
    const def = BUILDING_BY_ID[defId];
    if (!def) return;
    if (def.tier > this.tierNow()) {
      const t = TIERS[def.tier - 1];
      this.toast(def.name + ' unlocks at ' + (t ? t.name : 'tier ' + def.tier) + '.', 'warn');
      return;
    }
    // A unique, pre-placed building has no second copy to place: clicking the
    // map with it armed did nothing at all, which reads as a broken game.
    if (def.unique === true || def.prePlaced === true) {
      this.toast('There is only one ' + def.name + ', and the valley already has it.', 'warn');
      return;
    }
    this.setTool('build', defId);
  }

  currentToolDef() {
    const t = this.game.input && this.game.input.tool;
    if (!t) return null;
    if (typeof t === 'string') return t === 'select' ? null : t;
    return t.defId || t.id || (t.kind && t.kind !== 'select' ? t.kind : null);
  }

  panTo(x, y) {
    const input = this.game.input;
    if (!input) return;
    if (typeof input.panTo === 'function') input.panTo(x, y);
    else if (typeof input.centerOn === 'function') input.centerOn(x, y);
    else if (typeof input.focusTile === 'function') input.focusTile(x, y);
  }

  select(kind, id) {
    const input = this.game.input;
    this.selKind = kind;
    this.selId = id;
    this.inspectSig = '';
    if (input && typeof input.select === 'function') input.select(kind, id);
    else if (input) input.selected = { kind, id };
    if (this.game.bus) this.game.bus.emit('select:changed', { kind, id });
  }

  clearSelection() {
    const input = this.game.input;
    this.selKind = '';
    this.selId = -1;
    this.inspectSig = '';
    if (input && typeof input.clearSelection === 'function') input.clearSelection();
    else if (input && typeof input.select === 'function') input.select('', -1);
    else if (input) input.selected = { kind: '', id: -1 };
    this.elInspector.style.display = 'none';
    if (this.game.bus) this.game.bus.emit('select:changed', { kind: '', id: -1 });
  }

  toggleOverlay(id) {
    const on = !this.overlays[id];
    this.overlays[id] = on;
    const r = this.game.render;
    if (r) {
      if (typeof r.setOverlay === 'function') r.setOverlay(id, on);
      else if (r.overlays) r.overlays[id] = on;
      else r.overlays = Object.assign({}, this.overlays);
    }
    setToggle(this.overlayBtns[id], 'on', on);
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    setToggle(this.elBuild, 'hm-collapsed', !this.menuOpen);
    this.elMenuFold.textContent = this.menuOpen ? 'Hide · M' : 'Build · M';
  }

  /* -------------------------------------------------------------- *
   * Frame update — diffing only, never a rebuild (§2, 60fps)
   * -------------------------------------------------------------- */

  update(dt, game) {
    if (!this.built) return;
    const t0 = perfNow();
    this.game = game || this.game;
    this.now += dt;
    const wall = t0;

    this.updateTopBar(wall);
    this.updateBanner(wall);
    this.updateToasts(wall);
    this.updateTierUp(wall);
    this.pollSelection();

    if (wall - this.tAlerts > 280) {
      this.tAlerts = wall;
      this.updateAlerts();
      this.updateMilestone();
    }
    if (wall - this.tInspect > 220) {
      this.tInspect = wall;
      this.updateInspector();
    } else if (this.selKind === 'villager') {
      // Everything else in the inspector can wait 220ms; the activity line is
      // the one thing the player watches tick by tick, so it never lags.
      this.refreshActivity();
    }
    if (wall - this.tMenu > 400) {
      this.tMenu = wall;
      this.refreshBuildMenu(false);
    }

    this.perfMs = this.perfMs * 0.9 + (perfNow() - t0) * 0.1;
  }

  /* ---- top bar ----------------------------------------------------- */

  updateTopBar(wall) {
    const game = this.game;
    const eco = game.economy;
    const clock = (game.world && game.world.clock) || { day: 1, timeOfDay: 0.3, season: 0, year: 1 };

    // Clock + season.
    setText(this.elDay, 'Day ' + numOf(clock.day, 1));
    const season = clamp(numOf(clock.season, 0) | 0, 0, 3);
    setText(this.elSeason, SEASON_NAMES[season] + ' · Year ' + numOf(clock.year, 1));
    setCls(this.elSeason, 'hm-clock-season hm-s-' + SEASON_CLASS[season]);
    const ang = Math.round(numOf(clock.timeOfDay, 0) * 360);
    setStyle(this.elHand, 'transform', 'rotate(' + ang + 'deg)');

    // Speed buttons.
    const gear = this.gearNow();
    for (let i = 0; i < this.elSpeedBtns.length; i++) {
      setToggle(this.elSpeedBtns[i], 'on', i === gear);
    }

    // Tier.
    const tier = this.tierNow();
    const tdef = TIERS[tier - 1] || TIERS[0];
    setText(this.elTier, tdef.name);

    // Population.
    const pop = this.population();
    const cap = askNum(eco, 'housingCapacity', undefined,
      askNum(eco, 'housing', undefined, askNum(eco, 'capacity', undefined, 0)));
    const employed = askNum(eco, 'employed', undefined, -1);
    const idle = askNum(eco, 'unemployed', undefined,
      employed >= 0 ? Math.max(0, pop - employed) : -1);
    setText(this.mPop.val, pop + ' / ' + (cap > 0 ? cap : '—'));
    setText(this.mPop.sub, employed >= 0
      ? employed + ' working · ' + Math.max(0, idle) + ' idle'
      : 'villagers in the valley');
    const popFill = cap > 0 ? clamp(pop / cap, 0, 1) : 0;
    setStyle(this.mPop.fill, 'width', Math.round(popFill * 100) + '%');
    setCls(this.mPop.fill, 'hm-meter-fill' + (cap > 0 && pop >= cap ? ' warn' : ''));
    setToggle(this.mPop.box, 'alarm', pop >= MAX_VILLAGERS);

    // Food — days remaining is the number players act on (§13).
    const foodUnits = askNum(eco, 'foodUnits', undefined, askNum(eco, 'food', undefined, 0));
    const days = askNum(eco, 'daysOfFood', undefined, -1);
    setText(this.mFood.val, days >= 0 ? fmtDays(days) : fmtNum(foodUnits));
    setText(this.mFood.sub, fmtNum(foodUnits) + ' food units stored');
    const foodState = days < 0 ? '' : days < 2 ? ' bad' : days < 5 ? ' warn' : ' good';
    setCls(this.mFood.fill, 'hm-meter-fill' + foodState);
    setStyle(this.mFood.fill, 'width', Math.round(clamp(days / 12, 0, 1) * 100) + '%');
    setCls(this.mFood.val, 'hm-meter-val' + foodState);
    setToggle(this.mFood.box, 'alarm', days >= 0 && days < 2);

    // Health + happiness.
    const health = askNum(eco, 'townHealth', undefined, askNum(eco, 'health', undefined, 0));
    setText(this.mHealth.val, Math.round(health));
    setStyle(this.mHealth.fill, 'width', Math.round(clamp(health / 100, 0, 1) * 100) + '%');
    const hState = health < 35 ? ' bad' : health < 55 ? ' warn' : ' good';
    setCls(this.mHealth.fill, 'hm-meter-fill' + hState);
    setCls(this.mHealth.val, 'hm-meter-val' + hState);

    const happy = askNum(eco, 'happiness', undefined, 0);
    setText(this.mHappy.val, Math.round(happy));
    setStyle(this.mHappy.fill, 'width', Math.round(clamp(happy / 100, 0, 1) * 100) + '%');
    const pState = happy < 25 ? ' bad' : happy < 45 ? ' warn' : ' good';
    setCls(this.mHappy.fill, 'hm-meter-fill' + pState);
    setCls(this.mHappy.val, 'hm-meter-val' + pState);
    setText(this.mHappy.sub, happy >= 55 ? 'migrants will come' : happy < 25 ? 'people are leaving' : 'settled');

    const coin = askNum(eco, 'coin', undefined, this.stock('coin'));
    setText(this.mCoin.val, fmtNum(coin));
    setText(this.mCoin.sub, coin < 1 ? 'treasury empty' : 'in the treasury');
    setCls(this.mCoin.val, 'hm-meter-val' + (coin < 1 ? ' bad' : ''));
    setStyle(this.mCoin.fill, 'width', Math.round(clamp(coin / 200, 0, 1) * 100) + '%');

    this.updateGoods(tier);

    // The two hover breakdowns walk tables, so they run twice a second, not 60.
    if (wall - this.tVariety > 500) {
      this.tVariety = wall;
      this.updateVariety(health, days, foodUnits, pop);
      this.updateHappyPop(happy);
    }
  }

  /**
   * ADDENDUM AK2 + AK3. The row is rebuilt only when the tier moves: which
   * goods are shown, which read as locked, and every word of their hovers all
   * depend on the tier alone. Only the counts run every frame.
   */
  updateGoods(tier) {
    if (this.goodsTier !== tier) {
      this.goodsTier = tier;
      // `obtainableAt` is the simulation's own reachability rule, chains and
      // build costs included — the UI must never invent a second one.
      const now = obtainableAt(tier);
      const soon = obtainableAt(tier + 1);
      const src = goodSources();
      for (let i = 0; i < HUD_GOODS.length; i++) {
        const id = HUD_GOODS[i];
        const e = this.goodEls[id];
        const canGet = now.has(id);
        e.canGet = canGet;
        e.shown = canGet || soon.has(id);
        e.box.style.display = e.shown ? '' : 'none';
        if (!e.shown) continue;

        const rec = src[id] || { from: [], use: [], into: [] };
        const openNow = rec.from.filter((d) => d.tier <= tier);
        // The gate is the tier of the earliest building that makes the item,
        // never the item's own tier: planks are a tier-1 good you start with
        // and cannot make again until the Sawmill at Village.
        const gate = TIERS[Math.max(0, earliestTier(rec.from) - 1)];
        e.gate = gate ? 'Locked until ' + gate.name + '.' : 'Nothing makes it.';
        setText(e.from, rec.from.length === 0
          ? 'Nothing in the valley makes it.'
          : openNow.length
            ? 'From: ' + defNames(openNow, 3)
            : 'From: ' + defNames(rec.from, 2) + ' (' + (gate ? gate.name : 'later') + ')');
        setText(e.use, rec.use.length ? 'Builds: ' + defNames(rec.use, 3) : '');
        setText(e.into, rec.into.length ? 'Feeds: ' + defNames(rec.into, 3) : '');
      }
    }

    for (let i = 0; i < HUD_GOODS.length; i++) {
      const id = HUD_GOODS[i];
      const e = this.goodEls[id];
      if (!e.shown) continue;
      const total = this.stock(id);
      const res = this.reserved(id);
      const free = this.available(id);
      // AK2: a counter at 0 means "you ran out". One that cannot move again
      // until a later tier says so instead, rather than sitting there as a zero.
      // Stock, not available: sixty stone all promised is committed, not locked.
      const locked = !e.canGet && total <= 0;
      setToggle(e.box, 'locked', locked);
      setToggle(e.box, 'committed', !locked && res > 0);
      setText(e.lock, locked ? e.gate : '');
      setText(e.val, locked ? '\u{1f512}' : fmtNum(free));
      setText(e.res, !locked && res > 0 ? '+' + fmtNum(res) : '');
      const have = res > 0
        ? fmtNum(free) + ' free \u00b7 ' + fmtNum(res) + ' promised to build sites \u00b7 '
          + fmtNum(total) + ' in store'
        : fmtNum(total) + ' in store';
      setText(e.have, have);
      const t = itemName(id) + ' \u2014 ' + (locked ? 'locked' : have);
      if (e.box.title !== t) e.box.title = t;
    }
  }

  /**
   * L2 — the qualifying set is economy's answer and is never re-derived here.
   * Deriving one rule twice is how the meter and the health number come apart,
   * and the player believes the meter.
   */
  updateVariety(health, days, foodUnits, pop) {
    const eco = this.game.economy;
    const nut = (eco && eco.nutrition) || null;
    const byGroup = (nut && nut.byGroup) || [];
    const items = (nut && nut.items) || [];
    const distinctItems = numOf(nut && nut.distinctItems, 0);
    const distinctGroups = numOf(nut && nut.distinctGroups, 0);
    const score = numOf(nut && nut.varietyScore, 0);

    // A qualifying food with fewer than 4 in store qualifies by having been
    // eaten (L2) — since J2 that is most of a working larder, so it is marked
    // rather than hidden. The mark belongs in the signature: without it the
    // chips go stale when a food swaps which half of the rule it passes.
    const eaten = {};
    let setSig = '';
    for (let i = 0; i < items.length; i++) {
      const id = items[i];
      const byEating = askNum(eco, 'stored', id, 0) < 4;
      if (byEating) eaten[id] = 1;
      setSig += (i ? ',' : '') + id + (byEating ? '*' : '');
    }

    const sig = distinctItems + '|' + distinctGroups + '|' + setSig;
    if (sig !== this.varietySig) {
      this.varietySig = sig;
      clearNode(this.elVarietyGrid);
      for (let i = 0; i < FOOD_GROUPS.length; i++) {
        const g = FOOD_GROUPS[i];
        const ids = byGroup[i] || [];
        const chip = el('div', 'hm-vgroup' + (ids.length ? ' on' : ''));
        const dot = el('span', 'hm-vdot');
        dot.style.background = ids.length ? g.colour : 'transparent';
        dot.style.borderColor = g.colour;
        chip.appendChild(dot);
        chip.appendChild(el('span', 'hm-vname', g.name));
        const list = el('span', 'hm-vlist');
        if (ids.length === 0) {
          list.textContent = 'missing';
        } else {
          for (let k = 0; k < ids.length; k++) {
            if (k) list.appendChild(document.createTextNode(', '));
            const one = el('span', 'hm-vitem' + (eaten[ids[k]] ? ' eaten' : ''), itemName(ids[k]));
            one.title = eaten[ids[k]]
              ? 'Counts because the town ate it, not because it is in store'
              : 'Four or more of these are in store';
            list.appendChild(one);
          }
        }
        chip.appendChild(list);
        this.elVarietyGrid.appendChild(chip);
      }
    }

    const target = numOf(eco && eco.healthTarget, 22 + score * 0.62);
    setText(this.elVarietyNote,
      distinctGroups + ' of 6 groups · ' + distinctItems + ' distinct foods · variety '
      + Math.round(score) + '/100. Health is ' + Math.round(health)
      + ' and settling toward ' + Math.round(clamp(target, 0, 100)) + '.');
    setText(this.elVarietyAte, this.eatenLine());
    let missing = (nut && nut.missing) || [];
    // `missing` is only filled by economy's daily recount; `byGroup` is the
    // same answer and is right from the first frame.
    if (missing.length === 0 && distinctGroups < FOOD_GROUPS.length) {
      missing = [];
      for (let i = 0; i < FOOD_GROUPS.length; i++) {
        if (!(byGroup[i] && byGroup[i].length)) missing.push(FOOD_GROUPS[i].name);
      }
    }
    // The milestone's health row says the same thing in six words; both read
    // these so the two can never name a different set of groups.
    this.varietyBrief = distinctGroups + ' of 6 food groups';
    const want = missing.map((n) => String(n).toLowerCase());
    this.varietyWant = want.length === 0 ? ''
      : want.length <= 3 ? 'no ' + joinList(want)
        : 'no ' + want[0] + ', ' + want[1] + ' and ' + (want.length - 2) + ' more';
    setText(this.elVarietyMiss, missing.length === 0
      ? 'Every food group is covered.'
      : 'No ' + joinList(missing.map((n) => String(n).toLowerCase()))
        + ' — each group the town eats is worth 11 points of variety.');
    setText(this.mHealth.sub, distinctGroups + '/6 food groups');

    const need = askNum(eco, 'foodNeededPerDay', undefined,
      pop * (this.seasonNow() === 3 ? 1.25 : 1));
    setText(this.elFoodNote,
      fmtNum(foodUnits) + ' food units, and the valley eats about ' + fmtNum(need)
      + ' a day at ' + pop + ' people'
      + (this.seasonNow() === 3 ? ' (Winter costs a quarter more).' : '.')
      + (days >= 0 && days < 5 ? ' Build a Forager’s Hut or Fisherman’s Hut — neither needs inputs.' : ''));
  }

  /**
   * §17.1 in one hover: every term of §9.6's sum, and the biggest drag spelled
   * out as something to do about it. economy owns the arithmetic — this only
   * reads `happinessParts`, so the meter and the formula can never disagree.
   */
  updateHappyPop(happy) {
    const parts = this.game.economy && this.game.economy.happinessParts;
    const rows = this.happyRows;
    if (!rows) return;
    if (!parts) {
      if (this.happySig === 'none') return;
      this.happySig = 'none';
      for (let i = 0; i < rows.length; i++) rows[i].row.style.display = 'none';
      setText(this.elHappySum, 'The mood is counted at the end of the first day.');
      setText(this.elHappyFix, '');
      return;
    }

    let sig = '';
    for (let i = 0; i < rows.length; i++) sig += Math.round(numOf(parts[rows[i].def.key], 0) * 2) + ',';
    sig += Math.round(happy);
    if (sig === this.happySig) return;
    this.happySig = sig;

    let lifts = 0;
    let drags = 0;
    let worst = null;
    let worstBy = 0.35;   // ignore rounding dust — a 0.3 drag is not the answer
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const d = r.def;
      const raw = numOf(parts[d.key], 0);
      // Penalties are stored positive and subtracted by §9.6; `health` alone
      // arrives already signed.
      const signed = d.sign === 0 ? raw : raw * d.sign;
      if (signed > 0) lifts += signed;
      else drags -= signed;
      if (-signed > worstBy) { worstBy = -signed; worst = d; }
      const mag = Math.min(1, Math.abs(signed) / d.max);
      r.row.style.display = '';
      setCls(r.row, 'hm-hrow' + (signed > 0.05 ? ' up' : signed < -0.05 ? ' down' : ' nil'));
      setStyle(r.fill, 'width', Math.round(mag * 100) + '%');
      setText(r.val, (signed > 0 ? '+' : signed < 0 ? '−' : '')
        + (Math.abs(signed) < 0.05 ? '0' : Math.abs(signed).toFixed(1)));
    }

    setText(this.elHappySum, Math.round(happy) + ' = 45 to start, +' + lifts.toFixed(1)
      + ' earned, −' + drags.toFixed(1) + ' lost.');
    setText(this.elHappyFix, worst
      ? 'Biggest drag: ' + worst.name.toLowerCase() + '. ' + worst.fix
      : (lifts < 6
        ? 'Nothing is dragging the town down — it simply has nothing yet to enjoy.'
        : 'Nothing is dragging the town down.'));
  }

  /**
   * What the town has actually been eating (L2's rolling window). `eatenOn`
   * holds the day each food was last eaten anywhere in the valley.
   */
  eatenLine() {
    const map = this.game.economy && this.game.economy.eatenOn;
    if (!map || typeof map.forEach !== 'function') return '';
    const now = this.dayNow() + this.timeNow();
    const rows = [];
    map.forEach((when, id) => {
      const ago = now - numOf(when, -Infinity);   // a junk day reads as never eaten
      if (ago <= VARIETY_EATEN_DAYS && ITEMS[id]) rows.push({ id, ago });
    });
    if (rows.length === 0) {
      return 'Nothing has been eaten in ' + VARIETY_EATEN_DAYS
        + ' days, so only food sitting in a store is counting.';
    }
    rows.sort((a, b) => a.ago - b.ago);
    const names = [];
    for (let i = 0; i < rows.length && i < 7; i++) names.push(itemName(rows[i].id).toLowerCase());
    const rest = rows.length - names.length;
    const list = rest > 0 ? names.join(', ') + ' and ' + rest + ' more' : joinList(names);
    return 'On the table lately: ' + list + '.';
  }

  /* ---- raid banner --------------------------------------------------- */

  onRaidWarned(p) {
    if (!p) return;
    this.raidLost.length = 0;
    const day = this.dayNow();
    this.raid = {
      wave: numOf(p.wave, 1),
      arriveDay: day + numOf(p.daysUntil, 2),
      passes: Array.isArray(p.passes) ? p.passes : (p.passes ? [p.passes] : []),
      active: false,
      count: 0,
    };
    this.toast('Smoke above the passes. Wave ' + this.raid.wave + ' comes in '
      + fmtDays(numOf(p.daysUntil, 2)) + '.', 'bad');
  }

  onRaidStarted(p) {
    this.raidLost.length = 0;
    if (!this.raid) this.raid = { wave: numOf(p && p.wave, 1), arriveDay: this.dayNow(), passes: [] };
    this.raid.active = true;
    this.raid.count = numOf(p && p.count, 0);
    this.toast('The raid is here — ' + this.raid.count + ' at the gates.', 'bad');
  }

  /**
   * K6 — `buildingsLost` is the honest total and counts wall tiles. A player
   * whose five palisades did exactly their job has not lost five buildings, so
   * the headline is the non-wall figure and the walls get their own clause.
   */
  onRaidEnded(p) {
    this.raid = null;
    if (!p) return;
    const held = p.result === 'held';
    const walls = Math.max(0, Math.round(numOf(p.wallsLost, 0)));
    const lost = Math.max(0, Math.round(numOf(p.buildingsLost, 0)) - walls);
    const lives = Math.max(0, Math.round(numOf(p.losses, 0)));
    // Group what actually burned, in the order it fell. When the events named
    // everything the count claims, the chips below are the list and the line
    // does not repeat them; otherwise the count still has to be said.
    const groups = [];
    const byDef = {};
    for (let i = 0; i < this.raidLost.length; i++) {
      const b = this.raidLost[i];
      let g = byDef[b.defId];
      if (!g) { g = byDef[b.defId] = { defId: b.defId, name: b.name, xs: [], ys: [] }; groups.push(g); }
      g.xs.push(b.x);
      g.ys.push(b.y);
    }
    const named = this.raidLost.length;

    const parts = [];
    if (lost > named) {
      const rest = lost - named;
      parts.push(rest === 1 ? '1 building burned' : rest + ' buildings burned');
    } else if (lost > 0 && named === 0) {
      parts.push(lost === 1 ? '1 building burned' : lost + ' buildings burned');
    }
    if (lives > 0) parts.push(lives === 1 ? '1 villager killed' : lives + ' villagers killed');
    if (walls > 0) {
      parts.push((walls === 1 ? '1 wall section' : walls + ' wall sections')
        + ' fell holding them out');
    }
    this.raidReport = {
      held,
      main: 'Wave ' + numOf(p.wave, 1) + (held ? ' was held' : ' ravaged the valley'),
      sub: parts.length ? joinList(parts) + '.'
        : named > 0 ? 'Everyone lived.' : 'Nothing was lost.',
      lost: groups,
      until: perfNow() + RAID_REPORT_MS,
    };
    this.lostSig = '';
  }

  updateBanner(wall) {
    // Prefer what military reports; fall back to the frozen raid events (§11).
    const mil = this.game.military;
    const w = mil && (mil.warning || mil.raidWarning || mil.nextRaid);
    if (w && !this.raid) {
      this.raid = {
        wave: numOf(w.wave, 1),
        arriveDay: this.dayNow() + numOf(w.daysUntil, 0),
        passes: Array.isArray(w.passes) ? w.passes : [],
        active: false,
        count: 0,
      };
    }
    const active = this.raid && (this.raid.active
      || ask(mil, 'raidActive', undefined, false) === true);

    if (!this.raid) {
      const rep = this.raidReport;
      if (rep && wall < rep.until) {
        // Reading the list is the point, so hovering holds it on screen.
        if (this.bannerHold) rep.until = wall + 4000;
        this.elBanner.style.display = '';
        setText(this.elBannerIcon, rep.held ? '\u{1f6e1}' : '\u{1f525}');
        setText(this.elBannerMain, rep.main);
        setText(this.elBannerSub, rep.sub);
        setCls(this.elBanner, 'hm-banner hm-banner-after' + (rep.held ? ' held' : ''));
        this.renderLost(rep);
        this.renderFixAll();
        return;
      }
      if (rep) this.raidReport = null;
      if (this.elBannerLost.style.display !== 'none') this.elBannerLost.style.display = 'none';
      if (this.elBannerFix.style.display !== 'none') this.elBannerFix.style.display = 'none';
      if (this.elBanner.style.display !== 'none') this.elBanner.style.display = 'none';
      return;
    }
    this.raidReport = null;
    this.elBanner.style.display = '';
    if (this.elBannerLost.style.display !== 'none') this.elBannerLost.style.display = 'none';
    if (this.elBannerFix.style.display !== 'none') this.elBannerFix.style.display = 'none';

    const gw = numOf(this.game.world && this.game.world.w, 72);
    const gh = numOf(this.game.world && this.game.world.h, 72);
    const names = [];
    for (let i = 0; i < this.raid.passes.length; i++) {
      names.push(passName(this.raid.passes[i], gw, gh));
    }
    const where = names.length ? joinList(names) : 'the passes';

    if (active) {
      const enemies = listOf(mil, 'enemies', 'units');
      const n = enemies.length || this.raid.count;
      setText(this.elBannerIcon, '⚔');
      setText(this.elBannerMain, 'Wave ' + this.raid.wave + ' is in the valley');
      setText(this.elBannerSub, n > 0 ? n + ' raiders · from ' + where : 'from ' + where);
      setCls(this.elBanner, 'hm-banner hm-banner-now');
    } else {
      const left = this.raid.arriveDay - this.dayNow() - numOf(this.timeNow(), 0);
      setText(this.elBannerIcon, '\u{1f525}');
      setText(this.elBannerMain, 'Wave ' + this.raid.wave + ' arrives in ' + fmtDays(left));
      setText(this.elBannerSub, 'Smoke seen above ' + where
        + ' · ' + this.soldierLine());
      setCls(this.elBanner, 'hm-banner' + (left < 1 ? ' hm-banner-soon' : ''));
    }
  }

  /**
   * The named losses, under the after-action line. Built once per report — the
   * banner is on screen for seconds, not frames.
   */
  renderLost(rep) {
    const groups = rep.lost || [];
    const box = this.elBannerLost;
    box.style.display = groups.length ? '' : 'none';
    if (groups.length === 0) return;
    let sig = '';
    for (let i = 0; i < groups.length; i++) sig += groups[i].defId + 'x' + groups[i].xs.length + '|';
    if (sig === this.lostSig) return;
    this.lostSig = sig;

    clearNode(box);
    this.lostChips.length = 0;
    box.appendChild(el('span', 'hm-lost-lab', 'You lost'));
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const n = g.xs.length;
      const chip = el('button', 'hm-lost', n > 1 ? n + ' ' + plural(g.name) : g.name);
      chip.type = 'button';
      chip.title = 'Fly to where it stood' + (n > 1 ? ' (click again for the next)' : '')
        + ' and pick up a new one';
      const idx = i;
      chip.addEventListener('click', () => this.activateLost(idx));
      box.appendChild(chip);
      this.lostChips.push(chip);
    }
  }

  /**
   * The Repair All offer under the after-action report. The plan is rebuilt on
   * the alerts cadence, not here — the banner runs every frame — and the button
   * is rewritten only when its own words would change.
   */
  renderFixAll() {
    const box = this.elBannerFix;
    const plan = this.repPlan;
    const n = plan ? plan.ids.length : 0;
    if (n === 0) {
      if (box.style.display !== 'none') box.style.display = 'none';
      this.fixSig = '';
      return;
    }
    box.style.display = '';
    const price = this.costText(plan.cost);
    const afford = this.canAfford(plan.cost);
    const skipped = this.rebuildClause(plan);
    const sig = n + '|' + price + '|' + (afford ? 1 : 0) + '|' + skipped;
    if (sig === this.fixSig) return;
    this.fixSig = sig;
    setText(this.elFixAll, (n === 1 ? '1 building damaged' : n + ' buildings damaged')
      + ' · Repair all (' + price + ')');
    setToggle(this.elFixAll, 'poor', !afford);
    this.elFixAll.title = 'Half the price of rebuilding them, pro-rata on the damage.'
      + (skipped ? ' Left alone: ' + skipped + '.' : '');
  }

  /** Fly to where it stood and arm a replacement — the player's actual move. */
  activateLost(i) {
    const rep = this.raidReport;
    const g = rep && rep.lost && rep.lost[i];
    if (!g || g.xs.length === 0) return;
    const off = (this.lostOffset.get(g.defId) || 0) % g.xs.length;
    this.lostOffset.set(g.defId, off + 1);
    const x = g.xs[off] + 0.5;
    const y = g.ys[off] + 0.5;
    this.flag(x, y);
    this.panTo(x, y);
    const def = BUILDING_BY_ID[g.defId];
    if (def && def.unique !== true && def.prePlaced !== true && def.tier <= this.tierNow()) {
      this.chooseBuild(g.defId);
    }
  }

  soldierLine() {
    const mil = this.game.military;
    const n = listOf(mil, 'soldiers').length || askNum(mil, 'soldierCount', undefined, 0);
    if (n === 0) return 'no soldiers — the draft will have to do';
    return n === 1 ? '1 soldier stands ready' : n + ' soldiers stand ready';
  }

  /* ---- alerts -------------------------------------------------------- */

  /**
   * Which building (or which patch of ground) is sealing `b` off from the town
   * centre, with the sealer's name already resolved. Null when the module is
   * older than the API or the search found nothing.
   *
   * On-demand only: this runs a 0-1 search out of the pocket, so it is called
   * from the alert and inspector passes (~4Hz) and never from a frame.
   */
  causeOf(b) {
    const bs = this.game.buildings;
    if (!b || !bs || typeof bs.cutOffCause !== 'function') return null;
    const rev = numOf(this.game.world && this.game.world.rev, 0);
    if (rev !== this.causeRev) {
      this.causeRev = rev;
      this.causeCache.clear();
    }
    if (this.causeCache.has(b.id)) return this.causeCache.get(b.id);
    let cause = null;
    try {
      const r = bs.cutOffCause(b);
      if (r && r.kind) {
        cause = { kind: r.kind, id: numOf(r.id, -1), x: numOf(r.x, 0), y: numOf(r.y, 0), name: '', keep: false, water: false };
        if (cause.kind === 'ground') {
          // cutOffCause reports water, cliff and rock alike as 'ground'. Only
          // water has a remedy, so the copy must tell them apart or it sends
          // the player to move a town round a river a Bridge would cross.
          const w = this.game.world;
          const t = w && w.terrain ? w.terrain[toIdx(cause.x, cause.y)] : -1;
          cause.water = t === TERRAIN.WATER || t === TERRAIN.SHORE;
          // A remedy the player cannot build yet is AK2's locked-counter
          // failure in prose, so the tier decides which wording they get.
          const bridge = BUILDING_BY_ID.bridge;
          cause.bridgeTier = bridge ? bridge.tier : 0;
          cause.bridgeOk = !!bridge && this.tierNow() >= bridge.tier;
        }
        if (cause.kind === 'building') {
          const sealer = buildingById(this.game, cause.id);
          const sd = defOf(sealer);
          cause.name = (sd && sd.name) || buildingName(this.game, cause.id);
          // "Lose it and the town is finished" — never print that as a remedy,
          // whatever the search returns. See the HANDOFF note on cutOffCause
          // preferring a deep building answer over a shallow ground one.
          cause.keep = !!(sd && sd.prePlaced);
        }
      }
    } catch (ignored) {
      void ignored;
    }
    this.causeCache.set(b.id, cause);
    return cause;
  }

  /* ---- repair (ADDENDUM AO3) ----------------------------------------- */

  /**
   * The damaged buildings, sorted into what the player can actually do about
   * each: `ids` a repair can reach, `walls` that must be pulled down and
   * re-laid, and `stuck` ones no carrier can get to yet. `cost` is what
   * repairing every id would reserve.
   *
   * Rebuilt on the alerts cadence and never per frame: `damagedIds` and
   * `repairCost` both allocate, and this walks every damaged building.
   */
  collectRepairPlan() {
    const bs = this.game.buildings;
    const plan = {
      ids: [], xs: [], ys: [],
      walls: [], wallXs: [], wallYs: [],
      stuck: [], stuckXs: [], stuckYs: [],
      cost: Object.create(null),
    };
    this.repPlan = plan;
    if (!bs || typeof bs.damagedIds !== 'function') return plan;
    // Already excludes anything under repair, so every row built from this
    // clears itself as the repairs the player started take hold.
    const ids = bs.damagedIds(this.damagedScratch);
    for (let i = 0; i < ids.length; i++) {
      const b = buildingById(this.game, ids[i]);
      const def = defOf(b);
      if (!b || !def) continue;
      const why = repairBlocker(b, def);
      if (why === 'wall') {
        plan.walls.push(b.id); plan.wallXs.push(b.x); plan.wallYs.push(b.y);
      } else if (why) {
        plan.stuck.push(b.id); plan.stuckXs.push(b.x); plan.stuckYs.push(b.y);
      } else {
        plan.ids.push(b.id); plan.xs.push(b.x); plan.ys.push(b.y);
        const c = typeof bs.repairCost === 'function' ? bs.repairCost(b.id) : null;
        for (const k in (c || {})) plan.cost[k] = (plan.cost[k] || 0) + c[k];
      }
    }
    return plan;
  }

  /**
   * What Repair All deliberately leaves alone, and why. Never left unsaid: a
   * pass that quietly skipped two thirds of the damage would be the same
   * failure as a repair that quietly never progresses.
   *
   * Each clause carries its own remedy in brackets, because the two remedies
   * differ and the list reads as one sentence when both are present.
   */
  rebuildClause(plan) {
    const parts = [];
    if (plan.walls.length) {
      parts.push((plan.walls.length === 1 ? '1 wall section' : plan.walls.length + ' wall sections')
        + ' (pull them down and lay them again)');
    }
    if (plan.stuck.length) {
      parts.push((plan.stuck.length === 1 ? '1 damaged building' : plan.stuck.length + ' damaged buildings')
        + ' nothing can reach (lay a road first)');
    }
    return joinList(parts);
  }

  /**
   * ADDENDUM AO3, and AN7's lesson applied to the other half of a raid: the
   * report names what burned, this is the one decision about what is still
   * standing and hurt. Greedy in id order, and `beginRepair` refuses outright
   * when the town cannot cover a building — so this says what it managed AND
   * what it could not afford rather than silently doing half the job.
   */
  repairAll() {
    const bs = this.game.buildings;
    const plan = this.collectRepairPlan();
    if (!bs || typeof bs.beginRepair !== 'function') return;
    const skipped = this.rebuildClause(plan);
    if (plan.ids.length === 0) {
      this.toast(skipped
        ? 'Nothing here can be repaired — ' + skipped + '.'
        : 'Nothing is damaged.', 'warn');
      return;
    }
    const spent = Object.create(null);
    let done = 0;
    let why = '';
    for (let i = 0; i < plan.ids.length; i++) {
      const id = plan.ids[i];
      const cost = typeof bs.repairCost === 'function' ? bs.repairCost(id) : null;
      if (bs.beginRepair(id)) {
        done++;
        for (const k in (cost || {})) spent[k] = (spent[k] || 0) + cost[k];
      } else if (!why) {
        // Nothing in this list is unbuilt, undamaged or already repairing —
        // `damagedIds` just said so — so a refusal here is only ever the price.
        why = String(bs.lastError || 'not enough materials');
      }
    }
    const left = plan.ids.length - done;
    let text;
    let kind;
    if (done === 0) {
      text = 'Cannot repair any of them yet — ' + why + '. All '
        + plan.ids.length + ' would cost ' + this.costText(plan.cost) + '.';
      kind = 'bad';
    } else {
      text = (done === 1 ? 'Repairing 1 building' : 'Repairing ' + done + ' buildings')
        + ' · ' + this.costText(spent) + ' reserved.';
      if (left > 0) text += ' ' + left + ' left over — ' + why + '.';
      kind = left > 0 ? 'warn' : 'good';
    }
    if (skipped) text += ' Left alone: ' + skipped + '.';
    this.toast(text, kind);
    this.alertSig = '';
    this.tAlerts = 0;
    this.inspectSig = '';
    this.tInspect = 0;
  }

  /** Commit to one repair, and say which of the two answers came back. */
  beginRepair(id) {
    const bs = this.game.buildings;
    if (!bs || typeof bs.beginRepair !== 'function') return;
    const cost = typeof bs.repairCost === 'function' ? bs.repairCost(id) : null;
    if (bs.beginRepair(id)) {
      this.toast('Repairing the ' + buildingName(this.game, id)
        + (cost ? ' · ' + this.costText(cost) + ' reserved' : '') + '.', 'good');
    } else {
      this.toast(upperFirst(bs.lastError || 'that repair cannot start') + '.', 'bad');
    }
    this.alertSig = '';
    this.tAlerts = 0;
    this.inspectSig = '';
    this.tInspect = 0;
  }

  cancelRepair(id) {
    const bs = this.game.buildings;
    if (!bs || typeof bs.cancelRepair !== 'function') return;
    if (bs.cancelRepair(id)) {
      this.toast('Repair called off. Materials still at the store go back; what is already in the walls stays.', 'warn');
    }
    this.alertSig = '';
    this.tAlerts = 0;
    this.inspectSig = '';
    this.tInspect = 0;
  }

  collectAlerts() {
    const game = this.game;
    const eco = game.economy;
    const list = buildingList(game);
    const groups = new Map();

    const push = (key, label, severity, fix, id, x, y, cause) => {
      let g = groups.get(key);
      if (!g) {
        g = { key, label, severity, fix, cause: cause || null, ids: [], xs: [], ys: [] };
        groups.set(key, g);
      }
      if (id !== undefined) {
        g.ids.push(id);
        g.xs.push(x);
        g.ys.push(y);
      }
    };

    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.dead) continue;
      const reason = b.idleReason;
      if (!reason) continue;
      const a = alertFor(reason);
      // Severity 1 is informational ('night', 'paused', 'out of season') and
      // would drown the real problems; it belongs in the inspector, not here.
      // An unrecognised reason is never swallowed — a silent alert would be a
      // legibility hole, so it surfaces at severity 2 with its raw wording.
      if (a && a.severity < 2) continue;
      // 'cut off' rows are keyed by their sealer, not by the reason: two huts
      // behind one Cottage are one problem with one fix, and two huts behind
      // two different Cottages are two, so they must not merge into a row that
      // can only name one of them.
      const cause = reason === 'cut off' ? this.causeOf(b) : null;
      const info = idleInfo(reason, b, cause);
      const key = cause ? reason + '|' + cause.kind + ':' + cause.id + ':' + cause.x + ',' + cause.y : reason;
      push(key, info.label, a ? a.severity : 2, info.fix, b.id, b.x, b.y, cause);
    }

    // Town-wide problems economy/military own rather than any one building.
    const days = askNum(eco, 'daysOfFood', undefined, -1);
    const starving = askNum(eco, 'starvingDays', undefined, 0);
    if (starving > 0) {
      push('starving', 'The town is starving — day ' + Math.round(starving), 3, TOWN_FIX.starving);
    } else if (days >= 0 && days < 5) {
      push('food low', 'Only ' + fmtDays(days) + ' of food left', 3, TOWN_FIX['food low']);
    }
    const homeless = askNum(eco, 'homeless', undefined, 0);
    if (homeless > 0) {
      push('homeless', homeless + (homeless === 1 ? ' villager has' : ' villagers have') + ' no home',
        2, TOWN_FIX.homeless);
    }
    const pop = this.population();
    const unemployed = askNum(eco, 'unemployed', undefined, -1);
    if (unemployed > 0 && pop > 0 && unemployed > Math.max(3, pop * 0.18)) {
      push('unemployed', unemployed + ' villagers have no work', 1, TOWN_FIX.unemployed);
    }
    const mil = game.military;
    const soldiers = listOf(mil, 'soldiers').length || askNum(mil, 'soldierCount', undefined, 0);
    if (soldiers === 0 && (this.raid || this.dayNow() >= 8)) {
      push('no soldiers', 'No soldiers to defend the town', 3, TOWN_FIX['no soldiers']);
    }

    // Storage pressure is economy's to notice, and its rows carry the class
    // after a colon (G3). A row that said only "storage full" would leave the
    // player guessing between a Granary, a Stockpile and an Armoury.
    const ecoAlerts = listOf(eco, 'alerts');
    for (let i = 0; i < ecoAlerts.length; i++) {
      const raw = ecoAlerts[i];
      if (typeof raw !== 'string') continue;
      const parts = reasonParts(raw);
      if (parts.key !== 'no storage' && parts.key !== 'storage full') continue;
      const cls = storageClass(parts.arg);
      const what = cls ? cls.name : 'goods';
      const store = cls ? cls.store : 'Stockpile';
      if (parts.key === 'no storage') {
        push(raw, 'No room left for ' + what, 3,
          'Build a ' + store + '. Every store that takes ' + what + ' is full.');
      } else {
        push(raw, 'Almost no room left for ' + what, 2,
          'Build a ' + store + ' now, before production stops.');
      }
    }

    // ADDENDUM AO3. Damage is recoverable now, so it is an alert with a fix
    // rather than a permanent scar. Three rows because there are three
    // different fixes, and §16.8 wants the fix, not the problem: a row that
    // merged a repairable workshop with an unroaded one and forty palisades
    // could only ever name one of the three remedies.
    const plan = this.collectRepairPlan();
    if (plan.ids.length > 0) {
      const lab = plan.ids.length === 1 ? '1 building is damaged'
        : plan.ids.length + ' buildings are damaged';
      for (let i = 0; i < plan.ids.length; i++) {
        push('damaged', lab, 2,
          'Select one and press Repair — half the price of rebuilding, and it keeps working while it mends.',
          plan.ids[i], plan.xs[i], plan.ys[i]);
      }
      groups.get('damaged').act = 'repairAll';
    }
    if (plan.stuck.length > 0) {
      const lab = plan.stuck.length === 1 ? '1 damaged building cannot be reached'
        : plan.stuck.length + ' damaged buildings cannot be reached';
      for (let i = 0; i < plan.stuck.length; i++) {
        push('damaged stuck', lab, 2,
          'Lay a dirt path (R) touching one, then repair. With no road, the materials never arrive.',
          plan.stuck[i], plan.stuckXs[i], plan.stuckYs[i]);
      }
    }
    // Severity 1: a raid on a palisade line damages dozens of sections at once,
    // and §7 already keeps walls out of the idle rows for exactly that reason.
    // It still has to be said once, with the remedy that actually works.
    if (plan.walls.length > 0) {
      const lab = plan.walls.length === 1 ? '1 wall section is damaged'
        : plan.walls.length + ' wall sections are damaged';
      for (let i = 0; i < plan.walls.length; i++) {
        push('damaged wall', lab, 1,
          'Pull the weak sections down and lay them again — 1–2 wood each. No carrier can reach a wall to repair it.',
          plan.walls[i], plan.wallXs[i], plan.wallYs[i]);
      }
    }

    // ADDENDUM AQ11. A site or a repair in a severed region has no idle reason
    // of its own and no haul task, so without this the game says nothing at all
    // — and its reservation is subtracted from every other building's
    // affordability, which is the part the player cannot possibly deduce.
    // Three rows, like AO3's, because three groups have three different fixes:
    // a site and a repair can each be cancelled to release the materials, and a
    // starved workshop has nothing to release.
    this.pushStrandedRows(push, listOf(eco, 'stranded'));

    const out = [];
    groups.forEach((g) => out.push(g));
    out.sort((a, b) => (b.severity - a.severity)
      || (b.ids.length - a.ids.length)
      || (a.key < b.key ? -1 : 1));
    return out;
  }

  /**
   * ADDENDUM AQ11's rows. `economy.stranded` is rebuilt from scratch on the
   * task cadence, so these clear themselves the moment the gap is bridged —
   * an alert that survives its own fix is worse than no alert.
   */
  pushStrandedRows(push, list) {
    if (!list || list.length === 0) return;
    const base = ALERTS['no route'].fix;
    const sites = [], repairs = [], starved = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e) continue;
      (e.kind === 'site' ? sites : e.kind === 'repair' ? repairs : starved).push(e);
    }
    // The stranded reservation is the whole reason this is a town-wide problem
    // and not one stuck building, so it is stated in units, not in adjectives.
    const held = (rows) => {
      const sum = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].reserved;
        for (const k in r) if (r[k] > 0) sum[k] = (sum[k] || 0) + r[k];
      }
      return this.costText(sum);
    };
    const add = (key, rows, label, fix, severity) => {
      if (rows.length === 0) return;
      const lab = label(rows.length, held(rows));
      for (let i = 0; i < rows.length; i++) {
        push(key, lab, severity, fix, rows[i].id, rows[i].x, rows[i].y);
      }
    };
    // These rows lead on the RESERVATION, not on the severance. A severed
    // building usually also carries its own 'cut off' row, which says where the
    // break is; what nothing else in the game has ever said is that its
    // reservation is subtracted from every other build in the valley.
    add('no route site', sites,
      (n, cost) => cost + ' reserved by ' + (n === 1 ? 'a site' : n + ' sites')
        + ' nothing can reach',
      base + ' Or cancel it for a full refund.', 3);
    add('no route repair', repairs,
      (n, cost) => cost + ' reserved by ' + (n === 1 ? 'a repair' : n + ' repairs')
        + ' nothing can reach',
      base + ' Or cancel it to free the rest.', 3);
    // No reservation to name: a workshop short of an input has committed
    // nothing, so this one is about the stopped work and reads as such.
    add('no route supply', starved,
      (n) => (n === 1 ? 'A building is' : n + ' buildings are')
        + ' waiting on goods nothing can carry to them',
      base, 2);
  }

  updateAlerts() {
    const groups = this.collectAlerts();
    let sig = '';
    // The label is part of the signature: a town-wide row always has zero ids,
    // so "6 villagers have no home" -> "4" would otherwise never repaint.
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      sig += g.key + '#' + g.ids.length + '#' + g.severity + '#' + g.label + '|';
    }
    // The Repair All row prices itself, so it must repaint when the price
    // becomes payable — nothing above changes when the stores fill.
    if (this.repPlan) sig += 'R' + (this.canAfford(this.repPlan.cost) ? 1 : 0) + '|';
    this.alertGroups = groups;

    let total = 0;
    for (let i = 0; i < groups.length; i++) total += Math.max(1, groups[i].ids.length);
    setText(this.elAlertCount, String(total));
    setToggle(this.elAlertCount, 'hot', groups.length > 0 && groups[0].severity >= 3);
    this.elAlertEmpty.style.display = groups.length ? 'none' : '';

    if (sig === this.alertSig) return;
    this.alertSig = sig;

    // Rows are pooled: an alerts panel that churns 8 nodes every 280ms would
    // thrash layout for no reason, and the pool keeps click handlers stable.
    while (this.alertRows.length < groups.length) {
      const idx = this.alertRows.length;
      const row = el('button', 'hm-alert');
      row.type = 'button';
      const bar = el('span', 'hm-alert-bar');
      const body = el('span', 'hm-alert-body');
      const title = el('span', 'hm-alert-title', '');
      const fix = el('span', 'hm-alert-fix', '');
      const where = el('span', 'hm-alert-where', '');
      body.appendChild(title);
      body.appendChild(where);
      body.appendChild(fix);
      // One row carries an action of its own (AO3's Repair All): a raid's
      // aftermath should be one decision, not twelve inspector visits, and the
      // banner that offers it is gone sixteen seconds after the raid.
      const act = el('button', 'hm-alert-act', '');
      act.type = 'button';
      act.style.display = 'none';
      act.addEventListener('click', (e) => {
        e.stopPropagation();
        this.runAlertAct(idx);
      });
      body.appendChild(act);
      const count = el('span', 'hm-alert-count', '');
      row.appendChild(bar);
      row.appendChild(body);
      row.appendChild(count);
      row.addEventListener('click', () => this.activateAlert(idx));
      this.elAlertList.appendChild(row);
      this.alertRows.push({ row, title, fix, where, count, act });
    }
    for (let i = 0; i < this.alertRows.length; i++) {
      const r = this.alertRows[i];
      const g = groups[i];
      if (!g) {
        if (r.row.style.display !== 'none') r.row.style.display = 'none';
        continue;
      }
      r.row.style.display = '';
      setCls(r.row, 'hm-alert sev' + g.severity);
      setText(r.title, g.label);
      setText(r.fix, g.fix || '');
      setText(r.count, g.ids.length > 1 ? String(g.ids.length) : '');
      if (g.ids.length > 0) {
        const names = [];
        const seen = {};
        for (let j = 0; j < g.ids.length && names.length < 3; j++) {
          const n = buildingName(this.game, g.ids[j]);
          if (n && !seen[n]) { seen[n] = 1; names.push(n); }
        }
        const extra = g.ids.length > names.length ? ' +' + (g.ids.length - names.length) : '';
        setText(r.where, names.join(', ') + extra);
      } else {
        setText(r.where, '');
      }
      const plan = this.repPlan;
      if (g.act === 'repairAll' && plan && plan.ids.length > 0) {
        setText(r.act, 'Repair all · ' + this.costText(plan.cost));
        setToggle(r.act, 'poor', !this.canAfford(plan.cost));
        r.act.title = 'Start every repair the carriers can reach, in one go.';
        r.act.style.display = '';
      } else if (r.act.style.display !== 'none') {
        r.act.style.display = 'none';
      }
      r.row.title = g.fix || g.label;
    }
  }

  /** The one alert row that carries an action of its own (AO3's Repair All). */
  runAlertAct(i) {
    const g = this.alertGroups[i];
    if (g && g.act === 'repairAll') this.repairAll();
  }

  /** Pan to (and select) the next offender behind an alert row. */
  activateAlert(i) {
    const g = this.alertGroups[i];
    if (!g) return;
    this.alertCursor = i;
    for (let j = 0; j < this.alertRows.length; j++) {
      setToggle(this.alertRows[j].row, 'cur', j === i);
    }
    if (this.alertRows[i]) this.alertRows[i].row.scrollIntoView({ block: 'nearest' });
    if (g.ids.length === 0) {
      this.toast(g.fix || g.label, g.severity >= 3 ? 'bad' : 'warn');
      return;
    }
    const off = (this.alertOffset.get(g.key) || 0) % g.ids.length;
    this.alertOffset.set(g.key, off + 1);
    const b = buildingById(this.game, g.ids[off]);
    let x = b ? b.x + (b.w || 1) / 2 : g.xs[off];
    let y = b ? b.y + (b.h || 1) / 2 : g.ys[off];
    // A cut-off building is not where the player acts — the sealer is. Fly to
    // the sealer and flag it, and leave the idle hut selected so the inspector
    // beside the camera is still explaining what the flag means.
    if (g.cause) {
      const seal = g.cause.kind === 'building' ? buildingById(this.game, g.cause.id) : null;
      x = seal ? seal.x + (seal.w || 1) / 2 : g.cause.x + 0.5;
      y = seal ? seal.y + (seal.h || 1) / 2 : g.cause.y + 0.5;
      this.flag(x, y);
    }
    this.panTo(x, y);
    this.select('building', g.ids[off]);
  }

  /** Ask render.js for a timed marker on a tile. Render-local; no sim state. */
  flag(x, y) {
    const r = this.game.render;
    if (r && typeof r.flagTile === 'function') r.flagTile(x, y, 6);
  }

  cycleAlert(dir) {
    if (this.alertGroups.length === 0) return;
    let i = this.alertCursor + dir;
    if (i < 0) i = this.alertGroups.length - 1;
    if (i >= this.alertGroups.length) i = 0;
    this.activateAlert(i);
  }


  /* -------------------------------------------------------------- *
   * Next milestone (ADDENDUM AJ)
   * -------------------------------------------------------------- */

  /**
   * The gate rows for the tier above `tier`, derived once per tier. `TIERS` is
   * 0-based and `tier` is 1-based, so index `tier` is the *next* tier up, and
   * running off the end means the town is a City and there is nothing above it.
   */
  milestoneConds(tier) {
    if (this.msTier === tier && this.msConds) return this.msConds;
    const next = TIERS[tier] || null;
    // At the top the City's own gates become the bar to hold, not to reach.
    const gate = next || TIERS[TIERS.length - 1];
    const conds = [];
    if (gate.pop) conds.push({ kind: 'pop', label: 'People', need: gate.pop });
    if (gate.health) conds.push({ kind: 'health', label: 'Town health', need: gate.health });
    if (gate.happiness) conds.push({ kind: 'happy', label: 'Happiness', need: gate.happiness });
    if (next) {
      for (let i = 0; i < next.requires.length; i++) {
        const id = next.requires[i];
        const d = BUILDING_BY_ID[id];
        conds.push({ kind: 'build', id, def: d, label: d ? d.name : titleCase(id), need: 1 });
      }
    }
    this.msTier = tier;
    this.msNext = next;
    this.msConds = conds;
    return conds;
  }

  /** Rows are rebuilt only when the tier moves — a few times in a whole game. */
  rebuildMilestoneRows(conds) {
    this.msRowsTier = this.msTier;
    this.msRows.length = 0;
    clearNode(this.elMsRows);
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const row = el('button', 'hm-ms-row hm-ms-' + c.kind);
      row.type = 'button';
      const tick = el('span', 'hm-ms-tick', '○');
      const main = el('span', 'hm-ms-main');
      const line = el('span', 'hm-ms-head');
      line.appendChild(el('span', 'hm-ms-label', c.label));
      const val = el('span', 'hm-ms-val', '');
      line.appendChild(val);
      main.appendChild(line);
      let fill = null;
      if (c.kind !== 'build') {
        const tr = el('span', 'hm-ms-track');
        fill = el('span', 'hm-ms-fill');
        tr.appendChild(fill);
        main.appendChild(tr);
      }
      const sub = el('span', 'hm-ms-sub', '');
      main.appendChild(sub);
      row.appendChild(tick);
      row.appendChild(main);

      const idx = i;
      row.addEventListener('click', () => this.activateMilestone(idx));
      if (c.kind === 'health' || c.kind === 'happy') {
        // AJ3: the number alone is unactionable, so the row reaches up and
        // opens the meter's own breakdown rather than restating it here.
        const kind = c.kind;
        row.addEventListener('mouseenter', () => this.hoverPeek(kind, true));
        row.addEventListener('mouseleave', () => this.hoverPeek(kind, false));
        row.addEventListener('focus', () => this.hoverPeek(kind, true));
        row.addEventListener('blur', () => this.hoverPeek(kind, false));
        row.title = kind === 'health'
          ? 'Health is food variety — opens the food-group breakdown on the Health meter'
          : 'Opens the mood breakdown on the Happiness meter';
      } else if (c.kind === 'build') {
        row.title = c.def && c.def.desc ? c.def.desc : 'Pick it up and place it';
      } else {
        row.title = 'Open the housing tab';
      }

      this.elMsRows.appendChild(row);
      this.msRows.push({ row, tick, val, sub, fill });
    }
  }

  /**
   * No signature diff here: the rows are stable for the whole tier, so every
   * write already goes through the diffing setters and nothing is rebuilt.
   */
  updateMilestone() {
    const tier = this.tierNow();
    const conds = this.milestoneConds(tier);
    const next = this.msNext;
    const top = !next;
    const eco = this.game.economy;
    if (this.msRowsTier !== tier) this.rebuildMilestoneRows(conds);

    let met = 0;
    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const r = this.msRows[i];
      if (!r) continue;
      let cur;
      let ok;
      let val;
      if (c.kind === 'build') {
        ok = !!ask(this.game.buildings, 'hasBuilt', c.id, false);
        cur = ok ? 1 : 0;
        val = ok ? 'standing' : 'not yet';
      } else {
        cur = Math.round(c.kind === 'pop'
          ? this.population()
          : c.kind === 'health'
            ? askNum(eco, 'townHealth', undefined, askNum(eco, 'health', undefined, 0))
            : askNum(eco, 'happiness', undefined, 0));
        ok = cur >= c.need;
        val = cur + ' / ' + c.need;
      }
      if (ok) met++;
      setCls(r.row, 'hm-ms-row hm-ms-' + c.kind + (ok ? ' met' : '')
        + (this.peekPin === c.kind ? ' pin' : ''));
      setText(r.tick, ok ? '✓' : '○');
      setText(r.val, val);
      setText(r.sub, this.milestoneHint(c, cur, ok, top));
      if (r.fill) setStyle(r.fill, 'width', Math.round(clamp(cur / c.need, 0, 1) * 100) + '%');
    }

    const here = TIERS[tier - 1] || TIERS[0];
    const pct = Math.round((conds.length ? met / conds.length : 1) * 100);

    // The top-bar line is the permanent glance; the panel is the detail behind
    // it. A busy alerts list compresses the panel rather than hiding it,
    // because the left column belongs to the alerts first.
    setText(this.elGoalSep, top ? '·' : '→');
    setText(this.elGoalNext, top ? 'hold' : next.name);
    setText(this.elGoalCount, met + '/' + conds.length);
    setStyle(this.elGoalFill, 'width', pct + '%');
    setToggle(this.elGoal, 'won', top);
    setToggle(this.elGoal, 'ready', !top && met === conds.length);
    const gt = top
      ? 'A City, and nothing above it — open what is holding it'
      : met + ' of ' + conds.length + ' conditions for ' + next.name
        + ' met — open the detail';
    if (this.elGoal.title !== gt) this.elGoal.title = gt;

    setToggle(this.elMilestone, 'tight', this.alertGroups.length >= 3);
    setToggle(this.elMilestone, 'won', top);
    setText(this.elMsTitle, top ? 'Holding the Valley' : 'Next Milestone');
    setText(this.elMsPill, top ? here.name : next.name);
    setStyle(this.elMsProg, 'width', pct + '%');

    if (top) {
      setText(this.elMsLede, 'The valley is yours.');
      setText(this.elMsCount, met + ' of ' + conds.length + ' still held');
      setText(this.elMsFoot,
        'Nothing stands above a City. Hold it — every town falls in the end.');
    } else {
      setText(this.elMsLede, here.name + ' → ' + next.name);
      setText(this.elMsCount, met === conds.length
        ? 'All conditions met — ' + next.name + ' is next'
        : met + ' of ' + conds.length + ' conditions met');
      setText(this.elMsFoot, met === conds.length
        ? 'The next day that meets all four raises the town.'
        : 'Click a goal to act on it');
    }
  }

  /** One line under each row saying what to actually do about it. */
  milestoneHint(c, cur, ok, top) {
    if (c.kind === 'build') {
      return ok ? '' : (c.def ? this.costText(c.def.cost) : '');
    }
    // At the top tier these are not goals any more, they are ground to lose.
    if (c.kind === 'pop') {
      if (ok) return top ? 'Holding' : '';
      return top ? (c.need - cur) + ' short of the City mark'
        : 'Build houses: ' + (c.need - cur) + ' more villagers';
    }
    if (c.kind === 'happy') {
      if (ok) return top ? 'Holding' : '';
      return 'Ale, a chapel and paid wages lift the mood';
    }
    // Health. AJ3: the whole point of this panel — the number is driven by how
    // many food groups the town eats, and nothing else in the UI said so.
    const brief = this.varietyBrief || 'food variety';
    if (ok) return 'Variety holds it up: ' + brief;
    return 'Health is food variety — ' + brief
      + (this.varietyWant ? ', ' + this.varietyWant : '');
  }

  /** Row click: every branch is a UI command, never a write to the sim. */
  activateMilestone(i) {
    const c = this.msConds && this.msConds[i];
    if (!c) return;
    if (c.kind === 'health' || c.kind === 'happy') {
      this.pinPeek(c.kind);
      return;
    }
    if (c.kind === 'pop') {
      this.openMenuAt('housing');
      this.revealEntry('cottage');
      return;
    }
    if (ask(this.game.buildings, 'hasBuilt', c.id, false)) {
      this.flyToDef(c.id);
      return;
    }
    if (c.def) this.openMenuAt(c.def.cat);
    this.chooseBuild(c.id);
    this.revealEntry(c.id);
  }

  openMenuAt(cat) {
    if (BUILDINGS_BY_CAT[cat] && this.activeCat !== cat) {
      this.activeCat = cat;
      this.refreshBuildMenu(true);
    }
    if (!this.menuOpen) this.toggleMenu();
  }

  /**
   * Naming a building the player has to then hunt for in a fourteen-entry grid
   * has not finished the job — the first playtester never found the Market.
   * The refresh is what paints the armed entry's highlight.
   */
  revealEntry(defId) {
    this.tMenu = perfNow();
    this.refreshBuildMenu(false);
    const e = this.entryEls.get(defId);
    if (e && e.node && typeof e.node.scrollIntoView === 'function') {
      e.node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  flyToDef(defId) {
    const list = buildingList(this.game);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b && b.defId === defId && b.built) {
        this.panTo(b.x + (b.w || 1) / 2, b.y + (b.h || 1) / 2);
        this.select('building', b.id);
        return;
      }
    }
  }

  /** The top-bar goal line opens the panel that explains it. */
  showMilestone() {
    if (!this.milestoneOpen) {
      this.milestoneOpen = true;
      setToggle(this.elMilestone, 'hm-collapsed', false);
      this.elMsFold.textContent = '–';
    }
    // Re-trigger the highlight even when the panel was already open.
    this.elMilestone.classList.remove('flash');
    void this.elMilestone.offsetWidth;
    this.elMilestone.classList.add('flash');
  }

  hoverPeek(which, on) {
    this.peekHover = on ? which : (this.peekHover === which ? '' : this.peekHover);
    this.syncPeek();
  }

  /** Click pins the breakdown open, so it survives the trip up to the meter. */
  pinPeek(which) {
    this.peekPin = this.peekPin === which ? '' : which;
    this.syncPeek();
  }

  syncPeek() {
    const on = this.peekPin || this.peekHover;
    setToggle(this.mHealth.box, 'hm-peek', on === 'health');
    setToggle(this.mHappy.box, 'hm-peek', on === 'happy');
  }

  /* ---- inspector ------------------------------------------------------ */

  pollSelection() {
    const sel = this.game.input && this.game.input.selected;
    const kind = sel ? sel.kind || '' : '';
    const id = sel ? numOf(sel.id, -1) : -1;
    if (kind !== this.selKind || id !== this.selId) {
      this.selKind = kind;
      this.selId = id;
      this.inspectSig = '';
      this.tInspect = 0;
      this.updateInspector();
    }
  }

  updateInspector() {
    if (!this.selKind || this.selId < 0) {
      if (this.elInspector.style.display !== 'none') this.elInspector.style.display = 'none';
      return;
    }
    if (this.selKind === 'building') this.inspectBuilding();
    else if (this.selKind === 'villager') this.inspectVillager();
    else this.elInspector.style.display = 'none';
  }

  inspectBuilding() {
    const game = this.game;
    const b = buildingById(game, this.selId);
    if (!b) { this.clearSelection(); return; }
    const def = defOf(b);
    if (!def) { this.clearSelection(); return; }
    this.elInspector.style.display = '';
    setText(this.elInspTitle, def.name);
    setText(this.elInspTier, 'Tier ' + def.tier);

    // A full rebuild only when something structural moved; otherwise the
    // live bits below are patched in place.
    // The tier is in the signature because the upgrade offer appears with it.
    const structSig = 'b' + b.id + '|' + (b.built ? 1 : 0) + '|' + (b.workers ? b.workers.length : 0)
      + '|' + Object.keys(b.inv || {}).join(',') + '|' + (b.recipeId || '')
      + '|' + this.tierNow() + '|' + this.repairShape(b, def);
    if (structSig !== this.inspectSig) {
      this.inspectSig = structSig;
      this.renderBuildingBody(b, def);
    }
    this.patchBuildingBody(b, def);
  }

  renderBuildingBody(b, def) {
    const body = this.elInspBody;
    clearNode(body);
    this.elActivity = null;   // the villager body's nodes are gone with it
    const game = this.game;

    const head = el('div', 'hm-insp-top');
    const art = el('canvas', 'hm-art');
    paintBuildingArt(art, def);
    head.appendChild(art);
    const meta = el('div', 'hm-insp-meta');
    meta.appendChild(el('div', 'hm-insp-desc', def.desc || ''));
    const facts = el('div', 'hm-facts');
    facts.appendChild(this.fact('Size', def.w + '×' + def.h));
    if (def.jobs) facts.appendChild(this.fact('Jobs', String(def.jobs)));
    if (def.houses) facts.appendChild(this.fact('Beds', String(def.houses)));
    if (def.storage) facts.appendChild(this.fact('Store', def.storage.cap + ' ' + def.storage.classes.join('/')));
    if (def.upkeep && def.upkeep.coin) facts.appendChild(this.fact('Upkeep', def.upkeep.coin + ' coin/day'));
    meta.appendChild(facts);
    head.appendChild(meta);
    body.appendChild(head);

    // Status: the ten-second answer to "why is this not working?" (§1 pillar 2)
    this.elStatus = el('div', 'hm-status');
    this.elStatusMain = el('div', 'hm-status-main', '');
    this.elStatusFix = el('div', 'hm-status-fix', '');
    this.elStatus.appendChild(this.elStatusMain);
    this.elStatus.appendChild(this.elStatusFix);
    // Only 'cut off' uses this today: its fix is at another building entirely,
    // which is the one case where naming the remedy is not enough to find it.
    this.elStatusGo = el('button', 'hm-status-go', '');
    this.elStatusGo.type = 'button';
    this.elStatusGo.style.display = 'none';
    this.statusGoAt = null;
    this.elStatusGo.addEventListener('click', () => {
      const at = this.statusGoAt;
      if (!at) return;
      this.flag(at.x, at.y);
      this.panTo(at.x, at.y);
    });
    this.elStatus.appendChild(this.elStatusGo);
    body.appendChild(this.elStatus);

    // Damage and repair (ADDENDUM AO3). Above Workers because a hurt building
    // is usually the reason the player clicked it.
    this.renderRepair(body, b, def);

    if (!b.built) {
      body.appendChild(el('div', 'hm-sub-h', 'Construction'));
      this.elProgTrack = el('div', 'hm-bar');
      this.elProgFill = el('div', 'hm-bar-fill');
      this.elProgTrack.appendChild(this.elProgFill);
      this.elProgLabel = el('div', 'hm-bar-label', '');
      body.appendChild(this.elProgTrack);
      body.appendChild(this.elProgLabel);
      const deliv = el('div', 'hm-chips');
      const cost = def.cost || {};
      const ids = Object.keys(cost);
      this.deliveryChips = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const c = el('span', 'hm-chip');
        c.appendChild(el('span', 'hm-chip-icon', itemIcon(id)));
        const t = el('span', 'hm-chip-text', '');
        c.appendChild(t);
        deliv.appendChild(c);
        this.deliveryChips.push({ id, need: cost[id], chip: c, text: t });
      }
      body.appendChild(deliv);
    } else {
      this.elProgTrack = null;
      this.deliveryChips = null;
    }

    // Workers.
    if (def.jobs > 0) {
      const h = el('div', 'hm-sub-h', '');
      this.elWorkerHead = h;
      body.appendChild(h);
      const wl = el('div', 'hm-workers');
      const ids = b.workers || [];
      if (ids.length === 0) {
        wl.appendChild(el('div', 'hm-workers-none', 'No one is posted here.'));
      }
      for (let i = 0; i < ids.length; i++) {
        const v = villagerById(game, ids[i]);
        const row = el('button', 'hm-worker');
        row.type = 'button';
        const dot = el('span', 'hm-role-dot');
        dot.style.background = ROLE_COLOURS[def.role] || '#9a9285';
        row.appendChild(dot);
        row.appendChild(el('span', 'hm-worker-name', v ? v.name : 'villager #' + ids[i]));
        row.appendChild(el('span', 'hm-worker-role', titleCase(def.role || '')));
        const vid = ids[i];
        row.addEventListener('click', () => this.select('villager', vid));
        wl.appendChild(row);
      }
      body.appendChild(wl);
    } else {
      this.elWorkerHead = null;
    }

    // Recipe / production.
    const recipe = this.activeRecipe(b, def);
    if (recipe) {
      body.appendChild(el('div', 'hm-sub-h', 'Production'));
      const line = el('div', 'hm-recipe');
      this.appendItemChips(line, recipe.in);
      line.appendChild(el('span', 'hm-arrow', '→'));
      this.appendItemChips(line, recipe.out);
      line.appendChild(el('span', 'hm-recipe-time', recipe.time + 's'));
      body.appendChild(line);
    } else if (def.gathers) {
      body.appendChild(el('div', 'hm-sub-h', 'Gathering'));
      const info = RESOURCE_INFO[def.gathers.resource];
      const line = el('div', 'hm-recipe');
      line.appendChild(el('span', 'hm-recipe-note',
        'Collects ' + (info ? info.name.toLowerCase() : 'resources') + ' within '
        + def.gathers.radius + ' tiles → ' + def.gathers.yield + ' '
        + itemName(def.gathers.item).toLowerCase() + ' every ' + def.gathers.time + 's'));
      body.appendChild(line);
    } else if (def.grows) {
      body.appendChild(el('div', 'hm-sub-h', 'Growing'));
      const line = el('div', 'hm-recipe');
      line.appendChild(el('span', 'hm-recipe-note',
        'Grows ' + itemName(def.grows.item).toLowerCase() + ' from its own ground — '
        + def.grows.base + ' every ' + def.grows.time + 's, nothing in Winter'));
      body.appendChild(line);
    }

    // Alternative recipes (Weaponsmith / Armourer, ADDENDUM D6).
    if (Array.isArray(def.recipes) && def.recipes.length > 1) {
      const pick = el('div', 'hm-recipes');
      for (let i = 0; i < def.recipes.length; i++) {
        const r = def.recipes[i];
        const locked = r.tier > this.tierNow();
        const btn = el('button', 'hm-rbtn' + (locked ? ' locked' : ''), itemName(r.id));
        btn.type = 'button';
        btn.title = locked
          ? 'Unlocks at tier ' + r.tier
          : 'Make ' + itemName(r.id) + ' from ' + this.costText(r.in);
        if (!locked) btn.addEventListener('click', () => this.setRecipe(b.id, r.id));
        pick.appendChild(btn);
        if ((b.recipeId || (def.recipe && Object.keys(def.recipe.out)[0])) === r.id) {
          btn.classList.add('on');
        }
      }
      body.appendChild(pick);
    }

    // Inventory bars.
    const invIds = this.inventoryIds(b, def);
    // J3.2's escape hatch. A site is refused by buildings.discard (its delivered
    // units are its reservation), so the control is only offered once built.
    const canDiscard = b.built && this.game.buildings
      && typeof this.game.buildings.discard === 'function';
    if (invIds.length) {
      body.appendChild(el('div', 'hm-sub-h', 'Stores'));
      const wrap = el('div', 'hm-invs');
      this.invBars = [];
      for (let i = 0; i < invIds.length; i++) {
        const id = invIds[i];
        const row = el('div', 'hm-inv');
        const lab = el('div', 'hm-inv-lab');
        lab.appendChild(el('span', 'hm-inv-icon', itemIcon(id)));
        lab.appendChild(el('span', 'hm-inv-name', itemName(id)));
        const qty = el('span', 'hm-inv-qty', '0');
        lab.appendChild(qty);
        if (canDiscard) {
          const drop = el('button', 'hm-inv-drop', '✕');
          drop.type = 'button';
          drop.title = 'Throw some of this away — the last resort for a wedged store';
          drop.addEventListener('click', () => this.askDiscard(b.id, id));
          lab.appendChild(drop);
        }
        row.appendChild(lab);
        const track = el('div', 'hm-bar hm-bar-sm');
        const fill = el('div', 'hm-bar-fill');
        fill.style.background = itemColour(id);
        track.appendChild(fill);
        row.appendChild(track);
        wrap.appendChild(row);
        this.invBars.push({ id, qty, fill });
      }
      body.appendChild(wrap);
    } else {
      this.invBars = [];
    }

    // Output so far.
    this.elMade = el('div', 'hm-made', '');
    body.appendChild(this.elMade);

    // Controls.
    const ctrl = el('div', 'hm-controls');
    if (def.jobs > 0 || def.recipe || def.gathers || def.grows) {
      const pr = el('div', 'hm-prio');
      pr.appendChild(el('span', 'hm-prio-lab', 'Priority'));
      this.prioBtns = [];
      const names = ['Low', 'Normal', 'High'];
      for (let i = 0; i < 3; i++) {
        const btn = el('button', 'hm-prio-btn', names[i]);
        btn.type = 'button';
        btn.title = 'Workers fill high-priority buildings first';
        btn.addEventListener('click', () => this.setPriority(b.id, i));
        pr.appendChild(btn);
        this.prioBtns.push(btn);
      }
      ctrl.appendChild(pr);
    } else {
      this.prioBtns = null;
    }

    const up = b.built ? UPGRADE_TO[def.id] : null;
    if (up && up.tier <= this.tierNow() && this.canUpgradeHere(up.id, b)) {
      const box = el('div', 'hm-upgrade');
      const btn = el('button', 'hm-btn hm-btn-up', 'Upgrade to ' + up.name);
      btn.type = 'button';
      btn.title = 'Place the ' + up.name + ' over this one — you pay the difference';
      btn.addEventListener('click', () => {
        this.chooseBuild(up.id);
        this.toast('Now click the ' + def.name + ' to upgrade it.', 'good');
      });
      box.appendChild(btn);
      const diff = this.upgradeCost(up.id, b);
      const beds = def.houses && up.houses
        ? ' \u00b7 ' + def.houses + ' beds \u2192 ' + up.houses : '';
      setToggle(btn, 'poor', !this.canAfford(diff));
      box.appendChild(el('div', 'hm-upgrade-sub',
        (diff ? this.costText(diff) : 'the difference')
        + ' \u00b7 keeps everyone living here' + beds));
      ctrl.appendChild(box);
    }

    const btns = el('div', 'hm-btnrow');
    this.elPauseBtn = el('button', 'hm-btn', 'Pause');
    this.elPauseBtn.type = 'button';
    this.elPauseBtn.addEventListener('click', () => this.toggleBuilding(b.id));
    btns.appendChild(this.elPauseBtn);
    const dem = el('button', 'hm-btn hm-btn-bad hm-btn-dem', b.built ? 'Demolish' : 'Cancel');
    dem.type = 'button';
    dem.title = b.built
      ? 'Pull it down. Nothing is refunded — you will be asked to confirm.'
      : 'Cancel the site. Everything delivered is refunded.';
    dem.addEventListener('click', () => this.askDemolish(b.id));
    btns.appendChild(dem);
    ctrl.appendChild(btns);
    body.appendChild(ctrl);
  }

  /**
   * Which of the four damage-block shapes this building is in. Part of the
   * inspector's structural signature, so laying the road that unblocks a repair
   * rebuilds the block rather than leaving the old refusal on screen.
   */
  repairShape(b, def) {
    const bs = this.game.buildings;
    if (!b.built || !bs || typeof bs.repairState !== 'function') return '';
    if (typeof bs.isRepairing === 'function' && bs.isRepairing(b.id)) return 'mending';
    if (!(numOf(b.hp, 1) < numOf(b.maxHp, 1))) return '';
    return 'hurt:' + repairBlocker(b, def);
  }

  /**
   * The damage block, in one of three shapes: a Repair offer, a refusal that
   * names the blocker and the remedy, or a live repair with its phase, its
   * shortfall and a way out.
   *
   * The refusal is the important one. A repair reuses the construction delivery
   * path, so committing one on a building no carrier can reach reserves
   * materials against a delivery that will never be posted — a silent, forever
   * stall, which is the exact failure this project has already shipped three
   * times (§16.8, AN7). It is refused up front and told why instead.
   */
  renderRepair(parent, b, def) {
    this.elRepair = null;
    this.elRepBtn = null;
    this.elRepSub = null;
    this.elRepBar = null;
    this.repairChips = null;
    const bs = this.game.buildings;
    if (!b.built || !bs || typeof bs.repairState !== 'function') return;
    const mending = typeof bs.isRepairing === 'function' && bs.isRepairing(b.id);
    if (!mending && !(numOf(b.hp, 1) < numOf(b.maxHp, 1))) return;

    const box = el('div', 'hm-repair');
    this.elRepair = box;
    box.appendChild(el('div', 'hm-sub-h hm-repair-h', mending ? 'Repair' : 'Damage'));
    this.elRepHp = el('div', 'hm-repair-hp', '');
    box.appendChild(this.elRepHp);
    const hpTrack = el('div', 'hm-bar hm-bar-sm');
    this.elRepHpFill = el('div', 'hm-bar-fill');
    hpTrack.appendChild(this.elRepHpFill);
    box.appendChild(hpTrack);
    parent.appendChild(box);

    if (mending) {
      this.elRepMain = el('div', 'hm-repair-main', '');
      box.appendChild(this.elRepMain);
      this.elRepBar = el('div', 'hm-bar');
      this.elRepFill = el('div', 'hm-bar-fill');
      this.elRepBar.appendChild(this.elRepFill);
      box.appendChild(this.elRepBar);
      this.elRepLabel = el('div', 'hm-bar-label', '');
      box.appendChild(this.elRepLabel);
      // The cost is locked at begin, so it is read off the live repair —
      // `repairCost` answers null for anything already mending.
      const st = bs.repairState(b.id) || { cost: {} };
      const chips = el('div', 'hm-chips');
      const ids = Object.keys(st.cost || {});
      this.repairChips = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const c = el('span', 'hm-chip');
        c.appendChild(el('span', 'hm-chip-icon', itemIcon(id)));
        const t = el('span', 'hm-chip-text', '');
        c.appendChild(t);
        chips.appendChild(c);
        this.repairChips.push({ id, need: st.cost[id], chip: c, text: t });
      }
      box.appendChild(chips);
      const cancel = el('button', 'hm-btn hm-btn-bad hm-btn-repcancel', 'Cancel repair');
      cancel.type = 'button';
      cancel.title = 'Materials still in the stores are released; what has already gone into the walls stays spent.';
      cancel.addEventListener('click', () => this.cancelRepair(b.id));
      box.appendChild(cancel);
      return;
    }

    const why = repairBlocker(b, def);
    if (why) {
      setCls(box, 'hm-repair blocked');
      const info = REPAIR_BLOCKED[why] || REPAIR_BLOCKED['no road'];
      box.appendChild(el('div', 'hm-repair-main', info.say));
      box.appendChild(el('div', 'hm-repair-sub', 'Fix: ' + info.fix));
      return;
    }

    this.elRepBtn = el('button', 'hm-btn hm-btn-rep', 'Repair');
    this.elRepBtn.type = 'button';
    this.elRepBtn.addEventListener('click', () => this.beginRepair(b.id));
    box.appendChild(this.elRepBtn);
    this.elRepSub = el('div', 'hm-repair-sub', '');
    box.appendChild(this.elRepSub);
  }

  /** The live numbers in the damage block. See renderRepair for the shapes. */
  patchRepair(b) {
    if (!this.elRepair) return;
    const bs = this.game.buildings;
    const hp = Math.max(0, Math.round(numOf(b.hp, 0)));
    const max = Math.max(1, Math.round(numOf(b.maxHp, 1)));
    const frac = clamp(hp / max, 0, 1);
    setText(this.elRepHp, hp + ' of ' + max + ' hit points standing');
    setStyle(this.elRepHpFill, 'width', Math.round(frac * 100) + '%');
    setCls(this.elRepHpFill, 'hm-bar-fill '
      + (frac < 0.35 ? 'bad' : frac < 0.75 ? 'warn' : 'good'));

    const st = bs && typeof bs.repairState === 'function' ? bs.repairState(b.id) : null;
    if (st && this.elRepBar) {
      const hauling = st.phase === 'hauling';
      const pct = Math.round(clamp(numOf(st.progress, 0), 0, 1) * 100);
      setText(this.elRepMain, hauling
        ? 'Fetching materials — ' + st.shortfall + ' still to come.'
        : 'Everything is here. The builders are raising it.');
      setStyle(this.elRepFill, 'width', pct + '%');
      setCls(this.elRepFill, 'hm-bar-fill' + (hauling ? '' : ' good'));
      setText(this.elRepLabel, pct + '% mended · ' + (hauling
        ? Math.round(numOf(st.supplied, 0) * 100) + '% of the materials delivered'
        : Math.round(numOf(st.work, 0) * 100) + '% of the work done'));
      const chips = this.repairChips || [];
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i];
        const got = numOf((st.delivered || {})[c.id], 0);
        setText(c.text, got + ' / ' + c.need + ' ' + itemName(c.id).toLowerCase());
        setToggle(c.chip, 'done', got >= c.need);
      }
      return;
    }

    if (!this.elRepBtn) return;   // refused: the copy is static, nothing to patch
    const cost = bs && typeof bs.repairCost === 'function' ? bs.repairCost(b.id) : null;
    if (!cost) return;
    // AO2 — `canAfford` and every number below ask `available()`, the same
    // question `beginRepair` asks. A repair reserves like a build site, so
    // gross stock would grey the wrong button and price the wrong shortfall.
    const afford = this.canAfford(cost);
    setText(this.elRepBtn, 'Repair · ' + this.costText(cost));
    setToggle(this.elRepBtn, 'poor', !afford);
    this.elRepBtn.disabled = !afford;
    setText(this.elRepSub, afford
      ? 'Half what this much damage costs to rebuild, and it keeps working while it mends.'
      : this.shortText(cost));
  }

  /** Which line of a price the town cannot cover, priced in `available` (AO2). */
  shortText(cost) {
    const parts = [];
    for (const k in (cost || {})) {
      const gap = cost[k] - this.available(k);
      if (gap > 0) parts.push(gap + ' more ' + itemName(k).toLowerCase());
    }
    return parts.length
      ? 'Not enough materials — ' + joinList(parts) + ' needed.'
      : 'Not enough materials.';
  }

  /** Would placing `upId` on this building's own tile upgrade it in place? */
  canUpgradeHere(upId, b) {
    const m = this.game.buildings;
    if (!m || typeof m.upgradeTargetAt !== 'function') return false;
    return !!m.upgradeTargetAt(upId, b.x, b.y);
  }

  /** The difference §7 actually charges, not the new building's full cost. */
  upgradeCost(upId, b) {
    const m = this.game.buildings;
    if (!m || typeof m.costFor !== 'function') return null;
    return m.costFor(upId, b.x, b.y) || null;
  }

  /** Point the status block's one action button at a cut-off cause, or hide it. */
  setStatusGo(cause) {
    const btn = this.elStatusGo;
    if (!btn) return;
    if (!cause) {
      this.statusGoAt = null;
      if (btn.style.display !== 'none') btn.style.display = 'none';
      return;
    }
    const seal = cause.kind === 'building' ? buildingById(this.game, cause.id) : null;
    this.statusGoAt = {
      x: seal ? seal.x + (seal.w || 1) / 2 : cause.x + 0.5,
      y: seal ? seal.y + (seal.h || 1) / 2 : cause.y + 0.5,
    };
    setText(btn, cause.kind === 'building' && !cause.keep
      ? 'Show me the ' + (cause.name || 'building')
      : 'Show me the gap');
    btn.title = 'Fly the camera to ' + cause.x + ',' + cause.y;
    if (btn.style.display === 'none') btn.style.display = '';
  }

  patchBuildingBody(b, def) {
    const reason = b.idleReason || '';
    const working = !reason;
    if (this.elStatusMain) {
      if (working) {
        setText(this.elStatusMain, b.built ? 'Working.' : 'Building.');
        setText(this.elStatusFix, b.built
          ? 'Everything this building needs is arriving.'
          : 'Materials are on the way.');
        setCls(this.elStatus, 'hm-status ok');
        this.setStatusGo(null);
      } else {
        const cause = reason === 'cut off' ? this.causeOf(b) : null;
        const info = idleInfo(reason, b, cause);
        setText(this.elStatusMain, info.say);
        setText(this.elStatusFix, info.fix ? 'Fix: ' + info.fix : '');
        setCls(this.elStatus, 'hm-status sev' + info.severity);
        this.setStatusGo(cause);
      }
    }

    this.patchRepair(b);

    if (this.elProgTrack && !b.built) {
      const pct = clamp(numOf(b.progress, 0) / Math.max(1, def.buildTime), 0, 1);
      setStyle(this.elProgFill, 'width', Math.round(pct * 100) + '%');
      setText(this.elProgLabel, Math.round(pct * 100) + '% raised · '
        + Math.round(numOf(b.progress, 0)) + ' of ' + def.buildTime + ' builder-seconds');
      const chips = this.deliveryChips || [];
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i];
        const got = numOf((b.delivered || {})[c.id], 0);
        setText(c.text, got + ' / ' + c.need + ' ' + itemName(c.id).toLowerCase());
        setToggle(c.chip, 'done', got >= c.need);
      }
    }

    if (this.elWorkerHead) {
      setText(this.elWorkerHead, 'Workers · ' + (b.workers ? b.workers.length : 0) + ' of ' + def.jobs);
    }

    const bars = this.invBars || [];
    for (let i = 0; i < bars.length; i++) {
      const row = bars[i];
      const qty = numOf((b.inv || {})[row.id], 0);
      let room = 12;
      if (this.game.buildings && typeof this.game.buildings.capacityFor === 'function') {
        room = numOf(this.game.buildings.capacityFor(b, row.id), 12);
      }
      const cap = Math.max(1, qty + room);
      // The denominator is room that exists *right now* and shrinks as the
      // class fills, so "20 / 20" would read as a cap of 20. Say full instead.
      setText(row.qty, room > 0 ? qty + ' / ' + cap : qty + ' · full');
      setStyle(row.fill, 'width', Math.round(clamp(qty / cap, 0, 1) * 100) + '%');
      setToggle(row.fill, 'full', room <= 0 && qty > 0);
    }

    if (this.elMade) {
      const made = numOf(b.producedTotal, 0);
      setText(this.elMade, made > 0 ? 'Produced ' + fmtNum(made) + ' since it was raised.' : '');
    }

    if (this.elPauseBtn) {
      const active = b.active !== false;
      setText(this.elPauseBtn, active ? 'Pause' : 'Resume');
      setToggle(this.elPauseBtn, 'on', !active);
    }
    if (this.prioBtns) {
      const p = clamp(numOf(b.priority, 1) | 0, 0, 2);
      for (let i = 0; i < 3; i++) setToggle(this.prioBtns[i], 'on', i === p);
    }
  }

  inspectVillager() {
    const game = this.game;
    const v = villagerById(game, this.selId);
    if (!v) { this.clearSelection(); return; }
    this.elInspector.style.display = '';
    setText(this.elInspTitle, v.name || 'Villager');
    setText(this.elInspTier, titleCase(v.role || 'idler'));

    const sig = 'v' + v.id + '|' + (v.role || '') + (v.conscript ? '|d' : '');
    if (sig !== this.inspectSig) {
      this.inspectSig = sig;
      this.renderVillagerBody(v);
    }
    this.patchVillagerBody(v);
  }

  renderVillagerBody(v) {
    const body = this.elInspBody;
    clearNode(body);

    const top = el('div', 'hm-vill-top');
    const disc = el('div', 'hm-vill-disc');
    disc.style.background = ROLE_COLOURS[v.role] || '#9a9285';
    disc.textContent = (v.name || '?').charAt(0);
    top.appendChild(disc);
    const meta = el('div', 'hm-vill-meta');
    this.elActivity = el('div', 'hm-activity', '');
    meta.appendChild(this.elActivity);
    this.elVillWhere = el('div', 'hm-vill-where', '');
    meta.appendChild(this.elVillWhere);
    top.appendChild(meta);
    body.appendChild(top);

    const facts = el('div', 'hm-facts hm-facts-wide');
    this.fAge = this.fact('Age', '');
    this.fJob = this.fact('Works at', '');
    this.fHome = this.fact('Lives at', '');
    facts.appendChild(this.fAge);
    facts.appendChild(this.fJob);
    facts.appendChild(this.fHome);
    body.appendChild(facts);

    body.appendChild(el('div', 'hm-sub-h', 'Condition'));
    this.vHealth = this.makeStatBar(body, 'Health');
    this.vHunger = this.makeStatBar(body, 'Hunger');

    // K6: a kit may be half a kit. The weapon names it and sets power, the
    // armour sets hit points, so neither half can be read off the other —
    // the armour line is spelled out rather than inferred from the name.
    this.elKitName = null;
    if (this.kitFor(v)) {
      body.appendChild(el('div', 'hm-sub-h', 'Kit'));
      const kit = el('div', 'hm-kit');
      this.elKitName = el('div', 'hm-kit-name', '');
      this.elKitGear = el('div', 'hm-kit-gear', '');
      this.elKitStats = el('div', 'hm-kit-stats', '');
      kit.appendChild(this.elKitName);
      kit.appendChild(this.elKitGear);
      kit.appendChild(this.elKitStats);
      body.appendChild(kit);
    }

    this.elCarry = el('div', 'hm-carry', '');
    body.appendChild(this.elCarry);
  }

  /** The one line worth a frame of its own — see UI.update(). */
  refreshActivity(v) {
    if (!this.elActivity) return;
    const who = v || (this.selId >= 0 ? villagerById(this.game, this.selId) : null);
    if (!who) return;
    const act = activityOf(who, this.game);
    setText(this.elActivity, act.charAt(0).toUpperCase() + act.slice(1));
  }

  patchVillagerBody(v) {
    const game = this.game;
    this.refreshActivity(v);
    const home = v.homeId >= 0 ? buildingName(game, v.homeId) : '';
    setText(this.elVillWhere, 'at ' + Math.round(numOf(v.vx, 0)) + ', ' + Math.round(numOf(v.vy, 0))
      + (home ? '' : ' · homeless'));

    setText(this.fAge.lastChild, Math.floor(numOf(v.age, 18)) + ' years');
    setText(this.fJob.lastChild, v.jobId >= 0 ? buildingName(game, v.jobId) || 'a building' : 'unemployed');
    setText(this.fHome.lastChild, home || 'nowhere');

    const h = clamp(numOf(v.health, 70), 0, 100);
    setText(this.vHealth.val, Math.round(h) + ' / 100');
    setStyle(this.vHealth.fill, 'width', Math.round(h) + '%');
    setCls(this.vHealth.fill, 'hm-bar-fill ' + (h < 25 ? 'bad' : h < 55 ? 'warn' : 'good'));

    const hg = clamp(numOf(v.hunger, 0), 0, 1) * 100;
    setText(this.vHunger.val, hg < 25 ? 'fed' : hg < 55 ? 'peckish' : hg < 85 ? 'hungry' : 'starving');
    setStyle(this.vHunger.fill, 'width', Math.round(hg) + '%');
    setCls(this.vHunger.fill, 'hm-bar-fill ' + (hg > 85 ? 'bad' : hg > 55 ? 'warn' : 'good'));

    const kit = this.elKitName ? this.kitFor(v) : null;
    if (kit) {
      setText(this.elKitName, (kit.name || 'Militia') + (v.conscript ? ' · drafted' : ''));
      const gear = [];
      gear.push(kit.weapon ? itemName(kit.weapon) : 'no weapon — bare hands');
      gear.push(kit.armour ? itemName(kit.armour) : 'no armour');
      if (kit.shield) gear.push(itemName(kit.shield));
      setText(this.elKitGear, gear.join(' · '));
      setText(this.elKitStats, 'Power ' + Math.round(numOf(kit.power, 0)) + ' · '
        + Math.round(numOf(kit.maxHp, 0)) + ' hit points'
        + (numOf(kit.range, 1) > 1 ? ' · shoots ' + kit.range + ' tiles' : ''));
    }

    const c = v.carry;
    if (c && c.qty > 0) {
      setText(this.elCarry, itemIcon(c.item) + '  Carrying ' + c.qty + ' ' + itemName(c.item).toLowerCase());
      this.elCarry.style.display = '';
    } else {
      this.elCarry.style.display = 'none';
    }
  }

  /** A soldier's equipment, or null for anyone who is not one. */
  kitFor(v) {
    const mil = this.game.military;
    if (!v || !mil || typeof mil.kitOf !== 'function') return null;
    if (v.role !== 'soldier' && !v.conscript) return null;
    return mil.kitOf(v.id) || null;
  }

  makeStatBar(parent, label) {
    const row = el('div', 'hm-inv');
    const lab = el('div', 'hm-inv-lab');
    lab.appendChild(el('span', 'hm-inv-name', label));
    const val = el('span', 'hm-inv-qty', '');
    lab.appendChild(val);
    row.appendChild(lab);
    const track = el('div', 'hm-bar hm-bar-sm');
    const fill = el('div', 'hm-bar-fill');
    track.appendChild(fill);
    row.appendChild(track);
    parent.appendChild(row);
    return { val, fill };
  }

  fact(label, value) {
    const f = el('div', 'hm-fact');
    f.appendChild(el('span', 'hm-fact-k', label));
    f.appendChild(el('span', 'hm-fact-v', value));
    return f;
  }

  appendItemChips(line, map) {
    const ids = Object.keys(map || {});
    for (let i = 0; i < ids.length; i++) {
      const c = el('span', 'hm-chip');
      c.appendChild(el('span', 'hm-chip-icon', itemIcon(ids[i])));
      c.appendChild(el('span', 'hm-chip-text', map[ids[i]] + ' ' + itemName(ids[i]).toLowerCase()));
      line.appendChild(c);
    }
  }

  inventoryIds(b, def) {
    const out = [];
    const seen = {};
    const add = (id) => { if (id && !seen[id]) { seen[id] = 1; out.push(id); } };
    const r = this.activeRecipe(b, def);
    if (r) {
      Object.keys(r.in || {}).forEach(add);
      Object.keys(r.out || {}).forEach(add);
    }
    if (def.gathers) add(def.gathers.item);
    if (def.grows) {
      add(def.grows.item);
      if (def.grows.alt) add(def.grows.alt.item);
    }
    Object.keys(b.inv || {}).forEach((id) => { if (numOf(b.inv[id], 0) > 0) add(id); });
    return out.slice(0, 10);
  }

  activeRecipe(b, def) {
    if (Array.isArray(def.recipes) && b.recipeId) {
      for (let i = 0; i < def.recipes.length; i++) {
        if (def.recipes[i].id === b.recipeId) return def.recipes[i];
      }
    }
    return def.recipe || null;
  }

  setPriority(id, p) {
    const m = this.game.buildings;
    if (m && typeof m.setPriority === 'function') m.setPriority(id, p);
    else this.toast('Priority needs buildings.setPriority().', 'warn');
    this.inspectSig = '';
  }

  toggleBuilding(id) {
    const m = this.game.buildings;
    if (m && typeof m.setActive === 'function') {
      const b = buildingById(this.game, id);
      m.setActive(id, b ? b.active === false : true);
    } else if (m && typeof m.toggleActive === 'function') {
      m.toggleActive(id);
    } else {
      this.toast('Pausing needs buildings.setActive().', 'warn');
    }
    this.inspectSig = '';
  }

  demolish(id, built) {
    const m = this.game.buildings;
    if (!built && m && typeof m.cancel === 'function') m.cancel(id);
    else if (m && typeof m.demolish === 'function') m.demolish(id);
    else if (m && typeof m.remove === 'function') m.remove(id);
    else { this.toast('Demolition needs buildings.demolish().', 'warn'); return; }
    this.clearSelection();
  }

  /**
   * Pulling a finished building down refunds nothing and cannot be undone, so
   * it asks first — the same gate the discard dialog puts on destroying goods.
   * Cancelling an unfinished site refunds everything, so it stays one click.
   * input.js's demolish tool routes through here too.
   */
  askDemolish(id) {
    const b = buildingById(this.game, id);
    if (!b) return;
    const def = defOf(b);
    const name = def ? def.name : 'building';
    if (!b.built) { this.demolish(id, false); return; }
    const workers = b.workers ? b.workers.length : 0;
    const bits = [];
    if (workers > 0) bits.push(workers === 1 ? 'One worker loses their job' : workers + ' workers lose their jobs');
    if (def && def.houses) bits.push('anyone sleeping here is turned out');
    if (def && def.storage) bits.push('whatever it holds must find another store');
    this.showConfirm({
      kicker: 'Pull it down',
      title: 'Demolish the ' + name + '?',
      lede: 'Nothing is refunded — the timber and stone in it are gone for good.'
        + (bits.length ? ' ' + joinList(bits).replace(/^./, (c) => c.toUpperCase()) + '.' : ''),
      verb: 'Demolish',
      onConfirm: () => {
        this.demolish(id, true);
        this.toast('The ' + name + ' has been pulled down.', 'warn');
      },
    });
  }

  setRecipe(id, recipeId) {
    const m = this.game.buildings;
    if (m && typeof m.setRecipe === 'function') m.setRecipe(id, recipeId);
    else this.toast('Recipe choice needs buildings.setRecipe().', 'warn');
    this.inspectSig = '';
  }

  /**
   * The only place in the game where matter deliberately leaves the world
   * (J3.2), and the §16 escape hatch when a store is wedged full of something
   * nothing will ever consume. Player-driven and confirmed, always.
   */
  askDiscard(id, item) {
    const b = buildingById(this.game, id);
    const m = this.game.buildings;
    if (!b || !m || typeof m.discard !== 'function') return;
    const held = Math.floor(numOf((b.inv || {})[item], 0));
    const name = itemName(item).toLowerCase();
    if (held <= 0) {
      this.toast('There is no ' + name + ' here to throw out.', 'warn');
      return;
    }
    const def = defOf(b);
    this.showConfirm({
      kicker: 'Throw goods away',
      title: 'Throw out ' + name + '?',
      lede: 'The ' + (def ? def.name : 'building') + ' holds ' + held + ' ' + name
        + '. What you throw out is destroyed — nothing is refunded and nobody is fed'
        + ' by it. Use this to free a store that nothing will ever empty.',
      max: held,
      unit: name,
      verb: 'Throw out',
      onConfirm: (qty) => {
        const gone = m.discard(b, item, qty);
        this.toast(gone > 0
          ? 'Threw out ' + gone + ' ' + name + '.'
          : 'Nothing was thrown out.', gone > 0 ? 'warn' : 'info');
        this.inspectSig = '';
      },
    });
  }

  /* ---- build menu ------------------------------------------------------ */

  costText(cost) {
    const ids = Object.keys(cost || {});
    const parts = [];
    for (let i = 0; i < ids.length; i++) parts.push(cost[ids[i]] + ' ' + itemName(ids[i]).toLowerCase());
    return parts.join(', ');
  }

  unlockText(def) {
    const t = TIERS[def.tier - 1];
    if (!t) return 'Tier ' + def.tier;
    const bits = [];
    if (t.pop) bits.push(t.pop + ' people');
    if (t.health) bits.push('health ' + t.health);
    if (t.happiness) bits.push('happiness ' + t.happiness);
    for (let i = 0; i < t.requires.length; i++) {
      const d = BUILDING_BY_ID[t.requires[i]];
      if (d) bits.push('a ' + d.name);
    }
    return t.name + ' — ' + joinList(bits);
  }

  refreshBuildMenu(rebuild) {
    const tier = this.tierNow();
    const defs = catDefs(this.activeCat);

    if (rebuild || this.menuCat !== this.activeCat) {
      this.menuCat = this.activeCat;
      for (let i = 0; i < CATEGORIES.length; i++) {
        setToggle(this.catTabs[CATEGORIES[i].id], 'on', CATEGORIES[i].id === this.activeCat);
      }
      clearNode(this.elGrid);
      this.entryEls.clear();
      for (let i = 0; i < defs.length; i++) this.elGrid.appendChild(this.makeEntry(defs[i]));
      this.elGrid.scrollTop = 0;
    }

    // Affordability + lock state only, every 400ms, for the open tab only.
    const toolDef = this.currentToolDef();
    for (let i = 0; i < defs.length; i++) {
      const def = defs[i];
      const e = this.entryEls.get(def.id);
      if (!e) continue;
      // A unique pre-placed building is never placeable, so it must never read
      // as affordable — §13 still shows it rather than hiding it.
      const oneOnly = def.unique === true || def.prePlaced === true;
      const locked = oneOnly || def.tier > tier;
      const afford = locked ? false : this.canAfford(def.cost);
      setCls(e.node, 'hm-entry' + (locked ? ' locked' : afford ? '' : ' poor')
        + (toolDef === def.id ? ' on' : ''));
      if (e.lockText) setText(e.lockText, oneOnly ? 'One only' : locked ? TIERS[def.tier - 1].name : '');
      for (let j = 0; j < e.costEls.length; j++) {
        const c = e.costEls[j];
        setToggle(c.node, 'short', !locked && this.available(c.id) < c.qty);
      }
    }
  }

  makeEntry(def) {
    const node = el('button', 'hm-entry');
    node.type = 'button';

    const swatch = el('span', 'hm-entry-swatch');
    const pal = def.palette || {};
    swatch.style.background = 'linear-gradient(160deg,' + (pal.roof || '#8c5a4a') + ' 0 48%,'
      + (pal.wall || '#cfc0a3') + ' 48% 100%)';
    swatch.style.borderColor = pal.trim || '#6b5138';
    node.appendChild(swatch);

    const main = el('span', 'hm-entry-main');
    // Jobs sit on the name line so the cost row can clip without hiding them.
    const titleRow = el('span', 'hm-entry-title');
    titleRow.appendChild(el('span', 'hm-entry-name', def.name));
    if (def.jobs) {
      const j = el('span', 'hm-entry-jobs');
      j.appendChild(el('span', 'hm-cost-icon', '\u{1f464}'));
      j.appendChild(el('span', null, String(def.jobs)));
      j.title = def.jobs + ' worker slots';
      titleRow.appendChild(j);
    }
    main.appendChild(titleRow);
    const costs = el('span', 'hm-entry-costs');
    const costEls = [];
    const ids = Object.keys(def.cost || {});
    for (let i = 0; i < ids.length; i++) {
      const c = el('span', 'hm-cost');
      c.appendChild(el('span', 'hm-cost-icon', itemIcon(ids[i])));
      c.appendChild(el('span', 'hm-cost-n', String(def.cost[ids[i]])));
      costs.appendChild(c);
      costEls.push({ id: ids[i], qty: def.cost[ids[i]], node: c });
    }
    // U3: the patch floor sits beside the cost because it is a cost — the one
    // the player pays in map, and the only reason placement will refuse a
    // gathering hut on ground that otherwise looks perfect.
    const need = gatherNeed(def);
    if (need) {
      const n = el('span', 'hm-cost hm-need');
      n.appendChild(el('span', 'hm-cost-icon', '\u{1f33f}'));
      n.appendChild(el('span', 'hm-cost-n', '≥' + fmtNum(need.min) + '/day'));
      n.title = need.text;
      costs.appendChild(n);
    }
    main.appendChild(costs);

    // The unlock tier replaces the cost line on a locked entry, so the name
    // never gets squeezed out of a narrow column.
    const lock = el('span', 'hm-entry-lock');
    lock.appendChild(el('span', 'hm-lock-glyph', '\u{1f512}'));
    const lockText = el('span', 'hm-lock-text', '');
    lock.appendChild(lockText);
    main.appendChild(lock);
    node.appendChild(main);
    node.title = def.name;

    node.addEventListener('click', () => this.chooseBuild(def.id));
    node.addEventListener('mouseenter', (e) => this.showTip(e, def));
    node.addEventListener('mousemove', (e) => this.moveTip(e));
    node.addEventListener('mouseleave', () => this.hideTip());

    this.entryEls.set(def.id, { node, costEls, lockText });
    return node;
  }

  showTip(e, def) {
    const tip = this.elTip;
    clearNode(tip);
    tip.appendChild(el('div', 'hm-tip-name', def.name));
    if (def.unique === true || def.prePlaced === true) {
      tip.appendChild(el('div', 'hm-tip-lock', 'One only — the valley already has it.'));
    } else if (def.tier > this.tierNow()) {
      tip.appendChild(el('div', 'hm-tip-lock', 'Unlocks at ' + this.unlockText(def)));
    }
    tip.appendChild(el('div', 'hm-tip-desc', def.desc || ''));
    const facts = [];
    facts.push(def.w + '×' + def.h + ' tiles');
    if (def.jobs) facts.push(def.jobs + (def.jobs === 1 ? ' job' : ' jobs'));
    if (def.houses) facts.push(def.houses + ' beds');
    if (def.storage) facts.push('stores ' + def.storage.cap);
    if (def.buildTime) facts.push(def.buildTime + 's to raise');
    if (def.upkeep && def.upkeep.coin) facts.push(def.upkeep.coin + ' coin/day');
    tip.appendChild(el('div', 'hm-tip-facts', facts.join(' · ')));
    tip.appendChild(el('div', 'hm-tip-cost', 'Cost: ' + (this.costText(def.cost) || 'free')));
    const need = gatherNeed(def);
    if (need) tip.appendChild(el('div', 'hm-tip-req', need.text));
    if (def.needsTerrain) {
      tip.appendChild(el('div', 'hm-tip-req', 'Must be built beside ' + def.needsTerrain + '.'));
    }
    tip.style.display = '';
    this.moveTip(e);
  }

  moveTip(e) {
    const tip = this.elTip;
    if (tip.style.display === 'none') return;
    const w = tip.offsetWidth || 260;
    const h = tip.offsetHeight || 120;
    let x = e.clientX + 16;
    let y = e.clientY - h - 14;
    if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8;
    if (y < 8) y = e.clientY + 20;
    setStyle(tip, 'left', x + 'px');
    setStyle(tip, 'top', y + 'px');
  }

  hideTip() {
    this.elTip.style.display = 'none';
  }

  canAfford(cost) {
    const ids = Object.keys(cost || {});
    for (let i = 0; i < ids.length; i++) {
      if (this.available(ids[i]) < cost[ids[i]]) return false;
    }
    return true;
  }

  /* ---- toasts ----------------------------------------------------------- */

  toast(text, kind) {
    if (!text || !this.built) return;
    const k = kind || 'info';
    // Repeat messages stack a count instead of a wall of identical cards.
    for (let i = 0; i < this.toasts.length; i++) {
      const t = this.toasts[i];
      if (t.text === text) {
        t.n++;
        t.born = perfNow();
        setText(t.count, '×' + t.n);
        t.count.style.display = '';
        return;
      }
    }
    const node = el('div', 'hm-toast hm-toast-' + k);
    node.appendChild(el('span', 'hm-toast-dot', ''));
    node.appendChild(el('span', 'hm-toast-text', text));
    const count = el('span', 'hm-toast-n', '');
    count.style.display = 'none';
    node.appendChild(count);
    this.elToasts.appendChild(node);
    this.toasts.push({ id: ++this.toastSeq, text, node, count, n: 1, born: perfNow() });
    while (this.toasts.length > 5) {
      const old = this.toasts.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
  }

  updateToasts(wall) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      const age = wall - t.born;
      if (age > 6000) {
        if (t.node.parentNode) t.node.parentNode.removeChild(t.node);
        this.toasts.splice(i, 1);
      } else if (age > 5200) {
        setToggle(t.node, 'out', true);
      }
    }
  }

  /* ---- tier-up celebration ----------------------------------------------- */

  celebrateTier(p) {
    const tier = numOf(p && p.tier, this.tierNow());
    const t = TIERS[tier - 1] || TIERS[0];
    this.tierShown = tier;
    setText(this.elTierUpName, (p && p.name) || t.name);
    setText(this.elTierUpSub, tier === 2
      ? 'Your hamlet is a village. Granaries hold the Winter; the passes hold the rest.'
      : tier === 3
        ? 'A town, with a market square and a chapel bell. The valley has a centre now.'
        : tier === 4
          ? 'A city in the mountains. Whatever comes down the passes, it comes to something worth holding.'
          : 'A new beginning in the valley.');

    const unlocked = [];
    for (let i = 0; i < CATEGORIES.length; i++) {
      const list = BUILDINGS_BY_CAT[CATEGORIES[i].id];
      for (let j = 0; j < list.length; j++) if (list[j].tier === tier) unlocked.push(list[j].name);
    }
    setText(this.elTierUpList, unlocked.length
      ? unlocked.length + ' new buildings: ' + joinList(unlocked.slice(0, 6))
        + (unlocked.length > 6 ? ', and more' : '')
      : '');

    this.elTierUp.style.display = '';
    this.tierUpUntil = perfNow() + 5200;
    setToggle(this.elTierUp, 'in', true);
    this.toast('Hearthmere is a ' + ((p && p.name) || t.name) + ' now.', 'good');
    this.tMenu = 0;
    this.refreshBuildMenu(true);
  }

  updateTierUp(wall) {
    if (!this.tierUpUntil) return;
    if (wall > this.tierUpUntil) {
      this.tierUpUntil = 0;
      setToggle(this.elTierUp, 'in', false);
      this.elTierUp.style.display = 'none';
    }
  }

  /* ---- modals ------------------------------------------------------------ */

  maybeShowIntro() {
    // Private browsing throws on localStorage: show the intro, which is harmless.
    let seen = null;
    try {
      seen = window.localStorage.getItem(INTRO_KEY);
    } catch {
      this.storageBlocked = true;
    }
    if (seen) return;
    this.showIntro();
    try {
      window.localStorage.setItem(INTRO_KEY, '1');
    } catch {
      this.storageBlocked = true;
    }
  }

  showIntro() {
    const box = this.elModal;
    clearNode(box);
    setCls(box, 'hm-modal hm-modal-intro');
    box.appendChild(el('div', 'hm-modal-kicker', 'Hearthmere'));
    box.appendChild(el('h1', 'hm-modal-title', 'Feed the valley. Hold the passes.'));
    box.appendChild(el('p', 'hm-modal-lede',
      'You have ten people, a town centre and a cold lake. Raiders come down out of the'
      + ' mountains every couple of weeks, forever. Every loaf of bread on this map is'
      + ' carried there by somebody with a name.'));

    box.appendChild(el('div', 'hm-modal-h', 'Do these three things first'));
    const steps = el('ol', 'hm-steps');
    const items = [
      ['Build a Woodcutter’s Hut', 'beside the trees. Timber is the root of everything.'],
      ['Lay a dirt path (R)', 'from the Town Centre to its door. A building with no road does not work at all.'],
      ['Build a Cottage', 'so the next four villagers have somewhere to sleep.'],
    ];
    for (let i = 0; i < items.length; i++) {
      const li = el('li');
      li.appendChild(el('b', null, items[i][0] + ' '));
      li.appendChild(document.createTextNode(items[i][1]));
      steps.appendChild(li);
    }
    box.appendChild(steps);

    box.appendChild(el('div', 'hm-modal-h', 'Controls'));
    const keys = el('div', 'hm-keys');
    for (let i = 0; i < HOTKEYS.length; i++) {
      const row = el('div', 'hm-key');
      row.appendChild(el('kbd', null, HOTKEYS[i][0]));
      row.appendChild(el('span', null, HOTKEYS[i][1]));
      keys.appendChild(row);
    }
    box.appendChild(keys);
    box.appendChild(el('p', 'hm-modal-note',
      'Watch the Alerts panel on the left. Every stopped building tells you why it'
      + ' stopped, and what to do about it.'));

    const b = el('button', 'hm-btn hm-btn-big', 'Settle the valley');
    b.type = 'button';
    b.addEventListener('click', () => this.closeModal());
    box.appendChild(b);
    this.elModalShade.style.display = '';
    this.modalOpen = true;
  }

  showGameOver(p) {
    this.gameOver = true;
    const box = this.elModal;
    clearNode(box);
    setCls(box, 'hm-modal hm-modal-over');
    const reason = String((p && p.reason) || '').trim();
    box.appendChild(el('div', 'hm-modal-kicker', 'The end of the town'));
    box.appendChild(el('h1', 'hm-modal-title', 'Hearthmere is finished'));
    box.appendChild(el('p', 'hm-modal-lede', OVER_LEDE[reason]
      || (reason ? 'It ends here: ' + reason + '.' : 'Nobody is left.')));
    const s = (p && p.stats) || {};
    const grid = el('div', 'hm-over-grid');
    const rows = [
      ['Days survived', numOf(s.days, this.dayNow())],
      ['Peak population', numOf(s.peakPop, 0)],
      ['Raids held', numOf(s.raidsHeld, 0)],
      ['Tier reached', (TIERS[numOf(s.tier, this.tierNow()) - 1] || TIERS[0]).name],
    ];
    for (let i = 0; i < rows.length; i++) {
      const c = el('div', 'hm-over-cell');
      c.appendChild(el('div', 'hm-over-v', String(rows[i][1])));
      c.appendChild(el('div', 'hm-over-k', rows[i][0]));
      grid.appendChild(c);
    }
    box.appendChild(grid);

    const again = el('button', 'hm-btn hm-btn-big', 'Start again');
    again.type = 'button';
    again.addEventListener('click', () => this.restart());
    box.appendChild(again);
    const b = el('button', 'hm-btn hm-btn-big hm-btn-ghost', 'Look at the valley');
    b.type = 'button';
    b.title = 'Close this and look over what is left. The game is still over.';
    b.addEventListener('click', () => this.closeModal());
    box.appendChild(b);
    this.elModalShade.style.display = '';
    this.modalOpen = true;
  }

  /**
   * A dead town cannot be revived in place, so starting again means dropping
   * the save and reloading — which keeps the seed in the URL.
   */
  restart() {
    this.closeModal();
    if (typeof this.game.restart === 'function') { this.game.restart(); return; }
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      this.storageBlocked = true;
    }
    window.location.reload();
  }

  /**
   * A yes/no dialog with a quantity, for an action that cannot be undone.
   * `modalOpen` tells input.js to leave Escape alone while it is up.
   */
  showConfirm(o) {
    const box = this.elModal;
    clearNode(box);
    setCls(box, 'hm-modal hm-modal-confirm');
    box.appendChild(el('div', 'hm-modal-kicker', o.kicker || ''));
    box.appendChild(el('h1', 'hm-modal-title', o.title || 'Are you sure?'));
    box.appendChild(el('p', 'hm-modal-lede', o.lede || ''));

    const max = Math.max(1, Math.floor(numOf(o.max, 1)));
    let qty = max;
    const go = el('button', 'hm-btn hm-btn-big hm-btn-bad', '');
    go.type = 'button';

    if (o.max !== undefined) {
      const row = el('div', 'hm-qty');
      const range = el('input', 'hm-qty-range');
      range.type = 'range';
      range.min = '1';
      range.max = String(max);
      range.step = '1';
      range.value = String(qty);
      const val = el('span', 'hm-qty-val', '');
      const sync = () => {
        setText(val, qty + ' ' + (o.unit || '') + (qty >= max ? ' · all of it' : ''));
        setText(go, (o.verb || 'Confirm') + ' ' + qty);
      };
      range.addEventListener('input', () => {
        qty = clamp(Math.round(Number(range.value)) || 1, 1, max);
        sync();
      });
      row.appendChild(range);
      row.appendChild(val);
      box.appendChild(row);
      sync();
    } else {
      setText(go, o.verb || 'Confirm');
    }

    const btns = el('div', 'hm-btnrow hm-btnrow-modal');
    const no = el('button', 'hm-btn hm-btn-big', 'Cancel');
    no.type = 'button';
    no.addEventListener('click', () => this.closeModal());
    go.addEventListener('click', () => {
      this.closeModal();
      if (typeof o.onConfirm === 'function') o.onConfirm(qty);
    });
    btns.appendChild(no);
    btns.appendChild(go);
    box.appendChild(btns);
    this.elModalShade.style.display = '';
    this.modalOpen = true;
  }

  closeModal() {
    this.elModalShade.style.display = 'none';
    this.modalOpen = false;
  }

  /* ---- small state reads -------------------------------------------------- */

  tierNow() {
    return clamp(askNum(this.game.economy, 'tier', undefined, 1) | 0, 1, 4);
  }

  seasonNow() {
    const c = this.game.world && this.game.world.clock;
    return c ? clamp(numOf(c.season, 0) | 0, 0, 3) : 0;
  }

  dayNow() {
    const c = this.game.world && this.game.world.clock;
    return c ? numOf(c.day, 1) : 1;
  }

  timeNow() {
    const c = this.game.world && this.game.world.clock;
    return c ? numOf(c.timeOfDay, 0) : 0;
  }

  population() {
    const eco = this.game.economy;
    const n = askNum(eco, 'population', undefined, -1);
    if (n >= 0) return n | 0;
    const p = askNum(eco, 'pop', undefined, -1);
    if (p >= 0) return p | 0;
    return villagerList(this.game).length;
  }

  stock(id) {
    return askNum(this.game.economy, 'stock', id, 0);
  }

  /**
   * What placement will actually honour: `stock` minus what pending sites have
   * already claimed. A site reserves its whole cost when it is placed and the
   * hauliers fetch it later, so gross stock is not a number the player can
   * spend — reading it is how "not enough stone" appeared beside a 60.
   */
  available(id) {
    return askNum(this.game.economy, 'available', id, this.stock(id));
  }

  reserved(id) {
    return askNum(this.game.economy, 'reserved', id, 0);
  }

  /* ---- persistence --------------------------------------------------------- */

  serialize() {
    return {
      cat: this.activeCat,
      menuOpen: this.menuOpen,
      alertsOpen: this.alertsOpen,
      msOpen: this.milestoneOpen,
      overlays: Object.assign({}, this.overlays),
    };
  }

  restore(obj) {
    if (!obj) return;
    if (obj.cat && BUILDINGS_BY_CAT[obj.cat]) this.activeCat = obj.cat;
    if (typeof obj.menuOpen === 'boolean') this.menuOpen = obj.menuOpen;
    if (typeof obj.alertsOpen === 'boolean') this.alertsOpen = obj.alertsOpen;
    if (typeof obj.msOpen === 'boolean') this.milestoneOpen = obj.msOpen;
    if (obj.overlays) {
      for (let i = 0; i < OVERLAYS.length; i++) {
        const id = OVERLAYS[i].id;
        if (this.overlays[id] !== !!obj.overlays[id]) this.toggleOverlay(id);
      }
    }
    if (!this.built) return;
    setToggle(this.elBuild, 'hm-collapsed', !this.menuOpen);
    setToggle(this.elAlerts, 'hm-collapsed', !this.alertsOpen);
    setToggle(this.elMilestone, 'hm-collapsed', !this.milestoneOpen);
    this.elMsFold.textContent = this.milestoneOpen ? '\u2013' : '+';
    this.elMenuFold.textContent = this.menuOpen ? 'Hide · M' : 'Build · M';
    this.refreshBuildMenu(true);
  }

  destroy() {
    for (let i = 0; i < this.unsubs.length; i++) this.unsubs[i]();
    this.unsubs.length = 0;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    if (this.topObserver) this.topObserver.disconnect();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.built = false;
  }
}

function perfNow() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

export function createUI(game) {
  return new UI(game);
}

export default createUI;
