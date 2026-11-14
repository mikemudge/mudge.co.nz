// Hearthmere — §10 military: soldiers, equipment, defences, raid scheduling,
// enemy units and auto combat resolution.
//
// The pillar is "peace is preparation": the player issues no orders during a
// raid, so everything here must be *legible* after the fact. Every hit emits
// an event, every enemy has one nameable objective at a time, and a raid is
// resolved over seconds, never in a single tick.
//
// Headless-safe: no DOM, no canvas, no timers. Reads `world`/`paths`/
// `buildings`/`villagers`/`economy` through their documented APIs only.

import * as C from './constants.js';
import * as U from './utils.js';

/* ------------------------------------------------------------------ *
 * Tuning that DESIGN.md leaves open
 * ------------------------------------------------------------------ */

// §10.5 gives soldier damage but never soldier hit points. Hit points are the
// only free parameter left on the defender side, so they carry the whole
// §17 requirement that wave 1 is a knife-edge hold for a prepared town and a
// mauling for an unprepared one. Exported so QA can sweep them.
//
// The two terms pull on opposite ends of the game: `base` is almost all of an
// unarmoured militiaman and so sets the first raid, while `perPower` is most of
// an armoured soldier and so sets how late the town falls. Move them together.
export const SOLDIER_HP = { base: 115, perPower: 4.2, shield: 26 };

// §10.5.3's `power x k`. Set so that soldiers out-damage Guard Tower archers
// per job: the equipment chain is the mid-game project and must beat masonry.
export const SOLDIER_DPS_PER_POWER = 0.22;

// §10.4's strength curve. The 120-enemy spawn cap flattens anything steeper
// into an identical unwinnable wall, so the curve has to stay under it until
// the intended fall around wave 30.
const RAID_GROWTH = 1.17;

// Ranged soldiers "shoot first, one free round" (§10.2): one second of damage
// the first time a given enemy is acquired.
const FREE_ROUND_SECONDS = 1;

const CONTACT = 0.8;                  // §10.5.2 melee contact distance
// villagers.js treats a combat order as arrived at ~1.23 tiles and clears the
// path there, so a striking reach of CONTACT parks a soldier one step outside
// his own weapon whenever the raider is not closing on him personally.
const MELEE_REACH = 1.3;
const SOLDIER_SEEK_RADIUS = 8;        // §10.5.1 objective 1
const OBJECTIVE_RADIUS = 20;          // §10.5.1 objective 3

// How far from a raider to look for a tile on the defenders' side of the wall.
const MUSTER_SEARCH = 6;

const RETARGET_INTERVAL = 0.6;        // game-seconds between objective re-picks
const REPATH_INTERVAL = 1.4;
const MAX_REPATHS_PER_TICK = 8;       // caps worst-case pathfinding per tick
const BUILDING_CACHE_INTERVAL = 0.5;

// An enemy that cannot move and is not hitting anything is a raid that never
// ends. These escalate: repath, then attack whatever is nearest, then rout.
const STUCK_REPATH = 0.7;
const STUCK_BREACH = 1.6;
const STUCK_ROUT = 4.0;
const STILL_EPSILON = 0.0015;

const HIT_EVENT_INTERVAL = 0.32;      // throttles combat:hit so particles cope
const ROUT_DESPAWN_SECONDS = 22;      // a routed enemy is gone by now, wall or no wall
// §10.5.6's flee clock is a cap, not a schedule: three bandits do not besiege a
// town for three minutes. A wave's patience scales with how many men it brought,
// so a small probe breaks off early and anything from wave ~4 on gets the cap.
const PATIENCE_PER_ENEMY = 40;
const RAID_HARD_END = C.RAID_MAX_SECONDS + 30;   // absolute backstop

// §10.4's strength curve is exponential and buys thousands of units past wave
// 25; this caps how many the budget can actually field, for frame rate.
const MAX_ENEMIES = 120;

// K2: a `ram` cannot touch a soldier, so a greedy spend buys a siege train and
// no army. Siege is an escort case, never the wave.
const MAX_SIEGE_SHARE = 0.25;
// K2.3: the least number of separate bodies a wave may arrive as, so that a
// budget is never one expensive unit with a token escort. It grows with the
// root of the budget, not with the budget: enough to break up the mid-game
// waves, never enough to turn a late budget into a swarm the frame rate pays
// for. Exported so QA can sweep it.
export const WAVE_BODIES = { perRootStrength: 0.5, floor: 3 };
const ENEMY_PATH_CAP = 512;           // per-enemy preallocated path buffer
// Complete rather than budgeted: if a way in exists, the breadth-first pass
// must find it, or raiders chop a wall while a gate stands wide open.
const BREACH_BFS_BUDGET = C.GRID_W * C.GRID_H;

// How often a raid re-checks whether the town has any defenders left (§16.6).
const REDRAFT_INTERVAL = 2;

/* ------------------------------------------------------------------ *
 * Module-level lookups (never mutate constants.js data)
 * ------------------------------------------------------------------ */

// townValue counts a building's cost as a plain unit total; using ITEMS.value
// instead would make one steel ingot worth thirty planks and make late towns
// attract raids they cannot possibly have earned.
const DEF_VALUE = Object.create(null);
for (let i = 0; i < C.BUILDINGS.length; i++) {
  const d = C.BUILDINGS[i];
  let v = 0;
  if (d.cost) for (const k in d.cost) v += d.cost[k];
  DEF_VALUE[d.id] = v;
}

const ENEMY_BY_COST_DESC = C.ENEMY_TYPES.slice().sort((a, b) => b.cost - a.cost);

// Weapon and armour are picked independently (§10.2), so each item names its
// own rank. A weapon ranks by the LOWEST tier that lists it (`sword` appears in
// both 2 and 3, and a sword alone is a swordsman's); armour is unambiguous.
const WEAPON_RANK = Object.create(null);
const ARMOUR_RANK = Object.create(null);
for (let t = C.EQUIPMENT_TIERS.length - 1; t >= 0; t--) {
  const tier = C.EQUIPMENT_TIERS[t];
  for (let i = 0; i < tier.weapon.length; i++) WEAPON_RANK[tier.weapon[i]] = t;
  for (let i = 0; i < tier.armour.length; i++) ARMOUR_RANK[tier.armour[i]] = t;
}

/**
 * The tier a weapon/armour pair fights at: the highest tier whose table row
 * accepts both, so every matched kit in §10.2 keeps its listed power. A weapon
 * with no matching armour still fights at its own rank — that is the whole
 * point of picking the halves independently.
 */
function kitTierFor(weapon, armour) {
  if (!weapon) return 0;
  for (let t = C.EQUIPMENT_TIERS.length - 1; t >= 1; t--) {
    const tier = C.EQUIPMENT_TIERS[t];
    if (tier.weapon.indexOf(weapon) >= 0 && armour && tier.armour.indexOf(armour) >= 0) return t;
  }
  return WEAPON_RANK[weapon] || 0;
}

/** The power a weapon fights at alongside this armour, before any cap. */
function weaponPower(weapon, armour) {
  return weapon ? C.EQUIPMENT_TIERS[kitTierFor(weapon, armour)].power : 0;
}

// ADDENDUM R1: a Barracks (or Keep) keeps its own rack of spears, so its
// garrison is armed whether or not an Armoury exists. The issue is free — it
// never enters or leaves the §10.2 conservation ledger — so an issued weapon
// is flagged on the kit and is neither stored back nor recoverable as loot.
const ISSUE_WEAPON = 'spear';
const ISSUE_RANK = WEAPON_RANK[ISSUE_WEAPON] || 0;
// ADDENDUM AC3: the rack is drill kit, not smith's work, so an issued weapon
// fights at a capped power. That is the ONLY way it differs from the crafted
// item — same tier, hit points and reach, same conservation seal — and it is
// what makes an Armoury worth building on the first rung.
const ISSUE_POWER_CAP = 9;

// Hoisted so the combat loop allocates nothing; paths.js treats it as read-only.
const ENEMY_PATH_OPTS = { enemy: true };

const GW = C.GRID_W;
const GH = C.GRID_H;
const NTILES = GW * GH;

/** §14/N3: a scalar the save file got wrong becomes the default, never NaN. */
function num(v, dflt) { return typeof v === 'number' && Number.isFinite(v) ? v : dflt; }

function tileX(idx) { return idx % GW; }
function tileY(idx) { return (idx / GW) | 0; }

/* ------------------------------------------------------------------ *
 * Enemy record — pooled, never allocated inside the combat loop
 * ------------------------------------------------------------------ */

function makeEnemy() {
  return {
    id: 0, typeIdx: 0, def: null,
    x: 0, y: 0, hp: 0, maxHp: 0,
    speed: 0, dmg: 0, range: 1, aura: null, vsBuildingsOnly: false,
    targetKind: 0,          // 0 none, 1 soldier, 2 building
    targetId: -1,
    path: new Int32Array(ENEMY_PATH_CAP), pathLen: 0, pathStep: 0,
    retargetT: 0, repathT: 0,
    stuckT: 0, lastX: -1, lastY: -1,
    hitT: 0,
    engaged: false,
    routing: false, routT: 0,
    breachId: -1, breachTile: -1,
    homeX: 0, homeY: 0,
    dead: false, active: false,
  };
}

/* ------------------------------------------------------------------ */

