// Wildergrove's quest data + quest-progress state machine.
//
// quests.js is a pure consumer of the event bus (utils.js's createEventBus)
// and never touches inventory/world/player state directly - it only reports
// intent ("this quest just completed, hand out this reward") through the
// `onReward` callback, exactly like ui.js reports player intent through its
// own callbacks. That keeps quest logic testable without a whole game
// instance and keeps a single writer (actions.js, via the callback chain
// main.js wires up) for anything that mutates the player/inventory.
//
// Deliberately does NOT subscribe to the generic `item_added`/`item_removed`
// events for `collect` objective progress, even though the design contract
// lists item_added among the "etc." of events a quest tracker might use.
// Reason: item_added almost certainly also fires for the quest reward grant
// itself (inventory.js emits it on every addition, no matter the source), so
// listening to it here would let completing one quest immediately double-
// count toward another (or re-trigger its own just-granted reward item).
// The specific events below (`resource_harvested`, `crop_harvested`,
// `item_crafted`) already cover every source of "item enters inventory" that
// a collect objective cares about, without that feedback loop.
//
// Three objective types below extend the contract's documented set
// (`talk`/`collect`/`build`/`cook`) additively, per the contract's own
// "deviate additively" rule:
//   - `plant` ({cropId, qty}): the "till+plant 3 turnips" step is a planting
//     action, not a collect - there's no item in hand yet. Tracked off
//     `crop_planted`.
//   - `enter_mine` ({}): "find+enter the mine" doesn't fit talk/collect/
//     build/cook. Tracked off `mine_entered`.
//   - `craft` ({recipeId}): "craft a copper pickaxe" looks like a `collect`
//     of item 'pickaxe_copper' at first glance, but items.js's RECIPES
//     models tool-upgrade outputs as {item: 'pickaxe'|'axe', qty: newTier}
//     (a player.tools slot name + tier, not a real inventory item/count -
//     see items.js's RECIPES comment). Matching `collect` on that output
//     would (a) collide pickaxe_copper with pickaxe_iron, since both emit
//     item:'pickaxe', and (b) misread the tier as a quantity. Matching the
//     recipeId directly on `item_crafted` sidesteps both problems, the same
//     way `cook` already matches meal_cooked's recipeId rather than its
//     output item.
// `build` is also extended with an optional `qty` (default 1) and a nullable
// `buildingType` (any type counts) to express "place 3 buildings of your
// choosing" without a new objective type.

// --- NPCs ------------------------------------------------------------
// Elder Rin stands at the old campfire ruins in the Meadow (home base),
// a few tiles south of world.js's actual HOME_SPAWN (60, 37) - just outside
// the carved home plaza (radius 2 around HOME_SPAWN), close enough to be the
// first thing a fresh player finds on foot.
export const NPCS = [
  {
    id: 'elder_rin',
    name: 'Elder Rin',
    x: 60,
    y: 40,
    lines: [
      "Well now — a new face in Wildergrove. Can't say I expected company this side of the frost years.",
      'This valley used to hum with life — barns full, fields green clear to the tree line. Good bones under all that overgrowth, if you ask me.',
      "You'll want firewood before anything else. No supper, no light, no tools without it. Start with the trees around the meadow.",
      "Bring me back some wood and I'll walk you through getting that old fire ring burning again.",
      "Go on now. The valley's patient — it'll still be here when you're ready to start.",
    ],
  },
];