export class Military {
  constructor(game) {
    // Constructor must not read other modules (§12).
    this.game = game;
    this.bus = game ? game.bus : null;

    this.rng = new U.RNG(0x5e1d1e5);

    this.wave = 0;
    this.nextRaidDay = C.RAID_FIRST_DAY;
    this.warning = null;            // {wave, daysUntil, passes:[names], passIdx:[]}
    this.passList = [];

    this.enemies = [];
    this._pool = [];
    this._nextEnemyId = 1;

    this.raid = this._blankRaid();

    // Soldiers: dense slot arrays, persistent hp keyed by villager id.
    this.sIds = [];
    this.sTower = [];               // 1 = guard-tower archer, stays in the tower
    this.sBuilding = [];
    this.sHp = new Float32Array(320);
    this.sTargetEnemy = new Int32Array(320);
    this.sFreeMark = new Int32Array(320);
    this.sHitT = new Float32Array(320);
    this.sSlot = new Map();
    this.hpById = new Map();
    this.kits = new Map();          // villagerId -> kit
    this.intents = new Map();       // villagerId -> {mode, tx, ty, enemyId}
    this._mourned = new Set();      // soldiers already booked dead this raid
    this.drafted = [];

    this.stats = {
      daysSurvived: 0, peakPopulation: 0, raidsHeld: 0, raidsFaced: 0,
      raidsRavaged: 0, tierReached: 1, enemiesKilled: 0,
      soldiersLost: 0, buildingsLost: 0,
    };
    this.gameOver = false;

    this.debug = {
      badEnemyPaths: 0, breaches: 0, stuckRouts: 0, hardEnds: 0,
      missingDamageApi: 0, missingKillApi: 0, armsLost: 0, armsRecovered: 0, pathFails: 0,
    };

    // scratch — sized once, reused forever
    this._blist = [];
    this._bMap = new Map();
    this._bCacheT = 0;
    this._vMap = new Map();
    this._vCacheT = 0;
    this._dirtyBuildings = true;
    this._region = null;             // K3: tile -> side of the wall perimeter
    this._regionDirty = true;
    this._regionCount = 0;
    this._hasPerimeter = false;
    this._gateTiles = [];
    this._repathBudget = MAX_REPATHS_PER_TICK;
    this._auraIdx = new Int32Array(96);
    this._auraCount = 0;
    this._townValue = 0;
    this._townValueDay = -1;

    this._soldierT = 0;
    this._redraftT = 0;
    this._towerHitT = 0;
    this._bfsPathLen = 0;
    this._breachCount = 0;
    this._breachApproach = -1;
    this._bfsStamp = 0;
    this._bfsGen = null;
    this._bfsPrev = null;
    this._bfsQ = null;
    this._bfsDist = null;
    this._breachIdx = new Int32Array(512);
    this._breachFrom = new Int32Array(512);
    this._breachDist = new Float32Array(512);
    this._pathScratch = new Int32Array(ENEMY_PATH_CAP);

    this._onDay = null;
    this._onBuildingsChanged = null;
    this._onDestroyed = null;
    this._onDied = null;
    this._onLeft = null;
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  init() {
    this._bfsGen = new Int32Array(NTILES);
    this._bfsPrev = new Int32Array(NTILES);
    this._bfsQ = new Int32Array(NTILES);
    this._bfsDist = new Float32Array(NTILES);

    this._region = new Int32Array(NTILES);
    this._collectPasses();
    this._dirtyBuildings = true;
    this._regionDirty = true;

    const bus = this.bus;
    if (!bus) return;
    this._onDay = (p) => this.onDayEnded(p ? p.day : 0);
    this._onBuildingsChanged = () => { this._dirtyBuildings = true; this._regionDirty = true; };
    this._onDestroyed = (p) => this._onBuildingDestroyed(p);
    this._onDied = (p) => this._onVillagerDied(p);
    this._onLeft = (p) => this._onVillagerLeft(p);
    bus.on('day:ended', this._onDay);
    bus.on('building:completed', this._onBuildingsChanged);
    bus.on('building:placed', this._onBuildingsChanged);
    bus.on('building:destroyed', this._onDestroyed);
    bus.on('villager:died', this._onDied);
    bus.on('villager:left', this._onLeft);
  }

  dispose() {
    const bus = this.bus;
    if (!bus) return;
    if (this._onDay) bus.off('day:ended', this._onDay);
    if (this._onBuildingsChanged) {
      bus.off('building:completed', this._onBuildingsChanged);
      bus.off('building:placed', this._onBuildingsChanged);
    }
    if (this._onDestroyed) bus.off('building:destroyed', this._onDestroyed);
    if (this._onDied) bus.off('villager:died', this._onDied);
    if (this._onLeft) bus.off('villager:left', this._onLeft);
  }

  _blankRaid() {
    return {
      active: false, wave: 0, t: 0, startHp: 0, routing: false,
      kills: 0, losses: 0, buildingsLost: 0, wallsLost: 0, spawned: 0,
      popAtStart: 0, draftedTotal: 0,
      passes: [], loot: Object.create(null), fallen: [],
    };
  }

  /* ---------------------------------------------------------------- *
   * Per-tick
   * ---------------------------------------------------------------- */

  update(dt, game) {
    if (game) this.game = game;
    if (!(dt > 0)) dt = 0;

    this._bCacheT -= dt;
    this._vCacheT -= dt;
    if (this._dirtyBuildings || this._bCacheT <= 0) this._refreshBuildings();
    if (this._vCacheT <= 0) this._refreshVillagers();

    const eco = this.game.economy;
    if (eco) {
      const pop = eco.population !== undefined ? eco.population : 0;
      if (pop > this.stats.peakPopulation) this.stats.peakPopulation = pop;
      if (eco.tier > this.stats.tierReached) this.stats.tierReached = eco.tier;
    }

    this._soldierT -= dt;
    if (!this.raid.active) {
      if (this._soldierT <= 0) this._refreshSoldiers();
      return;
    }
    this._raidTick(dt);
  }

  _raidTick(dt) {
    const r = this.raid;
    r.t += dt;
    this._repathBudget = MAX_REPATHS_PER_TICK;

    if (!r.routing) {
      const lost = this._waveHpLostFraction();
      if (lost >= C.RAID_FLEE_HP_FRACTION || r.t >= this._patience()) this._beginRout();
    }

    if (this._soldierT <= 0) this._refreshSoldiers();
    // A Barracks flattened mid-wave takes its garrison with it, and §16.6's
    // promise does not expire when the raid starts. Suspended once the wave is
    // routing: there is nothing left to resist.
    this._redraftT -= dt;
    if (this.sIds.length === 0 && !r.routing && this._redraftT <= 0) {
      this._redraftT = REDRAFT_INTERVAL;
      this._draft();
    }
    this._towerHitT -= dt;
    this._towersTick(dt);
    this._soldiersTick(dt);
    this._enemiesTick(dt);

    if (r.t >= RAID_HARD_END && this._aliveCount() > 0) {
      this.debug.hardEnds++;
      this._despawnAll();
    }
    if (this._aliveCount() === 0) this._endRaid();
  }

  /** How long this wave will press the attack before it breaks off (§10.5.6). */
  _patience() {
    const bodies = Math.max(1, this.raid.spawned);
    return Math.min(C.RAID_MAX_SECONDS, PATIENCE_PER_ENEMY * bodies);
  }

  /* ---------------------------------------------------------------- *
   * §10.4  Schedule
   * ---------------------------------------------------------------- */

  // ADDENDUM E1: `day` is the day that has just BEGUN, never the one that ended.
  onDayEnded(day) {
    this.stats.daysSurvived = day;

    // Soldiers do not swap kit mid-battle.
    if (!this.raid.active) this.equipSoldiers();

    this._townValueDay = -1;

    if (this.raid.active) return;

    const warnDays = C.RAID_WARN_DAYS + (this._hasWatchtower() ? 1 : 0);
    const nextWave = this.wave + 1;

    if (!this.warning && day >= this.nextRaidDay - warnDays) {
      const passIdx = this._pickPasses(nextWave);
      const passes = [];
      const names = [];
      for (let i = 0; i < passIdx.length; i++) {
        passes.push(this.passList[passIdx[i]]);
        names.push(this.passList[passIdx[i]].name);
      }
      this.warning = {
        wave: nextWave,
        daysUntil: Math.max(0, this.nextRaidDay - day),
        passes,
        passIdx,
      };
      this._emit('raid:warned', {
        wave: this.warning.wave, daysUntil: this.warning.daysUntil, passes,
      });
      this._emit('toast', {
        text: `Smoke seen above the ${names.join(' and the ')} — raiders in ${U.fmtDays(this.warning.daysUntil)}.`,
        kind: 'warn',
      });
    } else if (this.warning) {
      this.warning.daysUntil = Math.max(0, this.nextRaidDay - day);
    }

    if (day >= this.nextRaidDay) this.startRaid(nextWave);

    // §10.7 is owned here, so the population === 0 branch is checked daily as
    // well as at the end of a raid — starvation ends a game too.
    this._checkGameOver('');
  }

  /** §10.4 raid strength for a wave, including the townValue term. */
  strengthFor(wave) {
    return 22 * Math.pow(RAID_GROWTH, wave) + this.townValue() * 0.035;
  }

  /** §10.4 townValue: built-building cost (unit totals) + 3 x population. */
  townValue() {
    const world = this.game.world;
    const day = world && world.clock ? world.clock.day : 0;
    if (this._townValueDay === day) return this._townValue;
    this._refreshBuildings();
    let v = 0;
    const list = this._blist;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built) continue;
      const dv = DEF_VALUE[b.defId];
      if (dv) v += dv;
    }
    const eco = this.game.economy;
    v += 3 * (eco && eco.population ? eco.population : 0);
    this._townValue = v;
    this._townValueDay = day;
    return v;
  }

  /** Days until the next raid, or -1 when none is scheduled. */
  daysUntilRaid() {
    const world = this.game.world;
    const day = world && world.clock ? world.clock.day : 0;
    return Math.max(0, this.nextRaidDay - day);
  }

  _scheduleNext() {
    // §10.4: every 12 - min(4, floor(wave/3)) days, so the pace tightens to 8.
    const gap = 12 - Math.min(4, Math.floor(this.wave / 3));
    const world = this.game.world;
    const day = world && world.clock ? world.clock.day : this.nextRaidDay;
    this.nextRaidDay = Math.max(day + 1, this.nextRaidDay + gap);
  }

  /* ---------------------------------------------------------------- *
   * Passes
   * ---------------------------------------------------------------- */

  _collectPasses() {
    const world = this.game.world;
    this.passList.length = 0;
    const raw = world && world.passes;
    if (raw && raw.length) {
      for (let i = 0; i < raw.length; i++) {
        const p = raw[i];
        let x, y;
        if (typeof p === 'number') { x = tileX(p); y = tileY(p); } else { x = p.x; y = p.y; }
        if (x === undefined || y === undefined) continue;
        this.passList.push({
          x, y,
          idx: (p && p.idx !== undefined) ? p.idx : U.toIdx(x, y),
          name: (p && p.name) || (this._passName(x, y) + ' Pass'),
        });
      }
    }
    if (this.passList.length === 0) this._derivePasses();
  }

  // A map handed over without `world.passes` still has to be raidable.
  _derivePasses() {
    const world = this.game.world;
    if (!world || !world.terrain) {
      this.passList.push({ x: 1, y: 1, idx: U.toIdx(1, 1), name: 'North Pass' });
      return;
    }
    const edges = [];
    for (let x = 0; x < GW; x++) {
      if (this._enemyWalkable(U.toIdx(x, 0))) edges.push(U.toIdx(x, 0));
      if (this._enemyWalkable(U.toIdx(x, GH - 1))) edges.push(U.toIdx(x, GH - 1));
    }
    for (let y = 1; y < GH - 1; y++) {
      if (this._enemyWalkable(U.toIdx(0, y))) edges.push(U.toIdx(0, y));
      if (this._enemyWalkable(U.toIdx(GW - 1, y))) edges.push(U.toIdx(GW - 1, y));
    }
    // Thin runs of adjacent edge tiles down to one representative each.
    let last = -99;
    for (let i = 0; i < edges.length; i++) {
      const idx = edges[i];
      if (i > 0 && Math.abs(idx - last) <= 2) continue;
      last = idx;
      const x = tileX(idx), y = tileY(idx);
      this.passList.push({ x, y, idx, name: this._passName(x, y) + ' Pass' });
      if (this.passList.length >= 4) break;
    }
    if (this.passList.length === 0) {
      this.passList.push({ x: 1, y: 1, idx: U.toIdx(1, 1), name: 'North Pass' });
    }
  }

  _passName(x, y) {
    const cx = GW / 2, cy = GH / 2;
    const dx = x - cx, dy = y - cy;
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'West' : 'East';
    return dy < 0 ? 'North' : 'South';
  }

  _pickPasses(wave) {
    const total = this.passList.length;
    const out = [];
    if (total === 0) return out;
    const n = Math.min(total, wave >= 5 ? 2 : 1);
    let k = this.rng.int(total);
    while (out.length < n) {
      if (out.indexOf(k) < 0) out.push(k);
      k = (k + 1) % total;
    }
    return out;
  }

  /* ---------------------------------------------------------------- *
   * §10.4  Wave composition
   * ---------------------------------------------------------------- */

  /**
   * Spend the strength budget on a force that can fight (K2): siege engines
   * take a quarter of it at most, everything left buys units that can trade
   * blows with a soldier, and the wave arrives as a credible number of bodies.
   * `out` is filled with type indices; returns the count spawned.
   */
  composeWave(wave, strength, out) {
    out.length = 0;
    const total = strength > 0 ? strength : 0;
    const cheapest = this._cheapestCost(wave);
    const minBodies = U.clamp(
      Math.ceil(WAVE_BODIES.perRootStrength * Math.sqrt(total)),
      WAVE_BODIES.floor, MAX_ENEMIES,
    );

    let budget = this._buy(wave, total, total * MAX_SIEGE_SHARE, true, minBodies, cheapest, out);
    this._buy(wave, budget, budget, false, minBodies, cheapest, out);

    // A raid that buys nothing is not a raid; the cheapest unit always shows up.
    if (out.length === 0) out.push(C.ENEMY_TYPES.indexOf(C.ENEMY_BY_ID.bandit));
    return out.length;
  }

  /**
   * Greedy buy of one class of unit — `siege` selects `vsBuildingsOnly` types —
   * spending at most `pot` of `budget`, and never so much that the wave can no
   * longer field `minBodies`. Returns the budget left.
   */
  _buy(wave, budget, pot, siege, minBodies, cheapest, out) {
    let guard = 0;
    while (budget > 0 && pot > 0 && out.length < MAX_ENEMIES && guard++ < 4000) {
      const reserve = Math.max(0, minBodies - out.length - 1) * cheapest;
      let pick = null;
      let fallback = null;
      for (let i = 0; i < ENEMY_BY_COST_DESC.length; i++) {
        const def = ENEMY_BY_COST_DESC[i];
        if (def.unlockWave > wave) continue;
        if (!!def.vsBuildingsOnly !== siege) continue;
        if (def.cost > pot || def.cost > budget) continue;
        fallback = def;                         // cheapest affordable, last wins
        if (def.cost <= budget - reserve && !pick) pick = def;
      }
      // The body count is a target, not a gate: when nothing fits under the
      // reserve, the cheapest unit still comes, which is what the reserve wanted.
      const def = pick || fallback;
      if (!def) break;
      budget -= def.cost;
      pot -= def.cost;
      out.push(C.ENEMY_TYPES.indexOf(def));
    }
    return budget;
  }

  _cheapestCost(wave) {
    let c = 0;
    for (let i = 0; i < C.ENEMY_TYPES.length; i++) {
      const def = C.ENEMY_TYPES[i];
      if (def.unlockWave > wave || def.vsBuildingsOnly) continue;
      if (c === 0 || def.cost < c) c = def.cost;
    }
    return c > 0 ? c : 1;
  }

  /* ---------------------------------------------------------------- *
   * §10.6 / raid start
   * ---------------------------------------------------------------- */

  startRaid(waveNum) {
    if (this.raid.active) return;
    const wave = waveNum || this.wave + 1;
    this.wave = wave;
    this._mourned.clear();

    this._refreshBuildings();
    this._refreshVillagers();

    const passIdx = (this.warning && this.warning.passIdx && this.warning.passIdx.length)
      ? this.warning.passIdx : this._pickPasses(wave);

    const r = this.raid;
    r.active = true;
    r.wave = wave;
    r.t = 0;
    r.routing = false;
    r.kills = 0;
    r.losses = 0;
    r.buildingsLost = 0;
    r.wallsLost = 0;
    r.popAtStart = this._population();
    r.draftedTotal = 0;
    r.loot = Object.create(null);
    r.fallen.length = 0;
    r.passes.length = 0;
    for (let i = 0; i < passIdx.length; i++) r.passes.push(this.passList[passIdx[i]].name);

    // §10.6 anti-soft-lock: a town with no garrison always fights back, badly.
    this._refreshSoldiers();
    if (this.sIds.length === 0) this._draft();

    // Every raid starts with a healthy garrison; wounds do not carry between
    // raids, which would otherwise compound into an unrecoverable spiral.
    for (let i = 0; i < this.sIds.length; i++) {
      const id = this.sIds[i];
      const v = this._villager(id);
      // hpById holds the living only — see _refreshSoldiers.
      if (v && !v.dead) {
        this.sHp[i] = this.kitOf(id).maxHp;
        this.hpById.set(id, this.sHp[i]);
      } else {
        this.sHp[i] = 0;
        this.hpById.delete(id);
      }
    }

    const comp = [];
    this.composeWave(wave, this.strengthFor(wave), comp);

    let startHp = 0;
    for (let i = 0; i < comp.length; i++) {
      const pass = this.passList[passIdx[i % Math.max(1, passIdx.length)]] || this.passList[0];
      const e = this._spawnEnemy(comp[i], pass, i);
      if (e) startHp += e.maxHp;
    }
    r.startHp = startHp;
    r.spawned = this.enemies.length;

    this.stats.raidsFaced++;
    this.warning = null;
    this._emit('raid:started', { wave, count: r.spawned });
    this._emit('toast', {
      text: `Wave ${wave}: ${r.spawned} raiders coming through the ${r.passes.join(' and the ')}.`,
      kind: 'bad',
    });
  }

  _spawnEnemy(typeIdx, pass, ordinal) {
    const def = C.ENEMY_TYPES[typeIdx];
    if (!def || !pass) return null;
    const idx = this._spawnTileNear(pass.idx, ordinal);
    if (idx < 0) return null;

    const e = this._pool.length > 0 ? this._pool.pop() : makeEnemy();
    e.id = this._nextEnemyId++;
    e.typeIdx = typeIdx;
    e.def = def;
    e.x = tileX(idx) + 0.5;
    e.y = tileY(idx) + 0.5;
    e.hp = def.hp;
    e.maxHp = def.hp;
    e.speed = def.speed;
    e.dmg = def.dmg;
    e.range = def.range <= 1 ? CONTACT : def.range;
    e.aura = def.aura;
    e.vsBuildingsOnly = !!def.vsBuildingsOnly;
    e.targetKind = 0;
    e.targetId = -1;
    e.pathLen = 0;
    e.pathStep = 0;
    e.retargetT = this.rng.range(0, RETARGET_INTERVAL);
    e.repathT = 0;
    e.stuckT = 0;
    e.lastX = e.x;
    e.lastY = e.y;
    e.hitT = 0;
    e.engaged = false;
    e.routing = false;
    e.routT = 0;
    e.breachId = -1;
    e.breachTile = -1;
    e.homeX = pass.x + 0.5;
    e.homeY = pass.y + 0.5;
    e.dead = false;
    e.active = true;
    this.enemies.push(e);
    return e;
  }

  // Spiral out from the pass until an enemy-walkable tile is free.
  _spawnTileNear(passIdx, ordinal) {
    if (this._enemyWalkable(passIdx) && ordinal === 0) return passIdx;
    const px = tileX(passIdx), py = tileY(passIdx);
    for (let ring = 0; ring <= 8; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const x = px + dx, y = py + dy;
          if (!U.inBounds(x, y)) continue;
          const idx = U.toIdx(x, y);
          if (this._enemyWalkable(idx)) {
            if (ordinal-- <= 0) return idx;
          }
        }
      }
    }
    return this._enemyWalkable(passIdx) ? passIdx : -1;
  }

  /* ---------------------------------------------------------------- *
   * §10.5  Enemy behaviour
   * ---------------------------------------------------------------- */

  _enemiesTick(dt) {
    const es = this.enemies;

    // Warlord auras (§10.4): few of them, so an index list beats an O(n^2) scan.
    let nw = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.active || e.dead || e.routing) continue;
      if (e.aura && nw < this._auraIdx.length) this._auraIdx[nw++] = i;
    }
    this._auraCount = nw;

    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      if (!e.active) { this._retire(i); continue; }
      if (e.dead) { this._retire(i); continue; }

      if (e.routing) { this._routTick(e, dt, i); continue; }

      e.engaged = false;
      e.retargetT -= dt;
      e.repathT -= dt;
      e.hitT -= dt;

      if (e.retargetT <= 0 || !this._targetValid(e)) {
        e.retargetT = RETARGET_INTERVAL;
        this._pickObjective(e);
      }

      const reached = this._attackIfInRange(e, dt, i);
      if (!reached) this._advance(e, dt);

      // Stuck watchdog. Hitting something is not stuck; standing in a field is.
      const moved = Math.abs(e.x - e.lastX) + Math.abs(e.y - e.lastY);
      if (!e.engaged && moved < STILL_EPSILON) {
        e.stuckT += dt;
        if (e.stuckT > STUCK_ROUT) {
          this.debug.stuckRouts++;
          this._rout(e);
        } else if (e.stuckT > STUCK_BREACH) {
          this._forceBreach(e);
        } else if (e.stuckT > STUCK_REPATH) {
          e.repathT = 0;
          e.retargetT = 0;
        }
      } else {
        e.stuckT = 0;
      }
      e.lastX = e.x;
      e.lastY = e.y;
    }
  }

  _auraMultFor(e, selfIdx) {
    const n = this._auraCount;
    if (n === 0) return 1;
    const es = this.enemies;
    let best = 1;
    for (let k = 0; k < n; k++) {
      const j = this._auraIdx[k];
      if (j === selfIdx) continue;
      const w = es[j];
      if (!w || !w.aura) continue;
      const dx = w.x - e.x, dy = w.y - e.y;
      if (dx * dx + dy * dy <= w.aura.radius * w.aura.radius) {
        const m = 1 + w.aura.bonus;
        if (m > best) best = m;
      }
    }
    return best;
  }

  _targetValid(e) {
    if (e.targetKind === 1) {
      const slot = this._soldierSlot(e.targetId);
      if (slot < 0 || this.sHp[slot] <= 0 || this.sTower[slot] === 1) return false;
      const v = this._villager(e.targetId);
      return !!v && !this._separated(e.x, e.y, v.vx, v.vy);
    }
    if (e.targetKind === 2) {
      const b = this._building(e.targetId);
      return !!b && b.hp > 0;
    }
    return false;
  }

  /**
   * §10.5.1 objective order: nearest soldier within 8 -> the wall/gate that
   * blocks the way -> highest-value building within 20 -> the town centre.
   */
  _pickObjective(e) {
    // A committed breach is sticky. Re-deciding which wall to chop every
    // retarget makes a raider oscillate between two equally-good candidates
    // and never land a blow — the classic "raid that never ends".
    if (e.breachId >= 0) {
      const wb = this._building(e.breachId);
      if (wb && wb.hp > 0) {
        e.targetKind = 2;
        e.targetId = e.breachId;
        if (this._distToBuilding(e.x, e.y, wb) <= e.range + 0.35) { e.pathLen = 0; return; }
        if (e.pathStep < e.pathLen) return;
        const from = U.toIdx(Math.floor(e.x), Math.floor(e.y));
        if (e.breachTile >= 0 && this._bfs(from, e.breachTile)) {
          this._adoptPath(e, this._pathScratch, this._bfsPathLen);
          return;
        }
      }
      e.breachId = -1;
      e.breachTile = -1;
    }

    if (!e.vsBuildingsOnly) {
      const sid = this._nearestFieldSoldier(e.x, e.y, SOLDIER_SEEK_RADIUS, this._regionAt(e.x, e.y));
      if (sid >= 0) {
        const v = this._villager(sid);
        if (v) {
          e.targetKind = 1;
          e.targetId = sid;
          this._pathTo(e, this._approachTile(U.toIdx(Math.floor(v.vx), Math.floor(v.vy))));
          return;
        }
      }
    }

    const b = this._pickBuildingObjective(e);
    if (!b) {
      // Nothing left standing worth attacking: the raid is over for this unit.
      this._rout(e);
      return;
    }
    e.targetKind = 2;
    e.targetId = b.id;
    this._pathTo(e, this._doorTile(b));
  }

  _pickBuildingObjective(e) {
    const list = this._blist;
    let best = null, bestScore = -1;
    const r2 = OBJECTIVE_RADIUS * OBJECTIVE_RADIUS;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.hp <= 0) continue;
      const def = C.BUILDING_BY_ID[b.defId];
      if (!def) continue;
      // Walls are a means, not an end: they only become a target when they
      // actually block the path (handled in _pathTo).
      if (def.wall || def.gate) continue;
      // §10.5.1 lists the town centre AFTER the value scan, not inside it. It
      // is also the only building whose loss ends the run (§10.7), so a raider
      // that opens on it turns every raid into the loss condition.
      if (def.id === 'town_centre') continue;
      const cx = b.x + (b.w || 1) / 2, cy = b.y + (b.h || 1) / 2;
      const dx = cx - e.x, dy = cy - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const score = (DEF_VALUE[b.defId] || 1) / (1 + Math.sqrt(d2) * 0.15);
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best) return best;

    const tc = this._townCentre();
    if (tc && tc.hp > 0) return tc;

    // No town centre left: go for whatever still stands, walls included.
    let near = null, nd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.hp <= 0) continue;
      const cx = b.x + (b.w || 1) / 2, cy = b.y + (b.h || 1) / 2;
      const d = (cx - e.x) * (cx - e.x) + (cy - e.y) * (cy - e.y);
      if (d < nd) { nd = d; near = b; }
    }
    return near;
  }

  /**
   * Path an enemy to `toIdx`. Enemy pathing is NOT villager pathing: gates are
   * walkable for villagers and closed to raiders. If the objective cannot be
   * reached the enemy retargets onto the wall or gate in the way (§10.5.1).
   */
  _pathTo(e, toIdx) {
    if (toIdx < 0) { e.pathLen = 0; return; }
    if (this._repathBudget <= 0 && e.pathLen > e.pathStep) return;
    this._repathBudget--;
    e.repathT = REPATH_INTERVAL;

    const fromIdx = U.toIdx(Math.floor(e.x), Math.floor(e.y));
    if (fromIdx === toIdx) { e.pathLen = 0; return; }

    const paths = this.game.paths;
    if (paths && typeof paths.find === 'function') {
      let res = null;
      try {
        res = paths.find(fromIdx, toIdx, ENEMY_PATH_OPTS);
      } catch {
        // A broken path provider must not take the raid down with it.
      }
      if (res && res.tiles && res.tiles.length > 0) {
        if (this._pathIsEnemyLegal(res.tiles)) {
          this._adoptPath(e, res.tiles, res.tiles.length);
          return;
        }
        // paths.js handed back a route through a gate or a wall. Refusing it
        // here is what keeps the whole wall system from being decorative.
        this.debug.badEnemyPaths++;
      }
    }

    // Own BFS: finds the route, or the wall/gate to break when there is none.
    const found = this._bfs(fromIdx, toIdx);
    if (found) {
      this._adoptPath(e, this._pathScratch, this._bfsPathLen);
      return;
    }
    this.debug.pathFails++;
    const breach = this._chooseBreach(toIdx);
    if (breach >= 0) {
      const wb = this._buildingAt(breach);
      if (wb) {
        this.debug.breaches++;
        e.targetKind = 2;
        e.targetId = wb.id;
        e.breachId = wb.id;
        e.breachTile = this._breachApproach;
        if (this._bfs(fromIdx, e.breachTile)) {
          this._adoptPath(e, this._pathScratch, this._bfsPathLen);
        } else {
          e.pathLen = 0;
        }
        return;
      }
    }
    e.pathLen = 0;
  }

  _adoptPath(e, tiles, len) {
    const n = Math.min(len, ENEMY_PATH_CAP);
    for (let i = 0; i < n; i++) e.path[i] = tiles[i];
    e.pathLen = n;
    e.pathStep = 0;
    // A path that starts on the tile we are already standing on wastes a step.
    if (n > 0) {
      const cur = U.toIdx(Math.floor(e.x), Math.floor(e.y));
      if (e.path[0] === cur) e.pathStep = 1;
    }
  }

  // tiles[0] is where the unit already stands, which under ADDENDUM E2's lax
  // corner rule can momentarily read as a building's corner tile; only the
  // steps it is about to take have to be legal.
  _pathIsEnemyLegal(tiles) {
    for (let i = 1; i < tiles.length; i++) {
      if (!this._enemyWalkable(tiles[i])) return false;
    }
    return true;
  }

  _advance(e, dt) {
    if (e.pathStep >= e.pathLen) {
      if (e.repathT <= 0) {
        e.retargetT = 0;
      }
      return;
    }
    let budget = e.speed * dt;
    let guard = 0;
    while (budget > 0 && e.pathStep < e.pathLen && guard++ < 64) {
      const t = e.path[e.pathStep];
      const tx = (t % GW) + 0.5;
      const ty = ((t / GW) | 0) + 0.5;
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1e-6) { e.pathStep++; continue; }
      if (d <= budget) {
        e.x = tx; e.y = ty; budget -= d; e.pathStep++;
      } else {
        e.x += (dx / d) * budget;
        e.y += (dy / d) * budget;
        budget = 0;
      }
    }
    if (e.pathStep >= e.pathLen) e.retargetT = Math.min(e.retargetT, 0.15);
  }

  _attackIfInRange(e, dt, selfIdx) {
    if (e.targetKind === 0) return false;

    if (e.targetKind === 1) {
      if (e.vsBuildingsOnly) return false;
      const slot = this._soldierSlot(e.targetId);
      if (slot < 0) return false;
      const v = this._villager(e.targetId);
      if (!v) return false;
      const dx = v.vx - e.x, dy = v.vy - e.y;
      if (dx * dx + dy * dy > e.range * e.range) return false;
      if (this._separated(e.x, e.y, v.vx, v.vy)) return false;
      const mult = this._auraMultFor(e, selfIdx);
      this._hurtSoldier(slot, e.dmg * dt * mult);
      e.engaged = true;
      this._hitEvent(e, v.vx, v.vy, e.range > CONTACT ? 'arrow' : 'melee');
      return true;
    }

    const b = this._building(e.targetId);
    if (!b || b.hp <= 0) return false;
    const d = this._distToBuilding(e.x, e.y, b);
    if (d > e.range + 0.35) return false;
    const mult = this._auraMultFor(e, selfIdx);
    this._damageBuilding(b, e.dmg * dt * mult, e);
    e.engaged = true;
    this._hitEvent(e, b.x + (b.w || 1) / 2, b.y + (b.h || 1) / 2, 'building');
    return true;
  }

  _hitEvent(e, x, y, kind) {
    if (e.hitT > 0) return;
    e.hitT = HIT_EVENT_INTERVAL;
    this._emit('combat:hit', { x, y, kind });
    if (kind === 'arrow') this._arrow(e.x, e.y, x, y);
  }

  // No §11 event exists for a shot, so particles.js is called directly.
  _arrow(fx, fy, tx, ty) {
    const p = this.game.particles;
    if (p && typeof p.arrow === 'function') p.arrow(fx, fy, tx, ty);
  }

  /* ---------------------------------------------------------------- *
   * Routing / despawn
   * ---------------------------------------------------------------- */

  _beginRout() {
    const r = this.raid;
    r.routing = true;
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      if (es[i].active && !es[i].dead) this._rout(es[i]);
    }
    this._emit('toast', { text: 'The raiders break and run for the pass.', kind: 'good' });
  }

  _rout(e) {
    if (e.routing) return;
    e.routing = true;
    e.routT = 0;
    e.engaged = false;
    e.pathLen = 0;
    e.targetKind = 0;
    e.targetId = -1;
  }

  // Routed men scatter cross-country: they ignore walls on the way out, which
  // is the only way to guarantee a raid ends when its pass has been walled over.
  _routTick(e, dt, i) {
    e.routT += dt;
    const dx = e.homeX - e.x, dy = e.homeY - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1.0 || e.routT > ROUT_DESPAWN_SECONDS) {
      e.active = false;
      this._retire(i);
      return;
    }
    const step = Math.min(d, e.speed * 1.25 * dt);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
  }

  _despawnAll() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      this.enemies[i].active = false;
      this._retire(i);
    }
  }

  _retire(i) {
    const e = this.enemies[i];
    U.removeSwap(this.enemies, i);
    e.active = false;
    e.dead = false;
    e.targetKind = 0;
    e.targetId = -1;
    e.pathLen = 0;
    if (this._pool.length < MAX_ENEMIES + 16) this._pool.push(e);
  }

  _aliveCount() {
    return this.enemies.length;
  }

  _waveHpLostFraction() {
    const r = this.raid;
    if (r.startHp <= 0) return 1;
    let alive = 0;
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.active && !e.dead && !e.routing) alive += e.hp;
    }
    return 1 - alive / r.startHp;
  }

  _killEnemy(e, i) {
    e.dead = true;
    e.active = false;
    this.raid.kills++;
    this.stats.enemiesKilled++;
    this._emit('enemy:killed', { x: e.x, y: e.y });
    if (i >= 0) this._retire(i);
  }

  _hurtEnemy(e, amount) {
    if (e.dead || !e.active) return;
    e.hp -= amount;
    if (e.hp <= 0) {
      const i = this.enemies.indexOf(e);
      this._killEnemy(e, i);
    }
  }

  /* ---------------------------------------------------------------- *
   * §10.5.3  Soldiers
   * ---------------------------------------------------------------- */

  _soldiersTick(dt) {
    const ids = this.sIds;
    const morale = this.moraleMult();
    for (let i = 0; i < ids.length; i++) {
      if (this.sHp[i] <= 0) continue;
      if (this.sTower[i] === 1) continue;   // tower archers shoot from the tower
      const id = ids[i];
      const v = this._villager(id);
      if (!v || v.dead) { this.sHp[i] = 0; continue; }

      this.sHitT[i] -= dt;

      // K3: a soldier with a wall between him and the raiders holds it —
      // he fights what is already inside and musters at the gate otherwise.
      const hold = this._holdsTheLine(id);
      const region = hold ? this._regionAt(v.vx, v.vy) : -1;
      const ei = (hold && region >= 0)
        ? this._nearestEnemyIndex(v.vx, v.vy, C.SOLDIER_RESPONSE, region)
        : this._nearestEnemyIndex(v.vx, v.vy, C.SOLDIER_RESPONSE);
      if (ei < 0) {
        this.sTargetEnemy[i] = -1;
        const near = hold ? this._nearestEnemyIndex(v.vx, v.vy, C.SOLDIER_RESPONSE) : -1;
        const manned = near >= 0 && this._muster(id, v, region, this.enemies[near]);
        if (!manned && this.intents.has(id)) this.intents.delete(id);
        continue;
      }
      const e = this.enemies[ei];
      this.sTargetEnemy[i] = e.id;
      this._setIntent(id, e);

      const kit = this.kitOf(id);
      const dx = e.x - v.vx, dy = e.y - v.vy;
      const dist2 = dx * dx + dy * dy;
      const reach = kit.range > 1 ? kit.range : MELEE_REACH;
      if (dist2 > reach * reach) continue;
      // K3: a reach longer than a tile would otherwise let a soldier strike
      // over his own palisade. Raiders already obey this; so must he.
      if (this._separated(v.vx, v.vy, e.x, e.y)) continue;

      const health = v.health === undefined ? 70 : v.health;
      const dps = kit.power * SOLDIER_DPS_PER_POWER * (0.6 + 0.4 * (health / 100)) * morale;
      let dmg = dps * dt;

      // §10.2 crossbows shoot first: one free round on acquiring a new mark.
      if (kit.range > 1 && e.id !== this._freeRoundMark(i)) {
        this._setFreeRoundMark(i, e.id);
        dmg += dps * FREE_ROUND_SECONDS;
      }

      this._hurtEnemy(e, dmg);
      if (this.sHitT[i] <= 0) {
        this.sHitT[i] = HIT_EVENT_INTERVAL;
        const ranged = kit.range > 1;
        this._emit('combat:hit', { x: e.x, y: e.y, kind: ranged ? 'arrow' : 'melee' });
        if (ranged) this._arrow(v.vx, v.vy, e.x, e.y);
      }
    }
  }

  _freeRoundMark(i) { return this.sFreeMark[i] || -1; }
  _setFreeRoundMark(i, id) { this.sFreeMark[i] = id; }

  /**
   * K3: a soldier with a fortification between him and the enemy holds it.
   * §10.6 militia are civilians with pitchforks and have no doctrine.
   */
  _holdsTheLine(id) {
    if (!this._perimeterExists()) return false;
    return this.drafted.length === 0 || this.drafted.indexOf(id) < 0;
  }

  /**
   * Man the stretch of wall the raiders are actually at — for a raider at a
   * gate, that is the inside of the gate. Raiders still out in the open are
   * nobody's business yet: the garrison stays at its post rather than
   * marching off to some far-side gate and leaving its own quarter open.
   * Returns false when there is nothing to man.
   */
  _muster(id, v, region, e) {
    const tile = this._insideFaceNear(e, region);
    if (tile < 0) return false;
    const tx = tileX(tile) + 0.5;
    const ty = tileY(tile) + 0.5;
    let it = this.intents.get(id);
    if (!it) { it = { mode: 'hold', tx: 0, ty: 0, enemyId: -1 }; this.intents.set(id, it); }
    it.mode = 'hold';
    it.tx = tx;
    it.ty = ty;
    it.enemyId = -1;
    const vs = this.game.villagers;
    if (vs && typeof vs.orderCombat === 'function') vs.orderCombat(id, tx, ty, -1);
    return true;
  }

  _setIntent(id, e) {
    let it = this.intents.get(id);
    if (!it) { it = { mode: 'intercept', tx: 0, ty: 0, enemyId: 0 }; this.intents.set(id, it); }
    it.mode = 'intercept';
    it.tx = e.x;
    it.ty = e.y;
    it.enemyId = e.id;
    const vs = this.game.villagers;
    if (vs && typeof vs.orderCombat === 'function') vs.orderCombat(id, e.x, e.y, e.id);
  }

  /** Read by villagers.js: where this soldier is trying to be, or null. */
  intentFor(villagerId) {
    const it = this.intents.get(villagerId);
    return it || null;
  }

  _hurtSoldier(slot, amount) {
    this.sHp[slot] -= amount;
    const id = this.sIds[slot];
    this.hpById.set(id, this.sHp[slot]);
    if (this.sHp[slot] > 0) return;
    this.sHp[slot] = 0;

    this._mournSoldier(id);

    // ADDENDUM G6: `villager:died` belongs to villagers.kill(). Emitting it
    // here as well would double §9.6's raid grief and crater happiness for no
    // reason the player can see.
    const vs = this.game.villagers;
    if (vs && typeof vs.kill === 'function') vs.kill(id, 'raid');
    else this.debug.missingKillApi++;
  }

  /**
   * Book a soldier as dead. Runs for a man cut down in the field and for a
   * garrison that went down with its building — ADDENDUM I2 gives that second
   * kill to `buildings.js`, but the roster, the loss count and the kit are
   * still military's, and an unbooked death leaks the kit out of §10.2's
   * conservation. Idempotent: whoever gets here first wins.
   */
  _mournSoldier(id) {
    if (this._mourned.has(id)) return;
    this._mourned.add(id);

    // §10.2: kit is lost with the man, with a chance of recovery if we win.
    const kit = this.kits.get(id);
    if (kit) {
      // An issued spear was never stock, so it cannot be looted back into one.
      if (kit.weapon && !kit.issued) this.raid.fallen.push(kit.weapon);
      if (kit.armour) this.raid.fallen.push(kit.armour);
      if (kit.shield) this.raid.fallen.push(kit.shield);
      this.kits.delete(id);
    }
    this.hpById.delete(id);
    const slot = this._soldierSlot(id);
    if (slot >= 0) this.sHp[slot] = 0;
    if (this.raid.active) {
      this.raid.losses++;
      this.stats.soldiersLost++;
    }

    this.intents.delete(id);
    const di = this.drafted.indexOf(id);
    if (di >= 0) U.removeSwap(this.drafted, di);
  }

  _onVillagerDied(p) {
    const id = p ? p.id : undefined;
    if (id === undefined || id === null) return;
    if (this._soldierSlot(id) < 0 && !this.kits.has(id)) return;
    this._mournSoldier(id);
  }

  /**
   * An emigrant is not a casualty: no loss is booked and his kit never reaches
   * `raid.fallen`, so the 50% recovery roll cannot mint it back. He walks out
   * wearing it, and every row keyed on him goes with him — `kits` and `hpById`
   * hold men the save can still resolve, and villagers.js has stopped carrying
   * this one.
   */
  _onVillagerLeft(p) {
    const id = p ? p.id : undefined;
    if (id === undefined || id === null) return;
    this.kits.delete(id);
    this.hpById.delete(id);
    this.intents.delete(id);
    const di = this.drafted.indexOf(id);
    if (di >= 0) U.removeSwap(this.drafted, di);
    // Stale, not rebuilt here: re-rostering mid-raid would renumber the slots
    // that carry every soldier's hit timer and §10.2 free-round mark. His slot
    // is inert until then, because _villager() no longer resolves him.
    if (this._soldierSlot(id) >= 0) this._soldierT = 0;
  }

  /* ---------------------------------------------------------------- *
   * §10.3  Guard towers
   * ---------------------------------------------------------------- */

  _towersTick(dt) {
    const list = this._blist;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.hp <= 0 || b.active === false) continue;
      const def = C.BUILDING_BY_ID[b.defId];
      if (!def || !def.attack) continue;
      const garrison = b.workers ? b.workers.length : 0;
      if (garrison === 0) continue;    // §10.3: needs a garrison to shoot

      const cx = b.x + (b.w || 1) / 2, cy = b.y + (b.h || 1) / 2;
      const ei = this._nearestEnemyIndex(cx, cy, def.attack.range);
      if (ei < 0) continue;
      const e = this.enemies[ei];
      this._hurtEnemy(e, def.attack.dps * garrison * dt);
      if (this._towerHitT <= 0) {
        this._towerHitT = HIT_EVENT_INTERVAL;
        this._emit('combat:hit', { x: e.x, y: e.y, kind: 'arrow' });
        this._arrow(cx, cy, e.x, e.y);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * §10.5.5  Buildings under attack
   * ---------------------------------------------------------------- */

  _damageBuilding(b, amount, e) {
    const bs = this.game.buildings;
    if (!bs || typeof bs.damage !== 'function') {
      this.debug.missingDamageApi++;
      this._emit('building:damaged', {
        id: b.id, amount, x: b.x + (b.w || 1) / 2, y: b.y + (b.h || 1) / 2,
      });
      return;
    }
    // §10.5.5's 50% belongs to buildings.damage(), which drops half the wreck
    // to the raiders and salvages the rest. Taking a cut here as well would
    // cost the town 75%, so the report reads the loss instead of causing it.
    const held = b.hp - amount <= 0 ? this._preLootStock(b) : null;
    bs.damage(b.id, amount, true);
    if (held) this._recordLoot(held, e);
  }

  /**
   * Each item a doomed building holds, with the town-wide stock of it before
   * the wreck is settled. Returns null when there is nothing to carry off.
   */
  _preLootStock(b) {
    const bs = this.game.buildings;
    if (!b.inv || typeof bs.stockOf !== 'function') return null;
    let out = null;
    for (const item in b.inv) {
      if (!(b.inv[item] > 0)) continue;
      if (!out) out = [];
      out.push(item, b.inv[item], bs.stockOf(item));
    }
    return out;
  }

  // What the raiders actually carried off: stock that left the town while
  // buildings.damage() settled the wreck. Salvage lands back in a store and so
  // never counts. Capped by what the building held, which is all they can take.
  _recordLoot(held, e) {
    const bs = this.game.buildings;
    const loot = this.raid.loot;
    let any = false;
    for (let i = 0; i < held.length; i += 3) {
      const item = held[i];
      const gone = Math.min(held[i + 1], held[i + 2] - bs.stockOf(item));
      if (gone <= 0) continue;
      loot[item] = (loot[item] || 0) + gone;
      any = true;
    }
    if (any && e) this._emit('combat:hit', { x: e.x, y: e.y, kind: 'loot' });
  }

  _onBuildingDestroyed(p) {
    this._dirtyBuildings = true;
    this._regionDirty = true;
    if (!p) return;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.breachId === p.id) { e.breachId = -1; e.breachTile = -1; e.retargetT = 0; }
      if (e.targetKind === 2 && e.targetId === p.id) { e.targetKind = 0; e.targetId = -1; e.retargetT = 0; }
    }
    if (this.raid.active) {
      const def = C.BUILDING_BY_ID[p.defId];
      this.raid.buildingsLost++;
      this.stats.buildingsLost++;
      // A breached palisade is a wall doing its job, not a ravaged town, so
      // wall losses are reported but do not decide 'held' vs 'ravaged'.
      if (def && (def.wall || def.gate)) {
        this.raid.wallsLost++;
      } else {
        this._emit('toast', {
          text: `${def ? def.name : 'A building'} was destroyed by the raid.`,
          kind: 'bad',
        });
      }
    }
    if (p.defId === 'town_centre') this._checkGameOver('town centre destroyed');
  }

  /* ---------------------------------------------------------------- *
   * Raid end
   * ---------------------------------------------------------------- */

  /**
   * Roofs left standing. Walls and gates are a barrier, not a town, so a raid
   * that leaves none of these razed the place however few it had to burn — a
   * town with two buildings can never reach K4's threshold of three (N6).
   */
  _nonWallStanding() {
    const bs = this.game.buildings;
    const list = bs && bs.list;
    if (!list) return 1;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b || b.removed || b.hp <= 0) continue;
      const def = C.BUILDING_BY_ID[b.defId];
      if (def && (def.wall || def.gate)) continue;
      n++;
    }
    return n;
  }

  _endRaid() {
    const r = this.raid;
    if (!r.active) return;
    r.active = false;
    this._mourned.clear();

    // K4: 'ravaged' has to mean the town was ravaged. A garrison that takes
    // casualties without losing a single roof held, and palisades that died
    // stopping a ram are walls doing their job, not buildings lost. The share
    // is of the population that stood at the start: measured after the fallen
    // are reaped the threshold shrinks exactly when the losses are heaviest.
    const realLosses = r.buildingsLost - r.wallsLost;
    const result = (realLosses >= 3
      || this._nonWallStanding() === 0
      || r.losses >= Math.max(5, r.popAtStart * 0.15))
      ? 'ravaged' : 'held';
    if (result === 'held') {
      this.stats.raidsHeld++;
      this._recoverKit();
    } else {
      this.stats.raidsRavaged++;
      this.debug.armsLost += r.fallen.length;
      r.fallen.length = 0;
    }

    this._releaseDraft();
    this.intents.clear();
    for (let i = 0; i < this.sIds.length; i++) this.sTargetEnemy[i] = -1;
    // Wounds do not carry between raids, so the per-raid hp table starts empty
    // rather than accumulating an entry for every villager who ever fought.
    this.hpById.clear();

    this._scheduleNext();

    this._emit('raid:ended', {
      wave: r.wave,
      result,
      losses: r.losses,
      buildingsLost: r.buildingsLost,
      wallsLost: r.wallsLost,
    });
    // ui.js renders the wall-aware after-action report from `raid:ended`; this
    // toast carries only the kill count, which no other module can know.
    this._emit('toast', {
      text: `${r.kills} raiders killed.`,
      kind: result === 'held' ? 'good' : 'bad',
    });

    this._checkGameOver('');
  }

  // §10.2: half the kit is picked up off the field after a win.
  _recoverKit() {
    const r = this.raid;
    const armouries = this._armouries();
    for (let i = 0; i < r.fallen.length; i++) {
      const item = r.fallen[i];
      if (!this.rng.chance(C.EQUIPMENT_RECOVERY_CHANCE)) { this.debug.armsLost++; continue; }
      if (this._storeArm(armouries, item)) this.debug.armsRecovered++;
      else this.debug.armsLost++;
    }
    r.fallen.length = 0;
  }

  /** §10.7, prodded from the tick so an empty town ends between days (Q4). */
  checkGameOver() { return this._checkGameOver(''); }

  _checkGameOver(reason) {
    if (this.gameOver) return;
    const eco = this.game.economy;
    const pop = eco && eco.population !== undefined ? eco.population : 1;
    let why = '';
    if (pop <= 0) why = 'the valley is empty';
    else if (reason === 'town centre destroyed' && !this._canRebuildCentre()) {
      why = 'the Town Centre is gone and there is nothing left to rebuild it with';
    }
    if (!why) return;
    this.gameOver = true;
    this._emit('game:over', { reason: why, stats: this.finalStats() });
  }

  // §10.7 / §16.1: wood is never truly unobtainable while a forest stands, so
  // a lost Town Centre only ends the game on a map with nothing left to cut.
  _canRebuildCentre() {
    const eco = this.game.economy;
    if (eco && typeof eco.stock === 'function') {
      if (eco.stock('wood') > 0 || eco.stock('stone') > 0) return true;
    }
    const world = this.game.world;
    if (world && world.resource) {
      for (let i = 0; i < NTILES; i++) {
        const r = world.resource[i];
        if ((r === C.RESOURCE.TREE || r === C.RESOURCE.STONE) && world.amount[i] > 0) return true;
      }
    }
    return false;
  }

  finalStats() {
    return {
      // ui.js renders the stats screen from exactly these four.
      days: this.stats.daysSurvived,
      peakPop: this.stats.peakPopulation,
      raidsHeld: this.stats.raidsHeld,
      tier: this.stats.tierReached,
      daysSurvived: this.stats.daysSurvived,
      peakPopulation: this.stats.peakPopulation,
      raidsFaced: this.stats.raidsFaced,
      raidsRavaged: this.stats.raidsRavaged,
      tierReached: this.stats.tierReached,
      tierName: C.TIER_NAMES[this.stats.tierReached - 1] || 'Hamlet',
      enemiesKilled: this.stats.enemiesKilled,
      soldiersLost: this.stats.soldiersLost,
      buildingsLost: this.stats.buildingsLost,
      wavesSurvived: this.wave,
    };
  }

  /* ---------------------------------------------------------------- *
   * §10.6  Emergency draft
   * ---------------------------------------------------------------- */

  /** Living townsfolk, however economy.js is feeling about its cache. */
  _population() {
    const eco = this.game.economy;
    if (eco && eco.population !== undefined) return eco.population;
    const list = this.game.villagers && this.game.villagers.list;
    if (!list) return 0;
    let n = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead && !list[i].removed) n++;
    return n;
  }

  _draft() {
    const vs = this.game.villagers;
    if (!vs || typeof vs.forcedConscript !== 'function') return 0;
    const r = this.raid;
    const pop = this._population();
    if (pop <= 0) return 0;
    // §16.6 promises a town always fights back, badly. Below four people the
    // 30% share rounds to nobody, so the floor is what makes "always" true.
    // §10.6 sizes the militia once per raid: a re-draft after the garrison is
    // wiped refills that quota rather than issuing a fresh one, or a long raid
    // would feed the whole town into it six at a time.
    const quota = Math.max(1, Math.min(6, Math.floor((r.popAtStart || pop) * 0.3)));
    const n = quota - r.draftedTotal;
    if (n <= 0) return 0;

    const before = this._soldierIdSet();
    const ret = vs.forcedConscript(n);
    this.drafted.length = 0;
    if (Array.isArray(ret)) {
      for (let i = 0; i < ret.length; i++) this.drafted.push(ret[i]);
    } else {
      // §8 documents a count; find who actually changed. `v.conscript` is the
      // marker villagers.js sets — the draft gives role 'soldier', not 'militia'.
      const list = vs.list || [];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (!v || before.has(v.id)) continue;
        if (v.conscript || v.role === 'soldier') this.drafted.push(v.id);
      }
    }
    if (this.drafted.length === 0) this._lastDitch(n);
    r.draftedTotal += this.drafted.length;
    this._refreshSoldiers();
    if (this.drafted.length > 0) {
      this._emit('toast', {
        text: `No garrison — ${this.drafted.length} villagers take up pitchforks.`,
        kind: 'warn',
      });
    }
    return this.drafted.length;
  }

  /**
   * villagers.js conscripts adults only, so a town of orphans would meet a
   * raid with nobody at all. These are not conscripts — releaseConscripts
   * passes over them — and clearing the draft list is all it takes to stand
   * them down. Combat orders reach any villager, so they can still swing.
   */
  _lastDitch(n) {
    const list = (this.game.villagers && this.game.villagers.list) || [];
    for (let i = 0; i < list.length && this.drafted.length < n; i++) {
      const v = list[i];
      if (!v || v.dead || v.removed || v.leaving) continue;
      this.drafted.push(v.id);
    }
  }

  _releaseDraft() {
    const vs = this.game.villagers;
    if (this.drafted.length === 0) return;
    if (vs && typeof vs.releaseConscripts === 'function') vs.releaseConscripts(this.drafted);
    for (let i = 0; i < this.drafted.length; i++) {
      this.kits.delete(this.drafted[i]);
      this.hpById.delete(this.drafted[i]);
      this.intents.delete(this.drafted[i]);
    }
    this.drafted.length = 0;
    this._refreshSoldiers();
  }

  _soldierIdSet() {
    const s = new Set();
    for (let i = 0; i < this.sIds.length; i++) s.add(this.sIds[i]);
    return s;
  }

  /* ---------------------------------------------------------------- *
   * §10.2  Equipment
   * ---------------------------------------------------------------- */

  /**
   * Reassign the best available kit to every soldier, best garrison first.
   * Items live in the Armoury or on a soldier, never in both and never in
   * neither: every transfer goes through buildings.take / buildings.add.
   */
  equipSoldiers() {
    this._refreshBuildings();
    this._refreshSoldiers();
    const armouries = this._armouries();
    // R1: an armoury-less town still re-equips, because a garrison draws its
    // spears from its own barracks.
    if (this.sIds.length === 0) return;

    const order = this._equipOrder();

    // Return everything first, all-or-nothing per soldier so a full armoury
    // can never swallow half a kit.
    for (let i = 0; i < order.length; i++) {
      const id = this.sIds[order[i]];
      const kit = this.kits.get(id);
      if (!kit) continue;
      if (kit.tier === 0 && !kit.weapon && !kit.armour && !kit.shield) {
        this.kits.delete(id);
        continue;
      }
      if (this._canStoreAll(armouries, kit)) {
        if (kit.weapon && !kit.issued) this._storeArm(armouries, kit.weapon);
        if (kit.armour) this._storeArm(armouries, kit.armour);
        if (kit.shield) this._storeArm(armouries, kit.shield);
        this.kits.delete(id);
      }
    }

    for (let i = 0; i < order.length; i++) {
      const slot = order[i];
      const id = this.sIds[slot];
      if (this.kits.has(id)) continue;    // kit could not be returned; keep it
      this.kits.set(id, this._bestKitFrom(armouries, this._sortieRank(slot) === 0));
    }
  }

  _equipOrder() {
    const n = this.sIds.length;
    const order = new Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    const self = this;
    order.sort((a, b) => {
      const ba = self.sBuilding[a], bb = self.sBuilding[b];
      const da = ba ? C.BUILDING_BY_ID[ba.defId] : null;
      const db = bb ? C.BUILDING_BY_ID[bb.defId] : null;
      // K5: scarce kit goes to the men who will meet the raiders. A Guard
      // Tower archer never leaves the tower, whatever the building's tier.
      const ra = self._sortieRank(a), rb = self._sortieRank(b);
      if (ra !== rb) return ra - rb;
      const ga = da ? (da.garrison || da.jobs || 0) : 0;
      const gb = db ? (db.garrison || db.jobs || 0) : 0;
      if (ga !== gb) return gb - ga;
      return self.sIds[a] - self.sIds[b];
    });
    return order;
  }

  // 0 sorties, 1 stays in its tower, 2 is a conscript who will be sent home.
  _sortieRank(slot) {
    if (!this.sBuilding[slot]) return 2;
    return this.sTower[slot] === 1 ? 1 : 0;
  }

  /** `canIssue`: this soldier is garrisoned somewhere that hands out spears. */
  _bestKitFrom(armouries, canIssue) {
    // The arms chain unlocks unevenly (a wooden spear needs no iron, a gambeson
    // needs a whole wool chain), so a soldier takes the best weapon and the best
    // armour he can get even when they are not the same tier.
    const stocked = this._bestBySlot(armouries, WEAPON_RANK);
    const armour = this._bestBySlot(armouries, ARMOUR_RANK);
    // The barracks issue is free, so it is taken whenever the armoury cannot
    // out-fight it — that leaves the stocked spear for a man who has no rack.
    // The test is on power, not tier: the rack and a crafted spear share a
    // tier, so a tier comparison can never see the cap that separates them.
    const issued = !!(canIssue && ISSUE_WEAPON
      && weaponPower(stocked, armour)
        <= Math.min(weaponPower(ISSUE_WEAPON, armour), ISSUE_POWER_CAP));
    const weapon = issued ? ISSUE_WEAPON : stocked;
    if (!weapon && !armour) return this._makeKit(C.EQUIPMENT_TIERS[0], '', '', '', false);
    const tier = C.EQUIPMENT_TIERS[kitTierFor(weapon, armour)];
    let shield = '';
    if (tier.shield && this._firstAvailable(armouries, ['shield'])) shield = 'shield';
    if (weapon && !issued) this._takeArm(armouries, weapon);
    if (armour) this._takeArm(armouries, armour);
    if (shield) this._takeArm(armouries, shield);
    return this._makeKit(tier, weapon, armour, shield, issued);
  }

  /** Highest-ranked item of one slot that any armoury actually holds. */
  _bestBySlot(armouries, ranks) {
    let best = '', bestRank = 0;
    for (const item in ranks) {
      if (ranks[item] <= bestRank) continue;
      if (this._firstAvailable(armouries, [item])) { best = item; bestRank = ranks[item]; }
    }
    return best;
  }

  /**
   * `tier` is the kit's own tier (see `kitTierFor`) and sets damage; the
   * armour's rank is read back off the item id and sets hit points. Both derive
   * from the arguments, so a save round-trips from `[tier, weapon, armour,
   * shield, issued]` alone.
   */
  _makeKit(tier, weapon, armour, shield, issued) {
    const base = issued ? Math.min(tier.power, ISSUE_POWER_CAP) : tier.power;
    const power = base + (shield ? tier.shieldBonus : 0);
    const ranged = weapon && tier.rangedWeapons && tier.rangedWeapons.indexOf(weapon) >= 0;
    const aTier = C.EQUIPMENT_TIERS[armour ? (ARMOUR_RANK[armour] || 0) : 0];
    const defence = aTier.power + (shield ? aTier.shieldBonus : 0);
    const maxHp = SOLDIER_HP.base + defence * SOLDIER_HP.perPower + (shield ? SOLDIER_HP.shield : 0);
    return {
      tier: tier.tier, name: tier.name, weapon: weapon || '', armour: armour || '',
      shield: shield || '', power, range: ranged ? tier.range : 1, maxHp,
      issued: !!issued,
    };
  }

  _armouries() {
    const out = [];
    const list = this._blist;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.hp <= 0) continue;
      const def = C.BUILDING_BY_ID[b.defId];
      if (!def || !def.storage || !def.storage.classes) continue;
      if (def.storage.classes.indexOf('arms') < 0) continue;
      out.push(b);
    }
    return out;
  }

  _firstAvailable(armouries, ids) {
    if (!ids) return '';
    for (let i = 0; i < ids.length; i++) {
      const item = ids[i];
      for (let j = 0; j < armouries.length; j++) {
        const inv = armouries[j].inv;
        if (inv && inv[item] > 0) return item;
      }
    }
    return '';
  }

  _takeArm(armouries, item) {
    const bs = this.game.buildings;
    for (let j = 0; j < armouries.length; j++) {
      const b = armouries[j];
      if (!b.inv || !(b.inv[item] > 0)) continue;
      if (bs && typeof bs.take === 'function') {
        if (bs.take(b, item, 1) > 0) return true;
      }
    }
    return false;
  }

  _storeArm(armouries, item) {
    const bs = this.game.buildings;
    if (!bs || typeof bs.add !== 'function') return false;
    for (let j = 0; j < armouries.length; j++) {
      if (bs.add(armouries[j], item, 1) > 0) return true;
    }
    return false;
  }

  _canStoreAll(armouries, kit) {
    const bs = this.game.buildings;
    let need = 0;
    if (kit.weapon && !kit.issued) need++;
    if (kit.armour) need++;
    if (kit.shield) need++;
    // An all-issued kit is put back on the rack it came from, which is free.
    if (need === 0) return true;
    if (!bs || typeof bs.capacityFor !== 'function') return armouries.length > 0;
    let room = 0;
    for (let j = 0; j < armouries.length; j++) {
      room += bs.capacityFor(armouries[j], kit.armour || kit.shield || kit.weapon) || 0;
      if (room >= need) return true;
    }
    return room >= need;
  }

  /**
   * The kit a soldier is carrying; tier-0 militia if they have none. A man who
   * joined a garrison since the last `equipSoldiers()` still gets R1's issue —
   * the rack does not wait for nightfall.
   */
  kitOf(villagerId) {
    let k = this.kits.get(villagerId);
    if (!k) {
      const slot = this._soldierSlot(villagerId);
      k = (slot >= 0 && this._sortieRank(slot) === 0)
        ? this._makeKit(C.EQUIPMENT_TIERS[ISSUE_RANK], ISSUE_WEAPON, '', '', true)
        : this._makeKit(C.EQUIPMENT_TIERS[0], '', '', '', false);
      this.kits.set(villagerId, k);
    }
    return k;
  }

  /* ---------------------------------------------------------------- *
   * Soldier roster
   * ---------------------------------------------------------------- */

  _refreshSoldiers() {
    this._soldierT = 0.5;
    const ids = this.sIds;
    ids.length = 0;
    this.sTower.length = 0;
    this.sBuilding.length = 0;

    const list = this._blist;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.hp <= 0 || b.active === false) continue;
      const def = C.BUILDING_BY_ID[b.defId];
      if (!def || def.role !== 'soldier' || !b.workers) continue;
      const tower = def.attack ? 1 : 0;
      for (let k = 0; k < b.workers.length; k++) {
        if (ids.length >= 160) break;
        // A roster entry for a man who no longer exists is a slot the save
        // cannot carry; he is not a soldier, whatever the worker list says.
        if (!this._villager(b.workers[k])) continue;
        ids.push(b.workers[k]);
        this.sTower.push(tower);
        this.sBuilding.push(b);
      }
    }
    for (let i = 0; i < this.drafted.length; i++) {
      if (ids.length >= 160) break;
      if (ids.indexOf(this.drafted[i]) >= 0) continue;
      if (!this._villager(this.drafted[i])) continue;
      ids.push(this.drafted[i]);
      this.sTower.push(0);
      this.sBuilding.push(null);
    }

    this.sSlot.clear();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      // hpById and kits hold the living only: a row keyed on a man the save
      // cannot resolve is a row the reload silently drops, which would leave
      // the original and the restored game tracking different soldiers. A man
      // killed this tick is still a listed worker until the reap — he musters
      // at 0 and gets no row, rather than rising at full health.
      const v = this._villager(id);
      const alive = !!(v && !v.dead);
      const kit = alive ? this.kitOf(id) : null;
      let hp = this.hpById.get(id);
      if (hp === undefined) {
        hp = alive ? kit.maxHp : 0;
        if (alive) this.hpById.set(id, hp);
      }
      this.sHp[i] = hp;
      this.sSlot.set(id, i);
    }
  }

  _soldierSlot(villagerId) {
    const s = this.sSlot.get(villagerId);
    return s === undefined ? -1 : s;
  }

  /**
   * Soldiers who will sortie — tower archers stay put and are not targets,
   * and neither is a man behind a standing wall (K3): raiders who cannot
   * reach him go through the wall first.
   */
  _nearestFieldSoldier(x, y, radius, region) {
    const ids = this.sIds;
    let best = -1, bd = radius * radius;
    for (let i = 0; i < ids.length; i++) {
      if (this.sHp[i] <= 0 || this.sTower[i] === 1) continue;
      const v = this._villager(ids[i]);
      if (!v || v.dead) continue;
      if (region !== undefined && this._regionAt(v.vx, v.vy) !== region) continue;
      const dx = v.vx - x, dy = v.vy - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = ids[i]; }
    }
    return best;
  }

  /** Nearest live enemy, optionally restricted to one side of a perimeter. */
  _nearestEnemyIndex(x, y, radius, region) {
    const es = this.enemies;
    let best = -1, bd = radius * radius;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.active || e.dead) continue;
      if (region !== undefined && this._regionAt(e.x, e.y) !== region) continue;
      const dx = e.x - x, dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** §10.5.4 morale, clamped. */
  moraleMult() {
    const eco = this.game.economy;
    const happiness = eco && eco.happiness !== undefined ? eco.happiness : 50;
    return U.clamp(0.75 + 0.5 * (happiness / 100), 0.6, 1.25);
  }

  /** Total fighting power on the field, for the UI and QA. */
  defencePower() {
    this._refreshBuildings();
    this._refreshSoldiers();
    let p = 0;
    for (let i = 0; i < this.sIds.length; i++) p += this.kitOf(this.sIds[i]).power;
    return p;
  }

  /** ui.js reads `.length`; render.js may iterate for hp bars. */
  get soldiers() { return this.sIds; }

  get soldierCount() { return this.sIds.length; }

  get raidActive() { return this.raid.active; }

  /* ---------------------------------------------------------------- *
   * Enemy walkability + BFS (gates are closed to raiders)
   * ---------------------------------------------------------------- */

  /**
   * Enemy pathing is NOT villager pathing: a gate is walkable for villagers
   * (§10.3) and shut to raiders. Everything downstream of this — objectives,
   * breaching, the wall system being anything but decoration — rests on it.
   */
  _enemyWalkable(idx) {
    if (idx < 0 || idx >= NTILES) return false;
    const world = this.game.world;
    if (!world || !world.terrain) return false;
    const ti = C.TERRAIN_INFO[world.terrain[idx]];
    if (!ti || !ti.walkable) return false;
    // ADDENDUM E4: world.solid[]/world.gate[] are the authoritative bitmaps.
    if (world.gate && world.gate[idx]) return false;
    if (world.solid && world.solid[idx]) return false;
    const bid = world.building ? world.building[idx] : -1;
    if (bid === undefined || bid < 0) return true;
    const b = this._building(bid);
    if (!b) return true;
    const bs = this.game.buildings;
    if (bs && typeof bs.blocksEnemies === 'function') return !bs.blocksEnemies(b);
    const def = C.BUILDING_BY_ID[b.defId];
    if (!def) return true;
    return !(def.solid || def.gate || def.wall);
  }

  _isBreachable(idx) {
    const world = this.game.world;
    if (!world || !world.building) return false;
    const bid = world.building[idx];
    if (bid === undefined || bid < 0) return false;
    const b = this._building(bid);
    if (!b || b.hp <= 0) return false;
    return true;
  }

  /**
   * BFS over enemy-walkable tiles. Returns true and fills `_pathScratch` with
   * a route to `toIdx`; otherwise records the wall/gate tiles it bumped into
   * so `_chooseBreach` can pick what to chop through.
   */
  _bfs(fromIdx, toIdx) {
    if (fromIdx < 0 || toIdx < 0) return false;
    const gen = ++this._bfsStamp;
    const seen = this._bfsGen, prev = this._bfsPrev, q = this._bfsQ, dist = this._bfsDist;
    let head = 0, tail = 0;
    q[tail++] = fromIdx;
    seen[fromIdx] = gen;
    prev[fromIdx] = -1;
    dist[fromIdx] = 0;
    this._breachCount = 0;
    let expanded = 0;

    while (head < tail && expanded < BREACH_BFS_BUDGET) {
      const cur = q[head++];
      expanded++;
      if (cur === toIdx) { this._reconstruct(cur); return true; }
      const cx = cur % GW, cy = (cur / GW) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + C.DIR_DX[d], ny = cy + C.DIR_DY[d];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nIdx = ny * GW + nx;
        if (seen[nIdx] === gen) continue;
        if (!this._enemyWalkable(nIdx)) {
          // Frontier wall/gate: a candidate to break through.
          if (this._isBreachable(nIdx) && this._breachCount < this._breachIdx.length) {
            const c = this._breachCount++;
            this._breachIdx[c] = nIdx;
            this._breachFrom[c] = cur;
            this._breachDist[c] = dist[cur];
            seen[nIdx] = gen;
          }
          continue;
        }
        if (d & 1) {
          // No corner-cutting between two blocked orthogonals.
          const oa = cy * GW + (cx + C.DIR_DX[d]);
          const ob = ny * GW + cx;
          if (!this._enemyWalkable(oa) && !this._enemyWalkable(ob)) continue;
        }
        seen[nIdx] = gen;
        prev[nIdx] = cur;
        dist[nIdx] = dist[cur] + 1;
        q[tail++] = nIdx;
      }
    }
    return false;
  }

  _reconstruct(endIdx) {
    const prev = this._bfsPrev;
    let n = 0, cur = endIdx;
    const tmp = this._pathScratch;
    while (cur >= 0 && n < ENEMY_PATH_CAP) { tmp[n++] = cur; cur = prev[cur]; }
    // reverse in place
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      const t = tmp[i]; tmp[i] = tmp[j]; tmp[j] = t;
    }
    this._bfsPathLen = n;
  }

  /** Pick the wall/gate that best trades walking distance for progress. */
  _chooseBreach(toIdx) {
    const n = this._breachCount;
    if (!n) { this._breachApproach = -1; return -1; }
    const tx = toIdx % GW, ty = (toIdx / GW) | 0;
    let best = -1, bestScore = Infinity, bestFrom = -1;
    for (let i = 0; i < n; i++) {
      const idx = this._breachIdx[i];
      const x = idx % GW, y = (idx / GW) | 0;
      const wb = this._buildingAt(idx);
      // Close first, then whatever gets us nearest the objective, then the
      // weakest piece — raiders go for the thin part of the wall.
      const score = this._breachDist[i] + U.octile(x, y, tx, ty) * 0.6
        + (wb ? wb.hp * 0.01 : 0);
      if (score < bestScore) { bestScore = score; best = idx; bestFrom = this._breachFrom[i]; }
    }
    this._breachApproach = bestFrom;
    return best;
  }

  // The stuck watchdog's last resort before routing: hit whatever is nearest.
  _forceBreach(e) {
    const list = this._blist;
    let best = null, bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.built || b.hp <= 0) continue;
      const d = this._distToBuilding(e.x, e.y, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) { this._rout(e); return; }
    e.targetKind = 2;
    e.targetId = best.id;
    e.breachId = best.id;
    e.breachTile = this._doorTile(best);
    if (bd <= e.range + 0.35) { e.pathLen = 0; return; }
    const fromIdx = U.toIdx(Math.floor(e.x), Math.floor(e.y));
    const door = this._doorTile(best);
    if (this._bfs(fromIdx, door)) this._adoptPath(e, this._pathScratch, this._bfsPathLen);
    else {
      // Walk straight at it; walls stop the movement, not the intent.
      e.pathLen = 0;
      const cx = best.x + (best.w || 1) / 2, cy = best.y + (best.h || 1) / 2;
      const dx = cx - e.x, dy = cy - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const stepIdx = U.toIdx(
        U.clamp(Math.floor(e.x + dx / d), 0, GW - 1),
        U.clamp(Math.floor(e.y + dy / d), 0, GH - 1),
      );
      if (this._enemyWalkable(stepIdx)) {
        this._pathScratch[0] = stepIdx;
        this._adoptPath(e, this._pathScratch, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Geometry helpers
   * ---------------------------------------------------------------- */

  _distToBuilding(x, y, b) {
    const w = b.w || 1, h = b.h || 1;
    const cx = U.clamp(x, b.x, b.x + w);
    const cy = U.clamp(y, b.y, b.y + h);
    const dx = x - cx, dy = y - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Nearest tile a raider can actually stand on, for targets that are not. */
  _approachTile(idx) {
    if (idx < 0) return -1;
    if (this._enemyWalkable(idx)) return idx;
    const cx = idx % GW, cy = (idx / GW) | 0;
    for (let ring = 1; ring <= 3; ring++) {
      for (let y = cy - ring; y <= cy + ring; y++) {
        for (let x = cx - ring; x <= cx + ring; x++) {
          if (Math.abs(x - cx) !== ring && Math.abs(y - cy) !== ring) continue;
          if (!U.inBounds(x, y)) continue;
          const n = U.toIdx(x, y);
          if (this._enemyWalkable(n)) return n;
        }
      }
    }
    return -1;
  }

  // Raiders do not use the door; they walk to the nearest tile they can stand
  // on beside the footprint, which is also where they will start swinging.
  _doorTile(b) {
    const w = b.w || 1, h = b.h || 1;
    for (let ring = 1; ring <= 4; ring++) {
      const x0 = b.x - ring, x1 = b.x + w - 1 + ring;
      const y0 = b.y - ring, y1 = b.y + h - 1 + ring;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
          if (!U.inBounds(x, y)) continue;
          const idx = U.toIdx(x, y);
          if (this._enemyWalkable(idx)) return idx;
        }
      }
    }
    return U.inBounds(b.x, b.y) ? U.toIdx(b.x, b.y) : -1;
  }

  _townCentre() {
    const list = this._blist;
    for (let i = 0; i < list.length; i++) {
      if (list[i].defId === 'town_centre' && list[i].hp > 0) return list[i];
    }
    return null;
  }

  _hasWatchtower() {
    const list = this._blist;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.defId !== 'watchtower' || !b.built || b.hp <= 0) continue;
      if (b.workers && b.workers.length > 0) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- *
   * K3  Wall doctrine — which side of the perimeter a thing stands on
   * ---------------------------------------------------------------- */

  /**
   * Label every tile with the region it belongs to, where intact walls and
   * gates are the only barriers. Two things in different regions have a
   * fortification between them; a gate counts even though villagers walk
   * through it, because walking out through your own gate is what K3 forbids.
   */
  _refreshRegions() {
    this._regionDirty = false;
    if (!this._region) this._region = new Int32Array(NTILES);
    if (!this._bfsQ) this._bfsQ = new Int32Array(NTILES);
    const region = this._region;
    const q = this._bfsQ;
    const gates = this._gateTiles;
    gates.length = 0;
    region.fill(-2);
    this._hasPerimeter = false;

    let next = 0;
    for (let start = 0; start < NTILES; start++) {
      if (region[start] !== -2) continue;
      if (this._markPerimeter(start, region, gates)) continue;
      const id = next++;
      let head = 0, tail = 0;
      q[tail++] = start;
      region[start] = id;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % GW, cy = (cur / GW) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + C.DIR_DX[d], ny = cy + C.DIR_DY[d];
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const n = ny * GW + nx;
          if (region[n] !== -2) continue;
          if (this._markPerimeter(n, region, gates)) continue;
          region[n] = id;
          q[tail++] = n;
        }
      }
    }
    this._regionCount = next;
  }

  // Returns true when `idx` holds a standing wall or gate, and records it.
  _markPerimeter(idx, region, gates) {
    const b = this._buildingAt(idx);
    if (!b || !b.built || b.hp <= 0) return false;
    const def = C.BUILDING_BY_ID[b.defId];
    if (!def || !(def.wall || def.gate)) return false;
    region[idx] = -1;
    this._hasPerimeter = true;
    if (def.gate) gates.push(idx);
    return true;
  }

  /**
   * True when a standing wall or gate lies between the two points. Nobody
   * trades blows through a wall: an enemy's reach is 1.0 and a swordsman's
   * 0.8, so without this a raider on the far side of a palisade hits a
   * defender who cannot hit back, and the wall costs its owner men.
   */
  _separated(ax, ay, bx, by) {
    if (!this._perimeterExists()) return false;
    const ra = this._regionAt(ax, ay);
    const rb = this._regionAt(bx, by);
    // Someone standing in the gateway itself is on the line, not behind it.
    return ra >= 0 && rb >= 0 && ra !== rb;
  }

  /** Whether the town has any standing wall or gate at all. */
  _perimeterExists() {
    if (this._regionDirty) this._refreshRegions();
    return this._hasPerimeter;
  }

  /** Region at a position; -1 on the perimeter itself or off the map. */
  _regionAt(x, y) {
    if (this._regionDirty) this._refreshRegions();
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= GW || iy >= GH) return -1;
    return this._region[iy * GW + ix];
  }

  /** The tile nearest `e` that is still on `region`'s side of the wall. */
  _insideFaceNear(e, region) {
    if (region < 0) return -1;
    if (this._regionDirty) this._refreshRegions();
    const ex = e.x | 0, ey = e.y | 0;
    for (let ring = 0; ring <= MUSTER_SEARCH; ring++) {
      for (let y = ey - ring; y <= ey + ring; y++) {
        for (let x = ex - ring; x <= ex + ring; x++) {
          if (ring > 0 && Math.abs(x - ex) !== ring && Math.abs(y - ey) !== ring) continue;
          if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
          const n = y * GW + x;
          if (this._region[n] !== region) continue;
          if (!this._standable(n)) continue;
          return n;
        }
      }
    }
    return -1;
  }

  _standable(idx) {
    const world = this.game.world;
    if (!world || typeof world.isWalkable !== 'function') return true;
    return world.isWalkable(idx);
  }

  /** K3's fallback muster point: just inside the nearest gate. */
  _gateMusterTile(x, y, region) {
    if (this._regionDirty) this._refreshRegions();
    const gates = this._gateTiles;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const gx = g % GW, gy = (g / GW) | 0;
      const d = U.octile(x, y, gx, gy);
      if (d >= bestD) continue;
      for (let k = 0; k < 8; k++) {
        const nx = gx + C.DIR_DX[k], ny = gy + C.DIR_DY[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (this._region[n] !== region || !this._standable(n)) continue;
        best = n; bestD = d;
        break;
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------- *
   * Cross-module caches
   * ---------------------------------------------------------------- */

  _refreshBuildings() {
    this._dirtyBuildings = false;
    this._bCacheT = BUILDING_CACHE_INTERVAL;
    const bs = this.game.buildings;
    const out = this._blist;
    out.length = 0;
    this._bMap.clear();
    if (!bs) return;
    let src = null;
    if (Array.isArray(bs.list)) src = bs.list;
    else if (typeof bs.all === 'function') src = bs.all();
    else if (Array.isArray(bs.buildings)) src = bs.buildings;
    if (!src) return;
    for (let i = 0; i < src.length; i++) {
      const b = src[i];
      if (!b) continue;
      out.push(b);
      this._bMap.set(b.id, b);
    }
  }

  _building(id) {
    const b = this._bMap.get(id);
    if (b) return b;
    const bs = this.game.buildings;
    if (bs && typeof bs.get === 'function') return bs.get(id) || null;
    return null;
  }

  _buildingAt(idx) {
    const world = this.game.world;
    if (!world || !world.building) return null;
    const id = world.building[idx];
    if (id === undefined || id < 0) return null;
    return this._building(id);
  }

  _refreshVillagers() {
    this._vCacheT = BUILDING_CACHE_INTERVAL;
    const vs = this.game.villagers;
    this._vMap.clear();
    if (!vs) return;
    const src = Array.isArray(vs.list) ? vs.list : (typeof vs.all === 'function' ? vs.all() : null);
    if (!src) return;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (v) this._vMap.set(v.id, v);
    }
  }

  _villager(id) {
    let v = this._vMap.get(id);
    if (!v) {
      const vs = this.game.villagers;
      v = (vs && typeof vs.get === 'function') ? vs.get(id) : null;
    }
    // A man who has walked out of town is off the map and out of the save, so
    // he is no soldier, no target and no row here either.
    return (v && !v.removed) ? v : null;
  }

  /**
   * Will the save carry this man? villagers.js writes everyone it still holds
   * but the departed, and every per-man row military writes is dropped on
   * reload if his is not there. Asked of villagers.js rather than the local
   * cache, which is a tick stale in play and stops being refreshed once the
   * game is over.
   */
  _inSave(id) {
    const vs = this.game.villagers;
    const v = (vs && typeof vs.get === 'function') ? vs.get(id) : this._vMap.get(id);
    return !!(v && !v.removed);
  }

  _emit(name, payload) {
    if (this.bus) this.bus.emit(name, payload);
    else if (this.game && this.game.bus) this.game.bus.emit(name, payload);
  }

  /* ---------------------------------------------------------------- *
   * §14  Save / restore
   * ---------------------------------------------------------------- */

  serialize() {
    const enemies = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      enemies.push({
        id: e.id, t: e.typeIdx,
        // Full precision, deliberately: rounding combat state to 2dp perturbs
        // every combatant by ~0.005 on a save/reload, which measurably flips
        // raid outcomes. Save size is not worth a save-scum exploit.
        x: e.x, y: e.y, hp: e.hp,
        tk: e.targetKind, ti: e.targetId,
        ro: e.routing ? 1 : 0, rt: e.routT,
        hx: e.homeX, hy: e.homeY,
        // Combat cadence and the path already walked. Without them a reload
        // restarts every raider's retarget/repath cycle from zero, which is a
        // different fight from the one the player saved.
        rg: e.retargetT, rp: e.repathT, st: e.stuckT,
        lx: e.lastX, ly: e.lastY, ht: e.hitT, en: e.engaged ? 1 : 0,
        bi: e.breachId, bt: e.breachTile,
        ps: e.pathStep, p: Array.from(e.path.subarray(0, e.pathLen)),
      });
    }
    // Per-soldier combat state, keyed by man rather than by slot: slots are
    // rebuilt on load. §10.2's free-round mark belongs here — a reload that
    // forgets it hands every crossbow another opening volley. Rows for men the
    // save does not carry are left out rather than written and then dropped on
    // load, which is the same filter `restore` applies from the other side.
    const soldiers = [];
    for (let i = 0; i < this.sIds.length; i++) {
      if (!this._inSave(this.sIds[i])) continue;
      soldiers.push([this.sIds[i], this.sHitT[i], this.sTargetEnemy[i], this.sFreeMark[i]]);
    }
    const intents = [];
    this.intents.forEach((it, id) => {
      if (!this._inSave(id)) return;
      intents.push([id, it.mode, it.tx, it.ty, it.enemyId]);
    });
    // Every row, empty militia kits included: `kits.has(id)` is what marks a
    // death as a soldier's, so a dropped row is a loss the town never counts.
    const kits = [];
    // The issued flag rides along: a reloaded free spear that read as stock
    // would be storable into an Armoury, minting arms across a save.
    this.kits.forEach((k, id) => {
      if (!this._inSave(id)) return;
      kits.push([id, k.tier, k.weapon, k.armour, k.shield, k.issued ? 1 : 0]);
    });
    const hps = [];
    this.hpById.forEach((hp, id) => {
      if (!this._inSave(id)) return;
      hps.push([id, hp]);
    });

    return {
      wave: this.wave,
      nextRaidDay: this.nextRaidDay,
      nextEnemyId: this._nextEnemyId,
      warning: this.warning
        ? {
          wave: this.warning.wave, daysUntil: this.warning.daysUntil,
          passIdx: this.warning.passIdx.slice(),
        }
        : null,
      rng: this.rng.getState(),
      gameOver: this.gameOver,
      stats: {
        daysSurvived: this.stats.daysSurvived,
        peakPopulation: this.stats.peakPopulation,
        raidsHeld: this.stats.raidsHeld,
        raidsFaced: this.stats.raidsFaced,
        raidsRavaged: this.stats.raidsRavaged,
        tierReached: this.stats.tierReached,
        enemiesKilled: this.stats.enemiesKilled,
        soldiersLost: this.stats.soldiersLost,
        buildingsLost: this.stats.buildingsLost,
      },
      drafted: this.drafted.filter((id) => this._inSave(id)),
      kits,
      hps,
      soldiers,
      // Who has already been booked dead this raid, so a reload cannot count
      // the same man's kit and loss twice.
      mourned: Array.from(this._mourned),
      towerHitT: this._towerHitT,
      // Cadence, not decoration: a zeroed re-draft cooldown musters a militia
      // on the tick after a load that the running game would not have.
      redraftT: this._redraftT,
      soldierT: this._soldierT,
      // villagers.js reads intentFor() during its own update, so an order
      // dropped on load is a tick of soldiers standing around.
      intents,
      // Written whether or not a raid is running: once it ends the block is
      // the last raid's after-action summary, which the report reads.
      raid: {
        active: this.raid.active,
        wave: this.raid.wave, t: this.raid.t,
        startHp: this.raid.startHp, routing: this.raid.routing,
        kills: this.raid.kills, losses: this.raid.losses,
        buildingsLost: this.raid.buildingsLost, wallsLost: this.raid.wallsLost,
        spawned: this.raid.spawned, popAtStart: this.raid.popAtStart,
        draftedTotal: this.raid.draftedTotal,
        passes: this.raid.passes.slice(),
        loot: Object.assign({}, this.raid.loot),
        fallen: this.raid.fallen.slice(),
        enemies,
      },
    };
  }

  restore(obj, game) {
    if (game) this.game = game;
    if (!obj) return;
    this._collectPasses();
    this._refreshBuildings();
    this._refreshVillagers();
    this._regionDirty = true;

    this.wave = num(obj.wave, 0);
    this.nextRaidDay = num(obj.nextRaidDay, C.RAID_FIRST_DAY);
    this._nextEnemyId = num(obj.nextEnemyId, 1);
    this.gameOver = !!obj.gameOver;
    if (obj.rng) this.rng.setState(obj.rng);
    if (obj.stats) {
      for (const k in this.stats) this.stats[k] = num(obj.stats[k], this.stats[k]);
    }

    if (obj.warning) {
      const passIdx = (obj.warning.passIdx || []).filter((i) => i >= 0 && i < this.passList.length);
      const passes = [];
      for (let i = 0; i < passIdx.length; i++) passes.push(this.passList[passIdx[i]]);
      this.warning = {
        wave: num(obj.warning.wave, 0),
        daysUntil: num(obj.warning.daysUntil, 0),
        passes,
        passIdx,
      };
    } else {
      this.warning = null;
    }

    // §14: drop cross-module references whose object is gone.
    this.drafted.length = 0;
    const draftedIn = obj.drafted || [];
    for (let i = 0; i < draftedIn.length; i++) {
      if (this._villager(draftedIn[i])) this.drafted.push(draftedIn[i]);
    }

    this.kits.clear();
    const kits = obj.kits || [];
    for (let i = 0; i < kits.length; i++) {
      const [id, tierNum, weapon, armour, shield, issued] = kits[i];
      if (!this._villager(id)) continue;
      const tier = C.EQUIPMENT_BY_TIER[tierNum] || C.EQUIPMENT_TIERS[0];
      this.kits.set(id, this._makeKit(tier, weapon, armour, shield, !!issued));
    }

    this.hpById.clear();
    const hps = obj.hps || [];
    for (let i = 0; i < hps.length; i++) {
      const row = hps[i];
      if (!this._villager(row[0])) continue;
      this.hpById.set(row[0], Math.max(0, num(row[1], 0)));
    }

    this._despawnAll();
    this.raid = this._blankRaid();
    this.intents.clear();
    this._towerHitT = num(obj.towerHitT, 0);
    this._redraftT = num(obj.redraftT, 0);
    this._mourned.clear();
    const mourned = Array.isArray(obj.mourned) ? obj.mourned : [];
    for (let i = 0; i < mourned.length; i++) this._mourned.add(mourned[i]);

    if (obj.raid) {
      const r = this.raid;
      // A block with no `active` flag was only ever written for a live raid.
      r.active = obj.raid.active === undefined ? true : !!obj.raid.active;
      r.wave = num(obj.raid.wave, 0);
      r.t = num(obj.raid.t, 0);
      r.startHp = num(obj.raid.startHp, 0);
      r.routing = !!obj.raid.routing;
      r.kills = num(obj.raid.kills, 0);
      r.losses = num(obj.raid.losses, 0);
      r.buildingsLost = num(obj.raid.buildingsLost, 0);
      r.wallsLost = num(obj.raid.wallsLost, 0);
      r.spawned = num(obj.raid.spawned, 0);
      // N6: a live raid with no pre-raid count falls back to today's
      // population; a finished one keeps the figure it ended with, which is
      // the one its report shows.
      const pop0 = num(obj.raid.popAtStart, 0);
      r.popAtStart = (pop0 > 0 || !r.active) ? pop0 : this._population();
      r.draftedTotal = num(obj.raid.draftedTotal, 0);
      r.passes = (obj.raid.passes || []).slice();
      r.loot = Object.assign(Object.create(null), obj.raid.loot || {});
      r.fallen = (obj.raid.fallen || []).slice();

      const es = (r.active && Array.isArray(obj.raid.enemies)) ? obj.raid.enemies : [];
      for (let i = 0; i < es.length; i++) {
        const s = es[i];
        const def = C.ENEMY_TYPES[s.t];
        if (!def) continue;
        const e = this._pool.length > 0 ? this._pool.pop() : makeEnemy();
        e.id = s.id;
        e.typeIdx = s.t;
        e.def = def;
        e.x = s.x; e.y = s.y;
        e.hp = s.hp; e.maxHp = def.hp;
        e.speed = def.speed; e.dmg = def.dmg;
        e.range = def.range <= 1 ? CONTACT : def.range;
        e.aura = def.aura;
        e.vsBuildingsOnly = !!def.vsBuildingsOnly;
        e.targetKind = s.tk || 0;
        e.targetId = s.ti !== undefined ? s.ti : -1;
        // Re-validate the target; the building may have burned down mid-save.
        if (e.targetKind === 2 && !this._building(e.targetId)) { e.targetKind = 0; e.targetId = -1; }
        if (e.targetKind === 1 && !this._villager(e.targetId)) { e.targetKind = 0; e.targetId = -1; }
        // Resume the walk mid-path; a tile that stopped being walkable is
        // caught by the same repath that catches it in play.
        const path = Array.isArray(s.p) ? s.p : [];
        const plen = Math.min(path.length, ENEMY_PATH_CAP);
        for (let k = 0; k < plen; k++) e.path[k] = path[k] | 0;
        e.pathLen = plen;
        e.pathStep = U.clamp(num(s.ps, 0) | 0, 0, ENEMY_PATH_CAP);
        e.retargetT = num(s.rg, 0); e.repathT = num(s.rp, 0);
        e.stuckT = num(s.st, 0);
        e.lastX = num(s.lx, e.x); e.lastY = num(s.ly, e.y);
        e.hitT = num(s.ht, 0);
        e.engaged = !!s.en;
        e.routing = !!s.ro; e.routT = num(s.rt, 0);
        e.breachId = num(s.bi, -1) | 0;
        e.breachTile = num(s.bt, -1) | 0;
        if (e.breachId >= 0 && !this._building(e.breachId)) { e.breachId = -1; e.breachTile = -1; }
        e.homeX = num(s.hx, e.x); e.homeY = num(s.hy, e.y);
        e.dead = false; e.active = true;
        this.enemies.push(e);
      }
    }

    this._refreshSoldiers();
    this._soldierT = num(obj.soldierT, this._soldierT);

    const soldiers = Array.isArray(obj.soldiers) ? obj.soldiers : [];
    for (let i = 0; i < soldiers.length; i++) {
      const row = soldiers[i];
      const slot = this._soldierSlot(row[0]);
      if (slot < 0) continue;
      this.sHitT[slot] = num(row[1], 0);
      this.sTargetEnemy[slot] = num(row[2], -1) | 0;
      this.sFreeMark[slot] = num(row[3], 0) | 0;
    }

    const intents = Array.isArray(obj.intents) ? obj.intents : [];
    for (let i = 0; i < intents.length; i++) {
      const row = intents[i];
      if (this._soldierSlot(row[0]) < 0) continue;
      this.intents.set(row[0], {
        mode: row[1] === 'hold' ? 'hold' : 'intercept',
        tx: num(row[2], 0), ty: num(row[3], 0), enemyId: num(row[4], -1) | 0,
      });
    }
  }
}

export function createMilitary(game) {
  return new Military(game);
}

export default createMilitary;