// --- Quest definitions -------------------------------------------------
// The linear tutorial chain, one prereq deep each, covering every pillar
// (talking, chopping, building, farming, mining, crafting, the mine,
// cooking), followed by a few non-chaining "Elder's Request" bounty quests
// that all unlock as soon as you've met her and never gate anything further
// - that's the intended extension point for adding more requests later.
// CONFIRMED PLAYTESTING FEEDBACK: this chain used to be strictly linear
// (each quest's prereq was the one immediately before it), which meant the
// only active quest right after planting turnips was "harvest them" -
// stuck for the ~2 in-game days they take to grow, with nothing else
// quest-directed to do, and cooking (the actual stamina-recovery tool)
// wasn't unlocked until cook_first_meal, very late in the chain. Fixed by
// branching: build_campfire now unlocks FOUR quests in parallel
// (cook_first_meal, plant_turnips, mine_stone, build_crafting_bench) rather
// than a single next step, so there's always something else to do while a
// crop grows, and cooking (achievable immediately - a Campfire Skewer only
// needs hand-gathered berries+mushroom) is available from the start of that
// wait instead of the end of it. harvest_turnips is still its own quest and
// still rewards seeds, it just no longer blocks anything downstream -
// complete it whenever the crop is actually ready. See main.js's
// getNextChainQuest for why Elder Rin's dialogue picks the first ACTIVE
// main-chain quest rather than walking a single linear thread now that
// multiple quests can be simultaneously active.
export const QUEST_DEFS = [
  {
    id: 'talk_to_elder',
    title: 'A Voice in the Overgrowth',
    description: "Someone's been tending a fire ring at the edge of the meadow. Walk up and say hello — Elder Rin doesn't bite, and she knows this valley better than anyone left alive.",
    prereq: null,
    objective: { type: 'talk', npcId: 'elder_rin' },
    reward: { items: [{ item: 'berries', qty: 3 }] },
  },
  {
    id: 'gather_firewood',
    title: 'Wood for the Winter',
    description: "Elder Rin's fire went cold seasons ago. Take your axe to the treeline and bring back 5 wood — everything you'll ever build starts with a full woodpile.",
    prereq: 'talk_to_elder',
    objective: { type: 'collect', item: 'wood', qty: 5 },
    reward: { items: [{ item: 'turnip_seed', qty: 5 }] },
  },
  {
    id: 'build_campfire',
    title: 'Light in the Ruins',
    description: "You've got the wood — now put it to use. Build a campfire on the old stone ring. It'll cook your meals and keep the dark at bay.",
    prereq: 'gather_firewood',
    objective: { type: 'build', buildingType: 'campfire', qty: 1 },
    reward: { items: [{ item: 'stone', qty: 5 }] },
  },
  {
    id: 'cook_first_meal',
    title: 'Something Warm',
    description: "That fire's not just for show. Cook any dish at all, even something simple off the campfire - a full stomach does more for you than you'd think, and you'll want the habit before long.",
    prereq: 'build_campfire',
    objective: { type: 'cook', recipeId: null },
    reward: { items: [{ item: 'mushroom', qty: 3 }] },
  },
  {
    id: 'plant_turnips',
    title: 'Turning the Soil',
    description: "A homestead needs a garden before it needs anything fancier. Till a patch of ground with your hoe and plant 3 turnips — they're forgiving, and forgiving is exactly what a beginner needs.",
    prereq: 'build_campfire',
    objective: { type: 'plant', cropId: 'turnip', qty: 3 },
    reward: { items: [{ item: 'wood', qty: 5 }] },
  },
  {
    id: 'mine_stone',
    title: 'Breaking Ground',
    description: 'The foothills are full of good stone, just waiting under a thin skin of grass. Take your pickaxe out there and bring back 5 — a forge won\'t build itself. Good work to have on hand while that garden of yours grows in.',
    prereq: 'build_campfire',
    objective: { type: 'collect', item: 'stone', qty: 5 },
    reward: { items: [{ item: 'copper_ore', qty: 3 }] },
  },
  {
    id: 'build_crafting_bench',
    title: 'A Proper Workbench',
    description: "Whittling tools in the dirt only gets you so far. Build a crafting bench and you'll finally have a place to put real tools together.",
    prereq: 'build_campfire',
    objective: { type: 'build', buildingType: 'crafting_bench', qty: 1 },
    reward: { items: [{ item: 'wood', qty: 6 }] },
  },
  {
    id: 'harvest_turnips',
    title: 'First Harvest',
    description: "Water them if you remember, don't fret if you forget a day — turnips are patient. When they're ready, pull 3 of them and see what your own two hands can grow.",
    prereq: 'plant_turnips',
    objective: { type: 'collect', item: 'turnip', qty: 3 },
    reward: { items: [{ item: 'stone', qty: 5 }, { item: 'carrot_seed', qty: 3 }] },
  },
  {
    id: 'build_forge',
    title: 'Fire and Iron',
    description: 'Stone and copper ore, stacked and lit right — that\'s a forge. Build one and the whole valley\'s ore starts to matter.',
    prereq: 'build_crafting_bench',
    objective: { type: 'build', buildingType: 'forge', qty: 1 },
    reward: { items: [{ item: 'wood', qty: 5 }, { item: 'wheat_seed', qty: 3 }] },
  },
  {
    id: 'craft_copper_pickaxe',
    title: 'A Better Edge',
    description: "Flint dulls fast and copper ore is going spare. Head to the forge and craft yourself a copper pickaxe — you'll feel the difference on the very first swing.",
    prereq: 'build_forge',
    objective: { type: 'craft', recipeId: 'pickaxe_copper' },
    reward: { items: [{ item: 'torch', qty: 2 }, { item: 'pumpkin_seed', qty: 3 }] },
  },
  {
    id: 'enter_the_mine',
    title: 'Into the Dark',
    description: "There's a cave mouth up in the Foothills, half-buried in bramble — head due east from the meadow and keep walking till the ground rises and the trees thin out. Light a torch, take your new pickaxe, and see how far down it goes.",
    prereq: 'craft_copper_pickaxe',
    objective: { type: 'enter_mine' },
    reward: { items: [{ item: 'torch', qty: 3 }] },
  },
  {
    id: 'mine_iron',
    title: 'Deep Ore',
    description: "Iron runs deeper and harder than copper — your old pick would've bounced right off it. Bring back 3 iron ore and prove the upgrade was worth it.",
    prereq: 'enter_the_mine',
    objective: { type: 'collect', item: 'iron_ore', qty: 3 },
    reward: { items: [{ item: 'iron_ore', qty: 2 }] },
  },
  {
    id: 'build_three',
    title: 'Putting Down Roots',
    description: 'A homestead is more than one fire and one bench. Place 3 more buildings — whatever you like, a fence, a chest, a bed, a bridge — and start making this valley look lived-in.',
    // Moved from prereq: 'mine_iron' per player feedback: fence/chest/
    // bridge/signpost/bed all unlock at build_forge (well before mine_iron),
    // and there's genuinely no reason to gate useful buildings like a chest
    // or bed behind a much later quest just so this one has something to
    // count - "gather the materials, build what you want" should be enough.
    // Activating this as early as build_crafting_bench instead means it's
    // already listening by the time those buildings actually unlock, so
    // nothing placed early goes uncounted (the alternative fix - checking
    // existing building count retroactively when this activates - would
    // need quests.js to read world state, which it deliberately never does).
    prereq: 'build_crafting_bench',
    objective: { type: 'build', buildingType: null, qty: 3 },
    reward: { items: [{ item: 'gem', qty: 1 }] },
  },

  // --- Elder's Request bounties (non-chaining) --------------------------
  // CONFIRMED PLAYTESTING FEEDBACK: these used to all share prereq:
  // 'talk_to_elder', so a brand-new player would see "cook a Pumpkin Soup"
  // active on day one - long before pumpkin_seed is even obtainable
  // (craft_copper_pickaxe's reward) or iron is mineable (needs a copper
  // pickaxe too, ORE_MIN_TIER.ore_iron === 2). Gated on craft_copper_pickaxe
  // instead, the same quest that grants pumpkin_seed and the tool tier iron
  // needs - by the time these appear, they're all actually actionable.
  // er_iron_hoard is the one exception to "all three share this prereq" -
  // see its own comment below for why.
  {
    id: 'er_pumpkin_soup',
    title: "Elder's Request: A Taste of Autumn",
    description: '"I haven\'t had a good pumpkin soup since before the frost years," Elder Rin says, not quite hiding the hint. Cook up a Pumpkin Soup and bring her a bowl.',
    prereq: 'craft_copper_pickaxe',
    objective: { type: 'cook', recipeId: 'pumpkin_soup' },
    reward: { items: [{ item: 'gold_ore', qty: 1 }] },
  },
  {
    id: 'er_iron_hoard',
    title: "Elder's Request: Stock for the Smithy",
    description: '"A homestead runs on iron more than anything else," says Elder Rin. Gather 10 iron ore and she\'ll see it put to good use.',
    // CONFIRMED PLAYTESTING FEEDBACK: unlike its two er_* siblings above, this
    // one deliberately does NOT share prereq: 'craft_copper_pickaxe' - that
    // would make the 10-ore bounty active before mine_iron's own 3-ore
    // intro quest (whose prereq is one step later, 'enter_the_mine'), so the
    // bigger ask showed up first and the two would double-count the same
    // iron ore against each other for as long as both stayed active. Gating
    // on mine_iron instead makes this read as a natural follow-up bounty
    // once you've already proven out iron mining, not a race with it.
    prereq: 'mine_iron',
    objective: { type: 'collect', item: 'iron_ore', qty: 10 },
    reward: { items: [{ item: 'copper_ore', qty: 5 }] },
  },
  {
    id: 'er_pumpkin_harvest',
    title: "Elder's Request: The Pumpkin Patch",
    description: '"Pumpkins take their sweet time, but they\'re worth the wait," Elder Rin says. Grow and harvest 5 pumpkins for her when you\'re able.',
    prereq: 'craft_copper_pickaxe',
    objective: { type: 'collect', item: 'pumpkin', qty: 5 },
    reward: { items: [{ item: 'wheat', qty: 5 }] },
  },
];

const QUEST_BY_ID = new Map(QUEST_DEFS.map((q) => [q.id, q]));

// Objective "how much is 100%" - unified so every objective type (including
// the single-shot talk/cook/enter_mine ones) can be driven through the same
// progress-then-check-completion code path in createQuestTracker.
function objectiveTarget(objective) {
  switch (objective.type) {
    case 'collect':
    case 'plant':
      return objective.qty;
    case 'build':
      return objective.qty || 1;
    case 'talk':
    case 'cook':
    case 'craft':
    case 'enter_mine':
    default:
      return 1;
  }
}

// A quest is active exactly when its prereq chain is satisfied and it isn't
// already completed. This is fully derived from `completed` rather than
// stored, which is what gives us "only the next unlocked chain quest is
// active" for free: every later chain quest's prereq is still unmet, and
// every bounty quest shares the same prereq (`talk_to_elder`) so they all
// unlock together and stay active independently of the chain and of each
// other.
function computeActiveDefs(completed) {
  return QUEST_DEFS.filter(
    (q) => !completed.has(q.id) && (q.prereq === null || completed.has(q.prereq)),
  );
}

// Creates a live quest tracker bound to one event bus. `callbacks.onReward`
// is invoked with a completed quest's `reward.items` array (quests.js never
// touches inventory itself); `callbacks.onQuestUpdate` fires after any
// progress or completion change so ui.js knows to re-render the quest log.
// Both are optional (a tracker with neither is inert but still queryable).
export function createQuestTracker(eventBus, { onReward, onQuestUpdate } = {}) {
  const completed = new Set();
  const progress = new Map(); // questId -> count, only for quests not yet complete

  function progressQuest(quest, delta) {
    const target = objectiveTarget(quest.objective);
    const current = Math.min(target, (progress.get(quest.id) || 0) + delta);
    progress.set(quest.id, current);
    if (current >= target) {
      completed.add(quest.id);
      progress.delete(quest.id);
      onReward?.(quest.reward.items);
    }
    onQuestUpdate?.();
  }

  // Runs `match` against every currently-active quest and progresses any hit
  // by `delta`. Kept as one helper so each event handler below is a single
  // line describing what it listens for and how it matches.
  function progressMatching(match, delta = 1) {
    for (const quest of computeActiveDefs(completed)) {
      if (match(quest.objective)) progressQuest(quest, delta);
    }
  }

  eventBus.on('npc_talked', ({ npcId }) => {
    progressMatching((o) => o.type === 'talk' && o.npcId === npcId);
  });

  eventBus.on('resource_harvested', ({ item, qty }) => {
    progressMatching((o) => o.type === 'collect' && o.item === item, qty ?? 1);
  });

  eventBus.on('crop_harvested', ({ cropId, qty }) => {
    progressMatching((o) => o.type === 'collect' && o.item === cropId, qty ?? 1);
  });

  eventBus.on('crop_planted', ({ cropId }) => {
    progressMatching((o) => o.type === 'plant' && o.cropId === cropId);
  });

  eventBus.on('building_placed', ({ type }) => {
    progressMatching((o) => o.type === 'build' && (o.buildingType == null || o.buildingType === type));
  });

  eventBus.on('item_crafted', ({ item, qty, recipeId }) => {
    // `collect` matches a real crafted item (e.g. a future torch-collecting
    // quest); `craft` matches tool-upgrade recipes by recipeId instead,
    // since their output isn't a real inventory item - see the file header.
    progressMatching((o) => o.type === 'collect' && o.item === item, qty ?? 1);
    progressMatching((o) => o.type === 'craft' && o.recipeId === recipeId);
  });

  eventBus.on('meal_cooked', ({ recipeId }) => {
    progressMatching((o) => o.type === 'cook' && (o.recipeId == null || o.recipeId === recipeId));
  });

  eventBus.on('mine_entered', () => {
    progressMatching((o) => o.type === 'enter_mine');
  });

  return {
    // Active quests annotated with live progress, for ui.js's quest log and
    // any HUD "current objective" readout. Each entry is the quest def
    // spread with `count`/`target` added - ui.js formats the human-readable
    // progress line itself (it already owns ITEMS/BUILDING_DEFS/
    // COOKING_RECIPES lookups for name display; quests.js stays free of
    // those imports).
    getActiveQuests() {
      return computeActiveDefs(completed).map((q) => ({
        ...q,
        count: progress.get(q.id) || 0,
        target: objectiveTarget(q.objective),
      }));
    },

    getCompletedQuests() {
      return QUEST_DEFS.filter((q) => completed.has(q.id));
    },

    isCompleted(id) {
      return completed.has(id);
    },

    // Serializable snapshot for main.js's save/load. Active-quest state is
    // intentionally not stored - it's re-derived from `completed` on load,
    // same as during play.
    serialize() {
      return {
        completed: Array.from(completed),
        progress: Object.fromEntries(progress),
      };
    },

    deserialize(data) {
      completed.clear();
      for (const id of data?.completed ?? []) {
        if (QUEST_BY_ID.has(id)) completed.add(id);
      }
      progress.clear();
      for (const [id, count] of Object.entries(data?.progress ?? {})) {
        if (QUEST_BY_ID.has(id) && typeof count === 'number') progress.set(id, count);
      }
      onQuestUpdate?.();
    },
  };
}
