# Hearthmere — Design Contract (FROZEN)

> This document is the single source of truth. Multiple agents build different
> files in parallel against it. **If your code disagrees with this document,
> your code is wrong.** If the document is genuinely self-contradictory or
> impossible, STOP and report it — do not silently "fix" it by inventing a
> different rule, because another agent is building the other side of that seam.

---

## 1. Vision

**Hearthmere** is an isometric medieval town builder. You settle a valley
around a cold lake, grow a hamlet into a city, and hold it against raiders who
come down out of the passes every couple of weeks, forever.

Tagline: *Feed the valley. Hold the passes.*

### The three pillars

1. **Every villager is a real person on the map.** Nothing teleports. A loaf
   of bread exists as grain in a field, is carried by a named villager down a
   road to a mill, then to a bakery, then to a granary, then to a market, then
   into a house. If the road is missing, you watch the system break, and you
   can see *where*.
2. **Variety is nutrition.** Ten thousand loaves of bread will keep a town
   alive and sickly. A town that eats bread, fish, cheese, apples, honey and
   mutton is *healthy* — and healthy towns grow, work faster and fight better.
   Food is never one number.
3. **Peace is preparation.** Raids resolve themselves. You never micro a
   battle. You win the battle in the fifteen days before it, by where you put
   the walls, how well you fed the garrison and whether the armoury had steel
   in it.

### Priority order (enforced — earlier beats later, always)

1. **Never soft-lock.** There is always a legal, affordable action that
   improves the situation. See §16.
2. **Legibility.** The player must always be able to answer "why is this not
   working?" in under ten seconds, from the UI, without guessing. Every idle
   building states its reason.
3. **The simulation is honest.** No fake numbers. If the HUD says 40 bread,
   forty loaves exist somewhere on the map and can be pointed at.
4. **Pressure.** Idle play must degrade. Winters bite, raids escalate.
5. **Prettiness.** Last. A beautiful unreadable town is a failure.

### Art direction

**Painted-dusk isometric.** Not pixel art, not flat vector — soft gouache. The
ground is painted in muted sage/ochre/slate, each terrain type as a *slightly
irregular* diamond (jitter the diamond's corner points by a per-tile seeded
±1.5px so the ground never reads as a perfect lattice). Buildings are drawn
as three canvas faces (top, left, right) with a hand-mixed palette — the left
face 12% darker than the top, the right face 22% darker — plus a roof, a
chimney or a sign, and a **warm window glow at night**. Everything is
procedural canvas paths; there are no image assets in this repo and you must
not add any.

The technique to use for terrain edges is **per-tile blend masks**: where two
terrain types meet, draw the lower-priority type's diamond first, then the
higher-priority type's diamond clipped to a seeded ragged edge, so shorelines
and forest edges are organic rather than staircased. Priority order (low to
high): water < sand < grass < meadow < forest < rock.

Villagers are 5px-wide two-tone figures (tunic colour by role, skin dot,
2px shadow ellipse). They must be individually trackable with the eye across
a road at zoom 1. Readability of **road connectivity** and **raid direction**
outranks prettiness.

---

## 2. Platform contract (non-negotiable, matches this repo)

- Native **ES modules**, plain **canvas 2D**. **No p5, no libraries, no build
  step, no TypeScript, no bundler.**
- Entry point is `static/hearthmere/main.js`, loaded by
  `static/shared/appinit.js` via dynamic `import()` when the user visits
  `/games/hearthmere/main`.
- `main.js` **injects its own stylesheet and canvas** into the page — the
  served HTML shell has an essentially empty `<body>`. Follow the pattern in
  `static/railwright/main.js` and `static/driftworks/main.js`.
- The registered path does not start with `p5/`, so **p5.js is NOT injected**.
  Never reference p5 globals (`fill`, `rect`, `createCanvas`, `random`, `map`,
  `dist`, `lerp`, `PI`, …). Use `Math.*` and your own helpers in `utils.js`.
- All files must pass, with **zero errors**:
  `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null && npx eslint static/hearthmere`
  (`sourceType: module`; `no-undef` is off, but unused vars, unreachable code,
  duplicate keys, empty blocks etc. are errors). `static/hearthmere/**/*.js`
  must be added to `modulePatterns` in `eslint.config.js`.
- Node for any test harness: **Node 22** (`source ~/.nvm/nvm.sh && nvm use 22`).
  The shell default is Node 12 and will fail on modern syntax.
- Target **60fps at 200 villagers and 120 buildings** on a laptop. Hot loops
  must not allocate. No `Array.prototype.filter`/`map` inside per-tick
  per-villager code — index loops only.
- Persistence: `localStorage`, keys `hearthmere_save` and `hearthmere_seen_intro`.

### Files and ownership (exactly one owning agent per file in round 1)

| File | Owns |
|---|---|
| `constants.js` | Every shared constant, enum, terrain def, item def, food def, building def, equipment def, raid def, tier def. **Data only, no logic** (pure helper lookups like `BUILDING_BY_ID` are fine). |
| `utils.js` | Pure helpers + `EventBus` + seeded RNG + iso projection maths + `MinHeap`. **No game state.** |
| `world.js` | Terrain generation, tile array, resource nodes, occupancy, clock/seasons, weather. |
| `paths.js` | Road/path tiles, walkability, A* pathfinding, road-connectivity queries, region flood-fill. |
| `buildings.js` | Building instances, placement validation, construction sites, worker slots, production recipes, per-building inventories. |
| `villagers.js` | Villager agents, movement along paths, the per-villager state machine, job execution, hauling. |
| `economy.js` | Global resource accounting, the haul-task queue, food/nutrition/health/happiness, population growth, town tier, upkeep. |
| `military.js` | Soldiers, equipment tiers, raid scheduling, enemy units, combat resolution, towers and walls. |
| `render.js` | All canvas drawing. **Reads state, never mutates it.** |
| `particles.js` | Smoke, sparks, dust, coin/food pops, arrows, blood, snow, birds. |
| `input.js` | Camera pan/zoom, screen↔tile maths, active tool, drag state, selection. |
| `ui.js` | DOM overlay: HUD, build menu, panels, inspector, toasts, dialogs. |
| `hearthmere.css` | Styling for the DOM overlay only. |
| `main.js` | Bootstrap, game loop, state machine, save/load, module wiring. |

**Hard rule: `render.js`, `particles.js` and `ui.js` never mutate simulation
state.** They read it, and they emit events or call documented command methods
on other modules. Anything else is a bug, even if it works.

**Hard rule: only the owning module mutates its own data.** `villagers.js` does
not write `b.inv` directly — it calls `buildings.add()`. `economy.js` does not
move a villager — it creates a task.

---

## 3. Coordinates, projection, grid, time

```js
GRID_W = 72; GRID_H = 72;      // tiles
TILE_W = 64; TILE_H = 32;      // full iso diamond, px, at zoom 1
MIN_ZOOM = 0.35; MAX_ZOOM = 2.4;
```

- A tile index is `idx = y * GRID_W + x`. Use `idx` in all hot paths and stored
  structures; `{x, y}` only at API edges.
  `utils.toIdx(x, y)` / `utils.toX(idx)` / `utils.toY(idx)`.
- Villager positions are **float tile coordinates** `(vx, vy)`, where
  `(0.5, 0.5)` is the centre of tile `(0,0)`.

### Isometric projection (FROZEN — every module must use `utils`, never reimplement)

```js
// tile space -> iso "world pixel" space
utils.isoX(tx, ty) => (tx - ty) * (TILE_W / 2)
utils.isoY(tx, ty) => (tx + ty) * (TILE_H / 2)

// iso world pixel space -> tile space (returns float tile coords)
utils.unIsoX(wx, wy) => (wy / (TILE_H / 2) + wx / (TILE_W / 2)) / 2
utils.unIsoY(wx, wy) => (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2
```

Camera is `{ x, y, zoom }` in iso world pixel space, `x`/`y` being the point at
the centre of the canvas. Screen conversion lives in `input.js`:

```js
screen = (world - cam) * zoom + canvasSize/2
```

**Draw order is painter's algorithm on `tx + ty` ascending**, and within an
equal `tx + ty`, on `tx` ascending. A multi-tile building sorts by the
`tx + ty` of its **maximum** corner (its south corner), so it correctly
occludes everything behind it.

### Directions

8-way, indices `0..7` starting East, going clockwise in *tile* space:

```js
// 0:E 1:SE 2:S 3:SW 4:W 5:NW 6:N 7:NE
DIR_DX = [ 1, 1, 0,-1,-1,-1, 0, 1];
DIR_DY = [ 0, 1, 1, 1, 0,-1,-1,-1];
OPPOSITE = [4,5,6,7,0,1,2,3];
```

Diagonal steps cost `Math.SQRT2`, orthogonal cost `1`.

### Clock

- One in-game **day** = `DAY_SECONDS = 60` real seconds at 1× speed.
- Game speeds: `0 (paused), 1, 2, 3`. `dt` handed to `update(dt)` is already
  multiplied by speed and **clamped to 0.25 game-seconds max per frame**.
- `world.clock = { day, timeOfDay, season, year }`. `day` starts at 1,
  `timeOfDay` is `0..1` (0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk).
- A **season** is `SEASON_DAYS = 12` days. `season` is `0 Spring, 1 Summer,
  2 Autumn, 3 Winter`. A year is 48 days. Day 1 starts in Spring.
- Day rollover emits `day:ended {day}` **exactly once**, before any module's
  daily processing. `season:changed {season, year}` fires immediately after.
- Villagers sleep between `timeOfDay > 0.88` and `timeOfDay < 0.22` — they walk
  home and buildings idle. Work happens in daylight. **Exception:** haulers
  finish the task in hand before going home, and soldiers never sleep during a
  raid.

---

## 4. Items

Two disjoint classes: **goods** and **foods**. `ITEMS[id] = { id, name, class,
category, icon, stackWeight, tier }` where `class` is `'good' | 'food'`.

### Goods

| id | name | made by | from |
|---|---|---|---|
| `wood` | Timber | Woodcutter | forest tiles |
| `plank` | Planks | Sawmill | 2 wood |
| `stone` | Stone | Quarry | rock tiles |
| `clay` | Clay | Clay Pit | clay tiles |
| `brick` | Bricks | Kiln | 2 clay + 1 charcoal |
| `charcoal` | Charcoal | Charcoal Burner | 3 wood |
| `iron_ore` | Iron Ore | Iron Mine | ore tiles |
| `iron` | Iron | Bloomery | 2 iron_ore + 1 charcoal |
| `steel` | Steel | Foundry | 2 iron + 2 charcoal |
| `tools` | Tools | Blacksmith | 1 iron + 1 plank |
| `wool` | Wool | Sheep Pasture | — |
| `cloth` | Cloth | Weaver | 2 wool |
| `hide` | Hides | Hunter's Lodge (byproduct) | — |
| `leather` | Leather | Tannery | 2 hide |
| `herbs` | Herbs | Herbalist | meadow/forest tiles |
| `medicine` | Medicine | Apothecary | 2 herbs + 1 ale |
| `candle` | Candles | Chandler | 1 honey + 1 cloth |
| `coin` | Coin | Trading Post / taxes | — (see §9.7) |

### Weapons & armour (goods, `category: 'arms'`)

| id | name | made by | from | tier |
|---|---|---|---|---|
| `spear` | Spear | Weaponsmith | 1 plank + 1 iron | 1 |
| `sword` | Sword | Weaponsmith | 2 iron | 2 |
| `crossbow` | Crossbow | Crossbow Range | 2 plank + 1 iron + 1 cloth | 3 |
| `halberd` | Halberd | Weaponsmith | 1 plank + 2 steel | 4 |
| `gambeson` | Gambeson | Armourer | 2 cloth | 1 |
| `leather_armour` | Leather Armour | Armourer | 2 leather | 2 |
| `mail` | Mail Hauberk | Armourer | 3 iron | 3 |
| `plate` | Plate Harness | Plate Armoury | 3 steel + 1 leather | 4 |
| `shield` | Shield | Armourer | 1 plank + 1 leather | 2 |

### Foods

Every food has a `foodGroup`. **Nutrition is scored on groups AND on distinct
items** (§9.4), so both breadth and depth matter.

| id | name | group | made by | from |
|---|---|---|---|---|
| `berries` | Berries | `produce` | Forager's Hut | berry tiles |
| `mushrooms` | Mushrooms | `produce` | Forager's Hut | forest tiles |
| `cabbage` | Cabbage | `produce` | Vegetable Garden | — |
| `carrots` | Carrots | `produce` | Vegetable Garden | — |
| `apples` | Apples | `produce` | Orchard | — |
| `grain` | Grain | `grain` | Wheat Farm | — (raw, edible but poor) |
| `flour` | Flour | `grain` | Windmill | 2 grain |
| `bread` | Bread | `grain` | Bakery | 2 flour |
| `fish` | Fish | `fish` | Fisherman's Hut | shore tiles |
| `smoked_fish` | Smoked Fish | `fish` | Smokehouse | 2 fish + 1 charcoal |
| `venison` | Venison | `meat` | Hunter's Lodge | forest tiles |
| `mutton` | Mutton | `meat` | Sheep Pasture | — |
| `pork` | Pork | `meat` | Pig Farm | 1 grain |
| `eggs` | Eggs | `dairy` | Chicken Coop | 1 grain |
| `milk` | Milk | `dairy` | Dairy Farm | — |
| `cheese` | Cheese | `dairy` | Cheesemaker | 2 milk |
| `honey` | Honey | `sweet` | Apiary | — |
| `ale` | Ale | `sweet` | Brewery | 2 grain |

Food groups: `grain`, `meat`, `fish`, `produce`, `dairy`, `sweet` — **six**.

`ITEMS[id].nutrition` is how many "food units" one item of it feeds:

```
grain 0.6, flour 0.8, bread 1.6, berries 0.6, mushrooms 0.6, cabbage 0.9,
carrots 0.9, apples 0.8, fish 1.0, smoked_fish 1.6, venison 1.4, mutton 1.3,
pork 1.4, eggs 0.7, milk 0.7, cheese 1.5, honey 0.9, ale 0.8
```

Raw `grain`, `flour` and `milk` are edible but deliberately inefficient — the
processing chains are worth building.

---

## 5. World (`world.js`)

### Terrain

`TERRAIN = { WATER:0, SHORE:1, SAND:2, GRASS:3, MEADOW:4, FOREST:5, ROCK:6, MOUNTAIN:7 }`

- `WATER` — impassable, buildable only by bridge/pier. Fishable from adjacent.
- `SHORE` — shallow water, impassable, this is what fishermen fish.
- `SAND` — walkable, buildable, farm yield ×0.5.
- `GRASS` — walkable, buildable, farm yield ×1.0.
- `MEADOW` — walkable, buildable, farm yield ×1.5, herb source.
- `FOREST` — walkable (0.7× speed), **buildable only after clearing**, wood
  source, venison/mushroom source.
- `ROCK` — walkable, not buildable except mines/quarries, stone/ore/clay source.
- `MOUNTAIN` — impassable, not buildable. Forms the valley walls.

### Tile record

Stored as parallel typed arrays for speed, not objects:

```js
world.terrain   = Uint8Array(GRID_W * GRID_H)   // TERRAIN enum
world.resource  = Uint8Array(GRID_W * GRID_H)   // RESOURCE enum, 0 = none
world.amount    = Uint16Array(GRID_W * GRID_H)  // remaining units in the node
world.building  = Int32Array(GRID_W * GRID_H)   // building id occupying, -1 = none
world.road      = Uint8Array(GRID_W * GRID_H)   // 0 none, 1 dirt path, 2 cobbled road
world.fertility = Uint8Array(GRID_W * GRID_H)   // 0..255, farm yield multiplier
world.elev      = Uint8Array(GRID_W * GRID_H)   // 0..4, cosmetic only (render lifts the diamond by elev*4px)
```

`RESOURCE = { NONE:0, TREE:1, STONE:2, IRON:3, CLAY:4, BERRY:5, HERB:6, FISH:7, GAME:8 }`

- `TREE` starts at 40 units, **regrows** 1 unit/day if the tile still has ≥1.
  A tile at 0 units turns `FOREST` → `GRASS` and clears the resource.
- `BERRY` starts at 30, regrows 3/day in Spring/Summer, 1/day Autumn, 0 Winter,
  caps at 30.
- `GAME` (deer) is a per-tile abstraction that regrows 2/day up to 25.
- `HERB` starts at 25, regrows 2/day up to 25.
- `STONE` 400, `IRON` 250, `CLAY` 300 — finite, no regrowth. When a node hits 0
  the building serving it must report `'resource exhausted'` as its idle reason
  and the player relocates. Enough nodes must be generated that this is a
  *relocation* prompt, not a death sentence (§16).
- `FISH` on `SHORE` tiles, 60 units, regrows 4/day up to 60.

### Generation

Seeded (`world.seed`, a uint32; default `Date.now() >>> 0`, overridable by the
`?seed=` query param for reproducible QA).

1. Value-noise heightmap (4 octaves) → `MOUNTAIN` ring around the map edge at
   roughly 4–8 tiles thick, with **three gaps ("passes")** at pseudo-random
   edge positions. Raids enter through the passes (§10.4).
2. A lake of 90–200 contiguous tiles placed off-centre; `WATER` core ringed by
   `SHORE`, ringed by `SAND`.
3. Forest clumps covering 22–30% of the walkable interior.
4. `MEADOW` patches (12–18% of walkable interior), preferentially near water.
5. Rock outcrops: 5–8 clusters carrying `STONE`, 3–5 carrying `IRON`, 3–4
   carrying `CLAY`. **Guarantee at least one STONE and one CLAY cluster within
   18 tiles of the start position, and at least one IRON cluster within 30.**
6. `BERRY`, `HERB`, `GAME` scattered.
7. Start position: the flattest buildable 8×8 region nearest the lake shore,
   at least 12 tiles from any pass. `world.start = {x, y}`.

**Generation must be validated before being handed back.** `world.validate()`
returns `{ok, reason}` and `world.generate()` retries up to 12 seeds until
`ok`. It must check: start area ≥ 60 buildable tiles; ≥ 400 tree units, ≥ 300
stone units, ≥ 200 clay, ≥ 200 iron, ≥ 6 shore tiles, all reachable by land
from the start (flood fill); at least 2 passes exist.

### Weather & season effects

`world.weather = { snow: 0..1, rain: 0..1 }` — cosmetic + one rule: farms
produce **nothing** in Winter (`season === 3`). Orchards and gardens produce
nothing in Winter. Foraging and fishing are halved in Winter. Hunting is
unaffected. Pastures are halved.

### Public API

```js
world.generate(seed)                  // builds everything, validates, retries
world.update(dt, game)                // clock, regrowth on day rollover, weather
world.tileAt(x, y) -> idx | -1        // -1 if out of bounds
world.inBounds(x, y) -> bool
world.isBuildable(idx) -> bool        // terrain buildable, no building, no road
world.isWalkable(idx) -> bool         // terrain walkable and no *solid* building
world.moveCost(idx) -> number         // 1 / speed multiplier for that tile
world.clearForest(idx)                // FOREST -> GRASS, drops the tree resource
world.harvest(idx, amount) -> got     // decrements world.amount, handles depletion
world.findResourceNear(x, y, resKind, radius) -> idx | -1   // nearest, not any
world.serialize() / world.restore(obj)
```

---

## 6. Paths & movement (`paths.js`)

### Roads

- `ROAD_NONE=0`, `ROAD_DIRT=1` (costs 1 wood per tile), `ROAD_COBBLE=2`
  (costs 1 stone per tile, upgrades a dirt tile in place).
- Roads may be laid on any walkable, unbuilt tile, including `FOREST`
  (auto-clears it) and `ROCK`.
- Roads are **removable** for no refund.

### Movement rule (FROZEN — this is the road/soft-lock compromise)

Villagers may walk on **any** walkable tile, but speed is:

```
ROAD_COBBLE : 1.55 tiles/sec
ROAD_DIRT   : 1.15 tiles/sec
open ground : 0.50 tiles/sec      (GRASS/MEADOW/SAND)
FOREST      : 0.35 tiles/sec
ROCK        : 0.40 tiles/sec
```

So off-road travel always *works* but is ~3× slower. This makes roads the
central optimisation problem without ever creating an unreachable state.

**However**, a building only *functions* if at least one tile orthogonally
adjacent to its footprint is a road (`world.road > 0`). An unconnected
building shows idle reason `'no road'` and produces nothing. This is the rule
that forces the player to build a road network; it is checked by
`paths.isConnected(building)` and cached, invalidated on any road change.

### Pathfinding

```js
paths.find(fromIdx, toIdx, opts) -> { tiles: Int32Array, cost: number } | null
```

- A* over 8-way neighbours, cost = `world.moveCost(idx)` × step length, with an
  octile-distance heuristic. Diagonal moves are forbidden if **both** orthogonal
  neighbours are blocked (no corner-cutting through building corners).
- Must use `utils.MinHeap`. Must not allocate per-node objects — use flat
  arrays sized `GRID_W*GRID_H`, reused across calls, with a generation stamp
  instead of clearing.
- **Budget: at most `PATH_NODE_BUDGET = 4000` expansions per call.** Over
  budget returns `null`, and the caller falls back to `paths.findGreedy()`
  (straight-line stepping that ignores cost but respects walkability).
- `paths.findMulti(fromIdx, targetIdxArray)` — one Dijkstra to the nearest of
  several targets, for "nearest granary" style queries. Use this rather than N
  separate A* calls.
- **Call budget: `paths` must serve at most `PATH_CALLS_PER_TICK = 40` full A*
  calls per tick.** Requests beyond that are queued and served next tick;
  `paths.request(from, to, cb)` is the async form used by `villagers.js`. A
  villager waiting on a queued path stays in its current state and does not
  block the tick.
- `paths.regionOf(idx)` — flood-fill region id, recomputed lazily when terrain
  or solid buildings change. Used to reject impossible tasks instantly.

---

## 7. Buildings (`buildings.js`)

### Definition shape (`constants.js` owns the data)

```js
{
  id: 'bakery',
  name: 'Bakery',
  cat: 'food',                 // 'housing'|'gather'|'food'|'industry'|'military'|'civic'|'infra'
  tier: 2,                     // town tier required to unlock
  w: 2, h: 2,                  // footprint in tiles
  cost: { plank: 8, brick: 6 },
  buildTime: 18,               // builder-seconds of work after materials land
  jobs: 2,                     // worker slots (0 = no workers)
  role: 'baker',               // villager role string for tinting + UI
  // production:
  recipe: { in: { flour: 2 }, out: { bread: 1 }, time: 9 },   // work-seconds per batch
  // OR gathering:
  gathers: { resource: RESOURCE.TREE, item: 'wood', radius: 8, time: 6, yield: 1 },
  // OR passive:
  houses: 6,                   // housing capacity
  storage: { classes: ['food'], cap: 300 },   // storage building
  needsTerrain: 'shore',       // placement requirement, see below
  needsResource: RESOURCE.IRON,
  inputCap: 12, outputCap: 12, // per-item buffer caps, default 12
  upkeep: { coin: 0.2 },       // per day
  happiness: { radius: 10, amount: 8 },  // civic radiance
  desc: 'Bakes flour into bread. Bread is the backbone of a big town.',
}
```

### Placement rules

`buildings.canPlace(defId, x, y) -> { ok: bool, reason: string }`

Checks in this exact order, returning the first failure (the reason string is
shown to the player, so it must be specific and human):

1. `'locked'` — `def.tier > economy.tier`.
2. `'out of bounds'`
3. `'blocked'` — any footprint tile not `world.isBuildable`.
4. `'needs flat ground'` — footprint spans >1 distinct `world.elev` value.
5. `'needs <terrain>'` — `def.needsTerrain` unmet (`'shore'` = at least one
   footprint-adjacent `SHORE` tile; `'water'`, `'rock'`, `'meadow'` similar).
6. `'no <resource> nearby'` — `def.needsResource` has no node within
   `def.gathers.radius` (or 10 if unspecified).
7. `'not enough <item>'` — global available stock < cost. **Checked against
   `economy.available(item)`, which excludes stock already reserved by other
   construction sites.**
8. `'too close to a wall'` — nothing may be placed on a wall tile.

Placement does NOT require a road — but a freshly placed building with no road
adjacency immediately shows the `'no road'` warning, which is the teaching
moment.

### Construction

Placing a building creates a **construction site** — a real building instance
with `b.built = false`:

1. `cost` is immediately **reserved** in `economy` (not deducted) so two
   simultaneous sites can't both spend the same plank.
2. The site posts haul tasks for each required item (§9.3). Builders idle until
   materials arrive.
3. Once `b.delivered` satisfies `cost`, the reservation is consumed, and
   builders (villagers with role `builder`, from Builder's Hut) walk to the site
   and add `dt × BUILD_RATE × healthFactor` to `b.progress` until
   `progress >= def.buildTime`.
4. `b.built = true`, emit `building:completed`.
5. **Cancelling a site refunds everything already delivered** into the nearest
   storage (or, if none has room, onto the global pool — never destroy it).

If no Builder's Hut exists, **the first 3 buildings of a new game auto-complete
instantly** (the tutorial grace, see §16), and after that any *unemployed*
villager can act as a builder at 0.6× rate. This guarantees the player can
never be stuck with no way to build.

### Building instance

```js
{
  id, defId, x, y, w, h,          // x,y = north (top) corner of the footprint
  built: false, progress: 0,
  delivered: {},                  // item -> qty delivered to the site
  inv: {},                        // item -> qty (input buffer + output buffer, one map)
  workers: [],                    // villager ids, length <= def.jobs
  active: true,                   // player toggle (pause a building)
  hp: 100, maxHp: 100,
  workProgress: 0,                // seconds accumulated toward the current batch
  idleReason: '',                 // '' when working; else the exact human reason
  connected: false,               // cached paths.isConnected
  doorIdx: -1,                    // the tile villagers path to; see below
  level: 1,                       // for upgradeable buildings
  producedTotal: 0, lastProduced: 0,
}
```

`doorIdx` is the road-adjacent footprint-adjacent tile with the lowest
`(tx+ty)`; if none, the footprint tile with the lowest `(tx+ty)`. Villagers
path to `doorIdx`, never into the footprint.

### Inventory API (only these mutate `b.inv`)

```js
buildings.capacityFor(b, item) -> int    // remaining room for that item
buildings.add(b, item, qty) -> added     // clamps to capacity, returns what fit
buildings.take(b, item, qty) -> taken    // clamps to stock
buildings.has(b, item, qty) -> bool
buildings.outputs(b) -> array of item ids this building wants hauled away
buildings.wants(b) -> array of {item, qty} this building wants hauled in
```

### Idle reasons (FROZEN strings — the UI and QA both key off these)

`'no road'`, `'no workers'`, `'no materials: <item>'`, `'output full'`,
`'resource exhausted'`, `'out of season'`, `'paused'`, `'night'`,
`'under construction'`, `'no storage'`, `''` (working).

*Amended by ADDENDUM G3:* `'no storage'` is parameterised as
`'no storage: <class>'`. *Amended by ADDENDUM N2.3:* `'cut off'` is added —
`'no road'` means no road touches the building; `'cut off'` means it has a road
but no route back to the town centre. Telling a player to lay a road they have
already laid is a §16.8 violation, which is why these are two reasons and not
one.

### Work loop (per building, per tick, only if `built && active && connected`)

1. If `def.jobs > 0` and `workers.length === 0` → `'no workers'`, stop.
2. Gatherers: each worker independently walks to the nearest matching resource
   node within `radius`, harvests for `time` seconds, returns to `doorIdx`,
   `buildings.add(b, item, yield)`. Node exhausted within radius →
   `'resource exhausted'`.
3. Producers: if `inv` has all of `recipe.in` and there is room for
   `recipe.out`, accumulate `workProgress += dt × workerCount × healthFactor`.
   On `workProgress >= recipe.time`, consume inputs, add outputs, emit
   `building:produced {id, item, qty}`, reset. Missing input →
   `'no materials: <item>'`. No room → `'output full'`.

`healthFactor = 0.5 + 0.5 × (townHealth / 100)` — a sick town is a slow town.

---

## 8. Villagers (`villagers.js`)

### The agent

```js
{
  id, name,                       // name from a seeded medieval name table
  vx, vy,                         // float tile position
  homeId: -1, jobId: -1,
  role: 'idler',                  // matches the job building's def.role, or 'idler'/'builder'/'porter'/'soldier'
  state: VS.IDLE,
  path: null, pathStep: 0,        // Int32Array of tile indices
  target: -1,                     // destination tile idx
  carry: { item: '', qty: 0 },
  task: null,                     // the claimed haul task, or null
  age: 18, hunger: 0, health: 70, // hunger 0..1, 1 = starving
  timer: 0,                       // generic state timer
  dead: false,
}
```

`VS = { IDLE, WALK, WORK, HAUL_PICKUP, HAUL_DROP, GO_HOME, SLEEP, GO_EAT, FLEE, FIGHT, LEAVING }`

### Population cap

`MAX_VILLAGERS = 220`. Beyond that, births stop and the UI reports
`'the valley is full'`. This is a performance ceiling and is deliberate.

### Per-tick update (index loop, no allocation)

Villagers update on a **round-robin schedule**: each tick, only
`ceil(n / VILLAGER_TICK_SPLIT)` villagers run their *decision* logic
(`VILLAGER_TICK_SPLIT = 3`), but **all** villagers move every tick.
Movement must be frame-rate independent.

Movement: walk along `path` toward `path[pathStep]`'s tile centre at
`speedFor(tile) × (0.7 + 0.3 × health/100)` tiles/sec. On arrival at the last
step, clear `path` and dispatch on `state`.

### Decision priority (evaluated top-down; first match wins)

1. `dead` → removed by `economy` at end of tick.
2. Raid active and villager is not a soldier and an enemy is within
   `FLEE_RADIUS = 6` tiles → `FLEE` toward the nearest house/keep.
3. `hunger > 0.55` and food is available → `GO_EAT` (walk to nearest market,
   else nearest granary with food; eat, `hunger -= 0.6`).
4. Night (`timeOfDay > 0.88 || < 0.22`) and not mid-haul → `GO_HOME` → `SLEEP`.
5. Has a claimed `task` → execute it (`HAUL_PICKUP` → `HAUL_DROP`).
6. `jobId >= 0` → `WALK` to the job's `doorIdx`, then `WORK` (the building's
   work loop in §7 drives production; the villager just needs to be present —
   gatherers additionally walk out to nodes and back).
7. Unemployed and there are open haul tasks → claim one (porters get first
   refusal; see §9.3).
8. Unemployed and there is an unfinished construction site → act as a builder
   at 0.6× rate.
9. Otherwise `IDLE` — wander within 4 tiles of home, or the town centre.

### Job assignment

`villagers.assignJobs()` runs on `day:ended` and whenever a building completes
or is destroyed. It fills worker slots by **building priority** (player-set,
`b.priority` 0..2, default 1; higher first), then by shortest walk from the
villager's home. Villagers already employed are not reshuffled unless their
building was destroyed or its priority dropped. **A villager with no home is
still employable.** Job changes are cheap; do not emit events per villager.

`villagers.forcedConscript(n)` — the emergency draft (§10.6) converts up to `n`
non-soldier adults to militia and returns the count.

### Names & flavour

Seeded name table: 60 given names × 30 bynames (`'Alder Fenwick'`). Names must
be stable across a save/load round-trip.

---

## 9. Economy (`economy.js`)

### 9.1 Global accounting

```js
economy.stock(item) -> int       // sum over all storage buildings AND all building buffers AND villager carry
economy.stored(item) -> int      // sum over storage buildings only
economy.available(item) -> int   // economy.stock(item) - economy.reserved(item)
economy.reserved(item) -> int    // reserved by unfinished construction sites
```

`stock()` is called by the HUD every frame — it must be **cached**, recomputed
at most once per tick into `economy.totals` (a plain object), not walked per
call.

### 9.2 Storage

- Storage buildings declare `storage: { classes: ['food'|'good'|'arms'], cap }`.
  `cap` is a **total unit count**, not per item.
- A Granary takes `food`; a Stockpile takes `good`; a Warehouse takes both; an
  Armoury takes `arms` only.
- **If there is no storage with room for an item class, producers fill their
  output buffer and then stall with `'no storage'`.** This is intentional
  pressure, and the UI must warn loudly (§13) before it happens.

### 9.3 The haul-task queue (the spine of the game)

`economy.tasks` is an array of:

```js
{ id, item, qty, fromId, toId, claimedBy: -1, kind: 'supply'|'store'|'build' }
```

Regenerated (not rebuilt from scratch — *reconciled*) every
`TASK_REBUILD_INTERVAL = 1.0` game-seconds by `economy.rebuildTasks(game)`:

1. **build** — for each unfinished site, for each item still short, if
   `economy.stored(item) > 0`, create a task from the nearest storage with that
   item. **Highest priority.**
2. **supply** — for each active building whose `wants()` is unmet and where a
   storage holds the item, create a task. Middle priority.
3. **store** — for each building whose output buffer is ≥ 50% full, create a
   task to the nearest storage with room. Lowest priority.

Rules that prevent the classic bugs here:
- A task is only created if `paths.regionOf(from) === paths.regionOf(to)`.
- At most **one open task per (fromId, toId, item)** triple.
- `qty` is capped by the carrier capacity `CARRY_CAP = 8` and by what the
  source actually holds *minus what other open tasks already claim from it*.
- On claim, the source's stock is **soft-reserved** so two porters do not both
  walk to the same 3 planks.
- A task whose source or destination is destroyed, or whose claimant dies, is
  **cancelled and any carried goods are dropped into the nearest storage**
  (never vanished).
- A task not completed within `TASK_TIMEOUT = 120` game-seconds is cancelled
  and the claimant is freed. Log it to `economy.debug.timeouts` — QA reads this.

Porters come from storage buildings (`role: 'porter'`, Stockpile/Granary/
Warehouse have `jobs`). Unemployed villagers take leftover tasks.

### 9.4 Food, nutrition and health

Consumption, applied continuously (not once a day, so the HUD moves):

```
foodNeededPerDay = population × FOOD_PER_DAY × seasonMult
FOOD_PER_DAY = 1.0
seasonMult   = 1.25 in Winter, else 1.0
```

Villagers eat by walking to a market/granary (§8), which removes
`nutrition`-weighted food units from that building. **The eating villager
chooses the food the town has most of among the groups they have eaten least
recently** — this makes variety emerge from behaviour, not from a global rule.

`economy.nutrition` is recomputed on `day:ended`:

```js
distinctItems = # of food items with stored(item) >= 4
distinctGroups = # of the 6 food groups with any item at stored >= 4
varietyScore = min(100, distinctGroups * 11 + distinctItems * 2.2)   // 6 groups + 12 items ~= 92
```

```js
healthTarget = 22
             + varietyScore * 0.62                       // 0..62
             + (hasApothecaryInRange ? 8 : 0)
             + (aleStored >= population*0.2 ? 5 : 0)
             - (starvingDays > 0 ? 25 + starvingDays * 6 : 0)
             - (season === WINTER && woodStored < population*0.4 ? 12 : 0)
             - (recentPlagueDays > 0 ? 15 : 0)
townHealth += (healthTarget - townHealth) * 0.25   // per day, so ~4 days to settle
```

`townHealth` is clamped `0..100`. Individual villager health drifts toward
`townHealth` ± their own hunger penalty. Health drives:
- `healthFactor` on all production (§7),
- birth rate (§9.5),
- soldier combat power (§10.5),
- death rate: below 25, `(25 - health) / 900` chance per villager per day of
  death from illness.

**Starvation:** if food runs out, `starvingDays` increments each day the town
cannot meet `foodNeededPerDay`. Villagers gain hunger, health craters, and at
`starvingDays >= 3` villagers begin to die (1 per day per 20 population) and
emigrate.

### 9.5 Population

- **Births:** each occupied house with ≥2 adults and spare capacity has a
  `BIRTH_CHANCE = 0.06 × (townHealth/100) × (foodSurplusRatio clamped 0..1.5)`
  chance per day of producing a villager. Zero if `townHealth < 35`.
- **Immigration:** if `happiness > 55`, free housing exists, and food stock
  covers 3 days, `1 + floor(happiness/40)` migrants arrive per day at a random
  map pass and **walk in** to the town centre. Emit `villager:arrived`.
- **Emigration:** if `happiness < 25` or `starvingDays >= 2`, villagers leave
  (state `LEAVING`, walk to a pass, then are removed).
- **Deaths:** illness (above), starvation, raids, and old age (`age > 70`,
  `1/200` per day). Age increments `1/48` per day (one year per 48 days).
- Emit `villager:born`, `villager:died {cause}`, `villager:left`.

### 9.6 Happiness (drives immigration, distinct from health)

```js
happiness = 45
  + housingScore      // 0..20, share of population in houses, weighted by house tier
  + marketAccess      // 0..15, share of houses within 12 tiles of a market
  + civicScore        // 0..20, sum of civic building radiance felt by houses, capped
  + (townHealth - 50) * 0.2          // -10..+10
  - homelessPenalty   // 1.5 per homeless villager, capped at 20
  - raidGrief         // 6 per villager killed in the last 6 days, capped at 25
  - unemployedPenalty // 0.4 per unemployed adult beyond 10% of population, cap 10
```

Clamped `0..100`.

### 9.7 Coin, upkeep and trade

- Coin is earned by **taxes**: each day, `population × 0.12 × (happiness/60)`.
- Buildings with `upkeep` cost coin daily. **If coin hits 0, upkeep is not
  skipped — instead happiness drops 5/day and military equipment degrades**
  (one random armoury item lost per day). It must never hard-lock.
- **Trading Post** (tier 3): converts surplus. Once built, the player sets
  sell/buy orders in the UI. Sell price = `ITEMS[id].value`, buy price =
  `value × 1.6`. A trade caravan arrives every 6 days, walking in through a
  pass to the Trading Post's door, and executes up to 40 units of orders.
  Caravans are a raid-adjacent spectacle — they must be visible on the map.

### 9.8 Town tier

| tier | name | requires |
|---|---|---|
| 1 | Hamlet | (start) |
| 2 | Village | pop ≥ 24, a Granary, a Stockpile, townHealth ≥ 45 |
| 3 | Town | pop ≥ 60, a Market, a Chapel, townHealth ≥ 58, a Barracks |
| 4 | City | pop ≥ 120, a Keep, a Town Hall, townHealth ≥ 68, happiness ≥ 60 |

> **Superseded — do not read these numbers as current.** This table predates
> every measurement. ADDENDUM X3 and AE3 re-baselined the thresholds and
> `constants.TIERS` is the only authority: Town is pop 40 / health 50 /
> Market + Chapel (no Barracks), City is pop 75 / health 68 / happiness 60.
> The shape of the progression is what this section still describes correctly.

Tier is **sticky** — it never goes back down (losing it mid-crisis would be a
death spiral and violates §16). Emit `tier:changed {tier}` with a large,
celebratory UI moment.

---

## 10. Military & raids (`military.js`)

### 10.1 Soldiers

A soldier is a villager with `role: 'soldier'`, employed at a Barracks/
Guard Tower/Keep (each has `jobs` = garrison size). Soldiers do not produce.
They live at the barracks by day, patrol between it and the nearest gate.

### 10.2 Equipment

The **Armoury** stores `arms`-class items. On `day:ended`, each soldier
re-equips: `military.equipSoldiers()` assigns the best available weapon and
the best available armour from armoury stock to each soldier, best-garrison
first. A soldier's kit is recorded as `{ weapon, armour, shield }` and the
items are **removed from the armoury** while equipped (returned on death…
no — **lost on death**, 50% chance of being recovered after a won battle).

| kit tier | weapon | armour | power |
|---|---|---|---|
| 0 Militia | none (pitchfork) | none | 4 |
| 1 Spearman | `spear` | `gambeson` | 10 |
| 2 Swordsman | `sword` | `leather_armour` (+`shield`) | 18 (+4) |
| 3 Man-at-arms | `sword`/`crossbow` | `mail` (+`shield`) | 30 (+5) |
| 4 Knight | `halberd` | `plate` | 52 |

`crossbow` soldiers fight at range 4 tiles (they shoot first, one free round).

### 10.3 Defences

- **Palisade** (tier 2, 1×1, 2 wood): blocks enemy pathing, hp 60.
- **Stone Wall** (tier 3, 1×1, 2 stone): hp 220.
- **Gate** (tier 2/3, 1×1): walkable by villagers, blocks enemies, hp 120/300.
- **Watchtower** (tier 2, 1×1, 1 job): +1 raid warning day, spots raids.
- **Guard Tower** (tier 3, 2×2, 3 jobs): archers, auto-attack enemies within 7
  tiles for 6 damage/sec each. Needs a garrison to shoot.
- Walls are buildings with `solid: true` and are **drag-placed in lines** by
  `input.js` (§12).

### 10.4 Raid schedule

- First raid announced on **day 10**, arriving day 12 (2 days of warning; a
  Watchtower gives 3).
- Subsequent raids every `12 - min(4, floor(wave/3))` days, so the pace tightens
  from 12 days to 8.
- Raid strength: `strength = 22 × Math.pow(1.28, wave) + townValue × 0.035`,
  where `townValue` = total built-building cost + 3 × population. This means
  turtling and hoarding both attract bigger raids.
- Enemies spawn at **one or two passes** (announced in the warning: "smoke seen
  above the North Pass"), and the UI must draw an arrow at that map edge.
- Enemy types, bought greedily from `strength` budget by wave tier:
  `bandit` (cost 10, hp 40, dmg 6), `raider` (18, hp 70, dmg 10),
  `berserker` (34, hp 120, dmg 18), `crossbowman` (30, hp 60, dmg 14, range 4),
  `ram` (60, hp 300, dmg 45 vs buildings only, slow),
  `warlord` (110, hp 400, dmg 35, aura +20% to allies within 6).
- Waves 1–2 are bandits only. `raider` unlocks wave 3, `crossbowman` wave 5,
  `berserker` wave 6, `ram` wave 7, `warlord` wave 9.

### 10.5 Combat resolution (auto — the player never issues an order)

Every tick during a raid:
1. Each enemy paths toward its current objective. Objectives in order:
   nearest soldier within 8 tiles → nearest **wall/gate blocking its path** →
   the highest-value building within 20 tiles → the town centre.
2. Melee units in contact (within 0.8 tiles) deal `dmg × dt` to their target.
3. Soldiers within `SOLDIER_RESPONSE = 25` tiles of any enemy leave their post
   and intercept the nearest enemy. Soldier damage per second is
   `power × 0.1 × (0.6 + 0.4 × health/100) × moraleMult`.
4. `moraleMult = 0.75 + 0.5 × (happiness/100)`, clamped `0.6..1.25`.
5. Enemies that reach a building attack it. At `hp <= 0` a building is
   **destroyed** (`building:destroyed`), dropping 50% of its inventory on the
   ground as lootable piles the enemy carries off.
6. Enemies flee (walk back to their pass and despawn) when the wave has lost
   70% of its starting hp, or after `RAID_MAX_SECONDS = 180` game-seconds.
7. A raid ends when all enemies are dead or fled. Emit
   `raid:ended {wave, result: 'held'|'ravaged', losses, buildingsLost}`.
   `'ravaged'` if ≥3 buildings were destroyed or ≥5 villagers died.

### 10.6 The emergency draft (anti-soft-lock)

If a raid arrives and the town has **zero** soldiers, `military` automatically
drafts `min(6, floor(population × 0.3))` adults as **militia** (tier-0 kit,
power 4) for the duration of the raid. They return to their jobs afterwards.
A town can always fight back, badly.

### 10.7 Losing

The game ends only when `population === 0`, or the **Town Centre is destroyed
and cannot be rebuilt** (which requires 0 wood, 0 stone and no way to get any).
Emit `game:over {reason}`. There is a final stats screen: days survived, peak
population, raids held, tier reached.

---

## 11. Events (`utils.EventBus`, names FROZEN)

Emit with `bus.emit(name, payload)`, listen with `bus.on(name, fn)`.
Payloads are plain objects. Listeners must never throw.

```
day:ended            {day}
season:changed       {season, year}
building:placed      {id, defId}
building:completed   {id, defId}
building:destroyed   {id, defId, x, y, byRaid}
building:damaged     {id, amount, x, y}
building:produced    {id, item, qty, x, y}
villager:born        {id}
villager:died        {id, cause, x, y}
villager:arrived     {id}
villager:left        {id}
tier:changed         {tier, name}
raid:warned          {wave, daysUntil, passes}
raid:started         {wave, count}
raid:ended           {wave, result, losses, buildingsLost}
enemy:killed         {x, y}
combat:hit           {x, y, kind}
task:completed       {item, qty, x, y}
tool:changed         {tool}
select:changed       {kind, id}
toast                {text, kind}       // kind: 'info'|'good'|'warn'|'bad'
game:over            {reason, stats}
```

`toast` is the ONLY way any module shows a message. Nothing else touches the
DOM except `ui.js`.

---

## 12. Game state & module wiring (the seam contract)

`main.js` builds exactly this object and passes it to every `update`:

```js
game = {
  bus, world, paths, buildings, villagers, economy, military,
  render, particles, input, ui,
  canvas, ctx,
  state: 'start' | 'playing' | 'paused' | 'gameover',
  speed: 1,
  tickCount: 0,
}
```

Every simulation module exposes exactly:

```js
export function createX(game) -> instance     // constructor; MUST NOT read other modules yet
instance.init()                               // called after ALL modules exist; safe to cross-reference
instance.update(dt, game)
instance.serialize() -> plain JSON-safe object
instance.restore(obj, game)
```

Update order per tick, FROZEN:

```
world -> paths (flush queued path requests) -> buildings -> villagers
      -> economy -> military -> particles -> render -> ui
```

`render` and `ui` receive `update(dt, game)` too but must be pure readers.

`input.js` exposes `input.cam`, `input.tool`, `input.hover` (tile idx under the
cursor, -1 if none), `input.selected` (`{kind, id}`), and
`input.screenToTile(sx, sy) -> {x, y, idx}`. It **must not** know about any
game rule — it emits `tool:changed` and calls `buildings.place(...)`.

Drag placement: roads and walls support click-drag along an L-shaped
(Manhattan) preview; `input.js` computes the tile list and calls
`buildings.placeMany(defId, tileList)`.

---

## 13. UI requirements (`ui.js` + `hearthmere.css`)

The overlay is DOM (absolutely positioned over the canvas), not canvas-drawn,
except for tooltips that follow the cursor.

**Top bar (always visible):**
- Population `N / capacity`, with employed/idle split.
- Food: total food units + **days of food remaining** (the number players
  actually care about), turning amber < 5 days, red < 2.
- Health meter (0–100) with the **variety breakdown on hover**: which of the 6
  groups you have, which you are missing. This must be one glance.
- Happiness meter.
- Coin.
- Key goods with live counts. **Superseded by ADDENDUM AK2**: the row is
  derived per tier from `obtainableAt(tier)` rather than frozen as a fixed
  list, and shows `available` rather than gross stock (ADDENDUM AO2).
- Day/season/year, clock dial, speed buttons `‖ 1× 2× 3×`.
- **Raid countdown** when a raid is warned — a red banner with the wave number,
  days remaining, and which pass.

**Build menu (bottom):** category tabs (Housing, Gathering, Food, Industry,
Military, Civic, Infrastructure). Locked buildings are shown greyed with their
unlock requirement — **never hidden**, because seeing the future is the point.
Each entry shows cost, jobs, and a one-line description on hover.

**Inspector (right, on selection):** for a building — name, art, worker list
with names, inventory bars, production rate, idle reason in plain language,
priority slider, pause/demolish. For a villager — name, age, job, home,
current activity in words ("carrying 6 planks to the Bakery"), health, hunger.

**Alerts panel (left):** a live list of problems, deduped and sorted by
severity: `no road`, `no storage`, `starving`, `homeless`, `unemployed`,
`resource exhausted`, `no soldiers`. Clicking an alert **pans the camera** to
the offending building. This panel is the single most important legibility
feature in the game — build it well.

**Overlays** (hotkeys 1–4): road network, happiness heatmap, food radius,
raid-approach paths.

Hotkeys: `Space` pause, `1/2/3` speed, `R` road tool, `Esc` cancel tool,
`Del` demolish, `M` build menu, `,`/`.` cycle alerts.

**The intro.** On first visit (`hearthmere_seen_intro`), a short modal: the
premise, the three things to do first (build a Woodcutter, a road to it, a
Cottage), and the controls. Never show it again.

---

## 14. Save format

```js
{ v: 1, seed, clock, world: {...}, buildings: [...], villagers: [...],
  economy: {...}, military: {...}, cam: {x,y,zoom} }
```

- Autosave every 30 real seconds and on `day:ended`, into `hearthmere_save`.
- Typed arrays serialize as plain arrays via `Array.from`, restore via the
  typed-array constructor. **Test the round trip** — a save/load must not
  change a single villager's position, task or job.
- **Restore order is FROZEN:** `world` → `paths.rebuild()` → `buildings` →
  `villagers` → `economy` → `military`. Anything that restores a cross-module
  reference (a villager's `jobId`, a task's `fromId`) must re-validate it and
  drop it if the referenced object is gone, rather than trusting the file.
- A save from an older `v` that fails to restore must be discarded with a toast,
  not crash the game.

---

## 15. Balance targets (FROZEN — QA measures these, they are not suggestions)

A competent player, playing well, should hit roughly:

| milestone | by day |
|---|---|
| 12 population, 3 food types | 8 |
| Village (tier 2) | 18 |
| First raid held with no buildings lost | 12 |
| 40 population, 6 food types, health ≥ 60 | 35 |
| Town (tier 3) | 45 |
| Iron chain running, tier-2 kit on 6 soldiers | 55 |
| 100 population | 80 |
| City (tier 4) | 110 |

An **idle** player (builds a starter town on day 1, then stops) must:
- survive to roughly day 20–30, then decline from raids, not from a bug;
- never reach a state where the UI shows no actionable problem.

A **greedy** player (all houses, no food) must starve by day ~15.
A **turtle** player (all walls, no economy) must stall from lack of coin/food.

---

## 16. Anti-soft-lock rules (FROZEN)

1. **Wood is never unobtainable.** If total wood stock is 0 and no Woodcutter
   exists, any idle villager may gather 1 wood per 8 seconds by hand from an
   adjacent forest tile (the "gather by hand" fallback). Forests regrow.
2. **The first 3 buildings auto-complete** so a new game cannot stall on
   "no builders to build the Builder's Hut".
3. **Unemployed villagers always build.** There is no state where a placed
   site has no possible builder while any villager lives.
4. **Cancelling always refunds.** Nothing is destroyed by a cancel.
5. **Tier never regresses.**
6. **The emergency draft** (§10.6) means a raid always meets resistance.
7. **Resources are relocatable, not fatal.** Map generation guarantees far more
   stone/iron/clay than one town needs (§5).
8. **Every idle building names its reason** (§7), and every reason has a fix
   the player can perform right now. If you find an idle reason with no
   available fix, that is a Tier-1 bug.
9. **Food always has a floor.** Foraging and fishing require no inputs and no
   season except Winter (halved, not zero), so a town can always claw back.

---

## 17. Fun checklist (QA must assess these, not just correctness)

- Can you tell, in one glance, why the town is unhappy?
- Does watching a single villager for 60 seconds tell a coherent story?
- Is the first raid scary and survivable?
- Does adding a road visibly speed the town up within 30 seconds?
- Does unlocking a tier feel like an event?
- Is there ever a 60-second stretch with nothing to decide? (There must not be.)
- Does the Winter of year 1 hurt without being a wipe?
- When you lose a building to a raid, do you know *why* you lost it?

---

## 18. Testing contract

Every module must be importable and runnable **headless under Node 22** —
no `document`, no `window`, no `canvas` at import time. `render.js`,
`particles.js`, `ui.js` and `input.js` may touch the DOM, but only inside
functions called after `init()`, never at module scope.

`main.js` must export, in addition to its bootstrap:

```js
export function createHeadlessGame(opts) -> game   // no DOM, no render/ui/input/particles
export function stepHeadless(game, seconds)        // runs the sim at a fixed dt
```

This is what QA harnesses drive. Any module that cannot be stepped headlessly
has a bug.

---

*Frozen. Addenda are appended below as new numbered sections; existing sections
are never edited in place.*

---

# ADDENDUM A — Building roster (FROZEN ids, sizes, tiers)

`constants.js` owns the exact numbers (costs, times, yields); this table freezes
the **ids, names, categories, footprints, tiers, job counts and role strings**
so every other module can reference them. Costs shown are indicative starting
values the balance pass may tune; ids and footprints may NOT change.

`role` is what tints the villager and labels them in the UI.

### Infrastructure (`cat: 'infra'`, tier 1 unless noted)

| id | name | w×h | jobs | notes |
|---|---|---|---|---|
| `path` | Dirt Path | 1×1 | 0 | 1 wood. Drag-placeable. Not a building instance — sets `world.road = 1`. |
| `road` | Cobbled Road | 1×1 | 0 | tier 2, 1 stone. Sets `world.road = 2`. |
| `bridge` | Bridge | 1×1 | 0 | tier 2, 3 plank. Placeable on WATER/SHORE, acts as `road = 1`. |
| `town_centre` | Town Centre | 3×3 | 2 | Pre-placed at `world.start`. Role `elder`. Radiates happiness. Destroyed = §10.7. |
| `well` | Well | 1×1 | 0 | happiness radius 8, +4 |
| `fountain` | Fountain | 2×2 | 0 | tier 3, happiness radius 12, +10 |

### Housing (`cat: 'housing'`)

| id | name | w×h | tier | houses |
|---|---|---|---|---|
| `cottage` | Cottage | 2×2 | 1 | 4 |
| `house` | House | 2×2 | 2 | 7 |
| `townhouse` | Townhouse | 2×2 | 3 | 11 |
| `manor` | Manor | 3×3 | 4 | 18 |

Houses need no workers and no inputs, but a house **within 12 tiles of a
Market** counts double for `marketAccess` and unlocks the upgrade to the next
tier (upgrading is placing the higher building over the lower — allowed, costs
the difference, keeps the residents).

### Gathering (`cat: 'gather'`)

| id | name | w×h | tier | jobs | role | gathers |
|---|---|---|---|---|---|---|
| `woodcutter` | Woodcutter's Hut | 2×2 | 1 | 2 | `forester` | TREE → `wood` |
| `forager` | Forager's Hut | 2×2 | 1 | 2 | `forager` | BERRY → `berries`, FOREST → `mushrooms` |
| `hunter` | Hunter's Lodge | 2×2 | 1 | 2 | `hunter` | GAME → `venison` (+`hide` 50%) |
| `fisher` | Fisherman's Hut | 2×2 | 1 | 2 | `fisher` | FISH → `fish` (needs shore) |
| `quarry` | Quarry | 3×3 | 1 | 3 | `quarrier` | STONE → `stone` (needs rock) |
| `clay_pit` | Clay Pit | 2×2 | 2 | 2 | `digger` | CLAY → `clay` |
| `herbalist` | Herbalist's Hut | 2×2 | 2 | 1 | `herbalist` | HERB → `herbs` |
| `iron_mine` | Iron Mine | 3×3 | 3 | 4 | `miner` | IRON → `iron_ore` (needs rock) |

### Food production (`cat: 'food'`)

| id | name | w×h | tier | jobs | role |
|---|---|---|---|---|---|
| `wheat_farm` | Wheat Farm | 4×4 | 2 | 3 | `farmer` |
| `vegetable_garden` | Vegetable Garden | 3×3 | 2 | 2 | `gardener` |
| `orchard` | Orchard | 3×3 | 2 | 2 | `orchardist` |
| `windmill` | Windmill | 2×2 | 2 | 1 | `miller` |
| `bakery` | Bakery | 2×2 | 2 | 2 | `baker` |
| `chicken_coop` | Chicken Coop | 2×2 | 2 | 1 | `poulterer` |
| `sheep_pasture` | Sheep Pasture | 4×4 | 2 | 2 | `shepherd` |
| `pig_farm` | Pig Farm | 3×3 | 3 | 2 | `swineherd` |
| `dairy_farm` | Dairy Farm | 3×3 | 3 | 2 | `dairymaid` |
| `cheesemaker` | Cheesemaker | 2×2 | 3 | 2 | `cheesemaker` |
| `apiary` | Apiary | 2×2 | 3 | 1 | `beekeeper` |
| `brewery` | Brewery | 3×2 | 3 | 2 | `brewer` |
| `smokehouse` | Smokehouse | 2×2 | 3 | 1 | `smoker` |
| `market` | Market | 3×3 | 2 | 3 | `trader` |

Farms/gardens/orchards/pastures produce from their own footprint: yield scales
with `world.fertility` averaged over the footprint and the terrain multiplier
(§5). They have no `recipe.in` — they are `grows: {item, time, base}` buildings.
Sheep Pasture produces `wool` continuously and `mutton` every 4th batch.
Dairy Farm produces `milk`. **Winter output is zero for all `grows` buildings**
(idle reason `'out of season'`), which is the whole reason granaries exist.

### Industry (`cat: 'industry'`)

| id | name | w×h | tier | jobs | role |
|---|---|---|---|---|---|
| `builders_hut` | Builder's Hut | 2×2 | 1 | 3 | `builder` |
| `stockpile` | Stockpile | 3×3 | 1 | 2 | `porter` |
| `granary` | Granary | 3×3 | 1 | 2 | `porter` |
| `warehouse` | Warehouse | 4×3 | 3 | 3 | `porter` |
| `sawmill` | Sawmill | 3×2 | 2 | 2 | `sawyer` |
| `charcoal_burner` | Charcoal Burner | 2×2 | 2 | 1 | `burner` |
| `kiln` | Kiln | 2×2 | 2 | 2 | `potter` |
| `weaver` | Weaver's Shop | 2×2 | 3 | 2 | `weaver` |
| `tannery` | Tannery | 2×2 | 3 | 2 | `tanner` |
| `bloomery` | Bloomery | 2×2 | 3 | 2 | `smelter` |
| `blacksmith` | Blacksmith | 2×2 | 3 | 2 | `smith` |
| `foundry` | Foundry | 3×3 | 4 | 3 | `founder` |
| `chandler` | Chandler | 2×2 | 4 | 1 | `chandler` |
| `apothecary` | Apothecary | 2×2 | 3 | 1 | `apothecary` |
| `trading_post` | Trading Post | 3×3 | 3 | 2 | `merchant` |

### Military (`cat: 'military'`)

| id | name | w×h | tier | jobs | role | notes |
|---|---|---|---|---|---|---|
| `palisade` | Palisade | 1×1 | 2 | 0 | — | solid, hp 60, drag-placeable |
| `wooden_gate` | Wooden Gate | 1×1 | 2 | 0 | — | hp 120, villager-passable |
| `stone_wall` | Stone Wall | 1×1 | 3 | 0 | — | solid, hp 220, drag-placeable |
| `stone_gate` | Stone Gate | 1×1 | 3 | 0 | — | hp 300, villager-passable |
| `watchtower` | Watchtower | 1×1 | 2 | 1 | `watchman` | +1 warning day |
| `barracks` | Barracks | 3×3 | 2 | 6 | `soldier` | garrison 6 |
| `armoury` | Armoury | 3×3 | 3 | 2 | `porter` | stores `arms` |
| `guard_tower` | Guard Tower | 2×2 | 3 | 3 | `soldier` | archers, range 7 |
| `weaponsmith` | Weaponsmith | 3×2 | 3 | 2 | `weaponsmith` | |
| `armourer` | Armourer | 3×2 | 3 | 2 | `armourer` | |
| `crossbow_range` | Crossbow Range | 3×3 | 4 | 2 | `fletcher` | |
| `plate_armoury` | Plate Armoury | 3×3 | 4 | 2 | `armourer` | |
| `keep` | Keep | 4×4 | 4 | 12 | `soldier` | garrison 12, unlocks City |

### Civic (`cat: 'civic'`)

| id | name | w×h | tier | jobs | role | happiness |
|---|---|---|---|---|---|---|
| `chapel` | Chapel | 3×3 | 2 | 1 | `priest` | r12 +10 |
| `tavern` | Tavern | 3×3 | 3 | 2 | `taverner` | r12 +12, consumes `ale` |
| `school` | School | 3×3 | 3 | 2 | `teacher` | r10 +6, +10% production town-wide |
| `town_hall` | Town Hall | 4×4 | 4 | 3 | `clerk` | r16 +14, +20% tax |
| `cathedral` | Cathedral | 4×4 | 4 | 3 | `priest` | r20 +22 |
| `university` | University | 4×4 | 4 | 3 | `scholar` | r12 +8, +20% production town-wide |

**Total: 62 placeable things.** Every one must appear in the build menu with
its unlock requirement visible from tier 1.

---

# ADDENDUM B — Operational notes (FROZEN)

- **Local URL for testing:** `http://localhost:5000/games/hearthmere/main`
  (the Flask dev stack is already running via `docker-compose up -d` from the
  repo root; it bind-mounts the repo, so an edit to a file under
  `static/hearthmere/` is live on the next hard reload — no rebuild needed).
- The served shell (`templates/projectsV2.tmpl` via `ProjectV2View`) is generic
  for every game: `<body>` is empty and the `<title>` is the literal string
  "Projects". `main.js` must therefore set `document.title = 'Hearthmere'`
  itself on boot, and inject its own `<link rel=stylesheet>` and `<canvas>`.
- `static/shared/appinit.js` imports `/static/hearthmere/main.js` with a
  `?v=` cache-buster of `0`, so the browser WILL cache aggressively. Use a hard
  reload (`Cmd-Shift-R`) or `mcp__chrome-devtools__navigate_page` with a
  cache-busting query param when testing.
- `static/hearthmere/**/*.js` is registered in `eslint.config.js`'s
  `modulePatterns`, and the game is registered in `api/views/apps.py` as
  `p5_apps['hearthmere']` with `status: 'wip'`.
- Node for headless harnesses: `source ~/.nvm/nvm.sh && nvm use 22`. The shell
  default is Node 12 and will not parse modern syntax.
- **Concurrent agents share one Chrome instance.** If you drive the browser,
  use a unique `isolatedContext`, and batch setup + action + assertion into a
  single `evaluate_script` call rather than a sequence of separate calls, or
  another agent will steal the page out from under you mid-test.

---

# ADDENDUM C — Path cost normalisation and utils semantics (FROZEN)

Raised during the build of `utils.js`: §6 gives cobbled road a speed of 1.55
tiles/sec. If `world.moveCost(idx)` were the naive `1 / speed`, a road tile
would cost 0.645, the minimum tile cost would be below 1, and `utils.octile`
— which assumes a minimum step cost of 1 — would become **inadmissible**.
A* would then silently return suboptimal paths. This addendum fixes it.

## C1. `moveCost` is normalised so the cheapest tile costs exactly 1

```js
FASTEST_SPEED = 1.55            // cobbled road, the fastest tile in the game
world.moveCost(idx) = FASTEST_SPEED / speedOf(idx)
```

Giving, from §6's speeds:

| tile | speed (tiles/sec) | `moveCost` |
|---|---|---|
| `ROAD_COBBLE` | 1.55 | **1.00** |
| `ROAD_DIRT` | 1.15 | 1.348 |
| `GRASS`/`MEADOW`/`SAND` | 0.50 | 3.100 |
| `ROCK` | 0.40 | 3.875 |
| `FOREST` | 0.35 | 4.429 |

`utils.octile` is therefore admissible (and, `constants.js` must define
`FASTEST_SPEED` alongside `MOVE_SPEED`). A* in `paths.js` uses `moveCost`; it
must NOT apply any further scaling to the heuristic.

**`moveCost` is a pathfinding cost only. It is never used to move a villager.**
Villager movement in `villagers.js` uses the raw `MOVE_SPEED` tiles/sec from
§6 directly. Mixing the two is a bug: a path's `cost` is in "cobble-tile
equivalents", and real seconds of travel are `cost / FASTEST_SPEED`.

## C2. Frozen `utils` semantics that other modules must not re-litigate

- **`diamondPath(ctx, cx, cy, halfW, halfH, jitterSeed)` calls `ctx.beginPath()`
  itself and closes the path.** The renderer's idiom is therefore
  `diamondPath(...); ctx.fill();` — `render.js` must NOT call `beginPath()`
  around it, and cannot batch several diamonds into one path with it. Pass
  `jitterSeed` as `undefined` for a clean, un-jittered diamond (build previews,
  UI icons, minimap).
- **`utils.hexToRgb` returns a shared cached object. Treat it as read-only.**
  Mutating it poisons the cache for every caller.
- **`RNG.getState()` returns an object `{s, gaussSpare}`, not a number**, because
  `gauss()` caches a spare value that must survive a save or the sequence
  shifts after load. `setState` accepts that object or a bare uint32 seed.
  Save files must store the object.
- **`utils.fmtDays`** renders `"1 day"`, `"4.5 days"` (one decimal under 10),
  `"12 days"` (integer at/above 10), `"∞"`. `ui.js` uses it rather than rolling
  its own, so the food readout and the tooltips agree.
- **`utils.Pool(factory, reset)`** works with or without `new`; `reset` optional.
- **`dirBetween` returns 0 (East) for a zero delta.**

---

# ADDENDUM D — Contract corrections found during the foundation build (FROZEN)

`constants.js` is now built and is the authority on every number. These are the
places where earlier sections contradicted themselves; the resolutions below
are final and must not be re-litigated by any agent.

## D1. There are **66** buildings, not 62

ADDENDUM A's closing line says "Total: 62 placeable things". **That count is
wrong; the tables are the enumeration.** The real breakdown, as shipped in
`constants.js`:

| category | count |
|---|---|
| Housing | 4 |
| Gathering | 8 |
| Food | 14 |
| Industry | 15 |
| Military | 13 |
| Civic | 6 |
| Infrastructure | 6 |
| **total** | **66** |

Nothing is missing. Do not "add back" four buildings.

## D2. Winter zeroes every `grows` building

§5 says "Pastures are halved" in Winter; ADDENDUM A says Winter output is zero
for **all** `grows` buildings. **ADDENDUM A wins** — every `grows` building
(farms, gardens, orchards, pastures, dairy) carries `grows.winter === false`
and produces nothing in Winter, with idle reason `'out of season'`.

§5's halving in Winter still applies to **foraging and fishing**, which are
`gathers` buildings, not `grows` buildings. Hunting remains unaffected.

## D3. Chicken Coop and Pig Farm are `recipe` buildings, not `grows`

§4 gives eggs and pork a grain input, so both are `recipe` buildings consuming
`grain`. They are therefore **not seasonal** and work through Winter. This is
deliberate and load-bearing: the Chicken Coop is the only cheap year-round
`dairy`-group source, so a player who stockpiles grain can hold their nutrition
variety through a Winter instead of watching it collapse every twelve days.

## D4. Processing chains must be nutrition-positive

§7's illustrative bakery snippet (`in: {flour: 2}, out: {bread: 1}`) would make
the grain chain *destroy* nutrition (4 grain = 2.4 units → 1 bread = 1.6). That
snippet is a shape example, not balance. The frozen rule:

> **Every food recipe must output strictly more nutrition than it consumes.**

So Windmill is `2 grain → 2 flour`, Bakery is `2 flour → 2 bread` (4 grain =
2.4 units becomes 4 bread = 6.4 units, a 2.7× payoff), and Smokehouse,
Cheesemaker and Brewery likewise output quantity 2. Goods chains are exempt —
they only need to pay off in coin, not calories.

## D5. Ranged soldiers

`EQUIPMENT_TIERS[3]` carries both `range: 4` and `rangedWeapons: ['crossbow']`.
`military.js` applies the 4-tile range **only when the soldier's equipped
weapon is in `rangedWeapons`** — a tier-3 man-at-arms carrying a sword is a
melee unit.

## D6. Data-shape notes every module must respect

- `BUILDINGS` is an **array**; `BUILDING_BY_ID` is the lookup map;
  `BUILDINGS_BY_CAT` is keyed by the 7 `CATEGORIES` ids in build-menu order.
- `ITEMS[id]` publishes both spellings (`cls`/`class`, `group`/`foodGroup`).
  Use **`itemClass(id)`** for storage routing — it returns `'arms'` for weapons
  and armour even though they are `cls: 'good'`, which is what Armoury routing
  depends on.
- `path`, `road` and `bridge` carry `instance: false` and a `road:` value. They
  set `world.road` and are **not** building instances. `drag: true` marks the
  drag-placeable defs (path, road, bridge, palisade, stone_wall).
- The Town Centre carries `storage: {classes:['good','food'], cap:150}` so
  `START_STOCK` has an honest home on day 1 before any Stockpile exists.
- Weaponsmith and Armourer carry a `recipes: []` array (player-selectable in
  the UI) **plus** a default `recipe`, so a module that only reads `recipe`
  still behaves.
- `alertFor(reason)` maps a parameterised idle reason (`'no materials: flour'`)
  onto its `ALERTS` entry. `ui.js` must use it rather than indexing `ALERTS`.
- `constants.js` also exports `FASTEST_SPEED` and `moveCostFor(road, terrain)`,
  which implement ADDENDUM C. `world.moveCost(idx)` must delegate to
  `moveCostFor`, and nothing else may invent its own cost formula.

---

# ADDENDUM E — Clock, corner-cutting and start state (FROZEN)

Raised during the build of `world.js`/`paths.js`. These are seam decisions that
more than one module keys off, so they are frozen here rather than left to
whoever implements each side.

## E1. `day:ended {day}` carries the day that has just BEGUN

**`payload.day === world.clock.day` always.** The event fires immediately after
the rollover, so the first emission is `{day: 2}` at the end of day 1.

Nothing anywhere subtracts 1 from it. `RAID_FIRST_WARN_DAY`, `RAID_FIRST_DAY`,
the §15 balance table and every "by day N" statement in this document are all
in current-day terms, so a module may read either `payload.day` or
`world.clock.day` and can never be off by one.

`season:changed {season, year}` fires immediately after `day:ended` on the same
rollover, and only when the season actually changed. `world`'s own regrowth runs
**after** both events, so a listener sees pre-regrowth `world.amount`.

A headless step longer than one day fires `day:ended` once per day, in order.

## E2. The lax diagonal rule stands

§6's "diagonal moves are forbidden if **both** orthogonal neighbours are
blocked" is laxer than the conventional rule ("either"). It is **deliberate and
final**, for two reasons:

1. Wall integrity is unaffected. A wall is impermeable because its tiles are
   not walkable, not because of the corner rule; and a diagonal wall line still
   holds, because a villager cutting between two diagonal wall tiles has *both*
   orthogonal neighbours blocked and is refused.
2. The strict rule can isolate a tile in a tight diagonal gap between two
   buildings, which is a soft-lock risk. Priority 1 beats priority 5: a
   villager occasionally clipping a building corner is a cosmetic cost we
   accept to keep the map always traversable.

`render.js` should therefore not assume villagers stay strictly outside
footprint corners.

## E3. Start state

- `world.start` is the **centre tile** of the guaranteed-flat, guaranteed-clear
  8×8 `world.startArea`. The 3×3 Town Centre is pre-placed at
  `(start.x - 1, start.y - 1)`, landing dead centre.
- `main.js` **pre-lays a 3-tile dirt path stub** running from the Town Centre's
  door tile, so the game does not open on a `'no road'` warning against a
  building the player did not place. The stub is deliberately short: the first
  thing the player builds will be off the end of it, and the second building
  they place away from it teaches the road rule by showing the warning.
- `START_STOCK` lives in the Town Centre's own storage
  (`classes: ['good','food'], cap: 150`).

## E4. Path API semantics other modules must not re-litigate

- **`paths.sameRegion(a, b)`, never `regionOf(a) === regionOf(b)`.** Two
  unwalkable tiles both answer `-1` and would compare as "connected".
- **Region ids are not stable across invalidations.** Compare two live lookups;
  never cache a region id across ticks.
- **`find`/`request` auto-switch to adjacency mode when the destination tile is
  not walkable** (a shore tile for a fisherman, a building footprint). The last
  tile of the returned path is then the tile *next to* the target. Check
  `tiles[tiles.length - 1]` rather than assuming it equals `to`.
- `world.solid[]` and `world.gate[]` exist (they are not in §5's tile list) and
  are serialized with the world, because §14 freezes `world → paths.rebuild()`
  **before** `buildings` restores a single wall.
- `world.rev` is a revision counter bumped by every walkability/cost/road/solid/
  gate mutation; `paths.sync()` compares one integer and rebuilds lazily. This
  means paths cannot go stale even if another module forgets to invalidate —
  but going through the documented `paths.*` wrappers is still the contract.
- Exhausted `stone`/`iron`/`clay` tiles **keep `resource` set with
  `amount === 0`** so they can be drawn as spent outcrops; a non-zero `resource`
  does NOT mean "has stock". Depleted tree tiles are gone entirely (terrain
  becomes GRASS, resource NONE).

---

# ADDENDUM F — Hotkey ownership, overlays, and browser testing (FROZEN)

## F1. §13 contradicts itself on the number keys

§13 lists both "`1/2/3` speed" and "Overlays (hotkeys 1–4)". Resolution, which
`input.js` and `ui.js` arrived at independently and which is now frozen:

- **Bare `1` / `2` / `3`** set game speed.
- **`Shift+1` … `Shift+4`** toggle the four overlays.

## F2. `ui.js` owns the §13 hotkeys; `input.js` yields

Both files bind `window` keydown. Both handling the same key means `Space`, `M`
and `,`/`.` fire twice and cancel out. The frozen arrangement:

- While `game.ui.onKey` is a function, `input.js` keeps **only** WASD/arrow
  camera panning and leaves every other §13 key to `ui.js`.
- `input.ownsHotkeys = true|false` forces it either way; standalone (no `ui`),
  `input.js` implements the full §13 set.
- If `ui.js` opens a modal it sets `ui.modalOpen = true`; `input.js` then leaves
  Escape entirely to `ui.js` and emits `ui:escape` instead of cancelling the
  tool.

`ui:*` event names (`ui:escape`, `ui:build-menu`, `ui:cycle-alert`,
`ui:overlay`) are **UI-local and not part of the frozen §11 set** — they carry
no simulation meaning and may be renamed freely.

## F3. Frozen interface details between `input`, `ui` and `render`

- `input.tool` is always a **plain string** (`''` inspect, `'demolish'`, or a
  def id). `setTool` accepts both `setTool(defId)` and `setTool(kind, defId)`.
- Empty selection is `{kind: '', id: -1}` — `''`, not `'none'`.
- `input.panTo(tileX, tileY, zoom?)` takes **tile** coordinates.
  `panToWorld(wx, wy)`, `focusOn(...)` and `centreOnTile(tx, ty)` also exist.
- `input.dragTiles` is an array of **tile indices**, live and reused every
  pointermove. Read it; never retain the reference.
- `input.hover` is `-1` when the cursor is off-map **or over a DOM overlay** —
  do not draw a build ghost for `-1`.
- Screen coordinates in `input.js` are **CSS pixels from the canvas top-left**.
  `render.js` owns `setTransform(dpr, …)`; no CSS transform or border may be
  added to the canvas or picking breaks.
- **Picking deliberately ignores `world.elev`.** The `elev * 4px` lift is
  cosmetic; picking uses the flat projection so `screenToTile` stays an exact
  inverse of the projection.
- Tile *centre* is `isoX(tx + 0.5, ty + 0.5)`. Anything treating `isoX(tx, ty)`
  as a centre is the half-tile bug.
- `input.update()` ignores the simulation `dt` and uses wall-clock, so the
  camera still pans while the game is paused.
- There must be exactly **one** camera object: `render.cam === input.cam`, a
  shared reference, never a copy.

## F4. Particles draw in two layers

`render.js` must call `particles.drawGroundWorld(ctx, renderer)` **before**
entities and `particles.drawOverheadWorld(ctx, renderer)` **after** them, with
the world transform already on the context. Ground = dust, blood stains,
impact scatter. Overhead = smoke, sparks, arrows, pops, rubble, snow/rain,
birds, hearth motes. Screen-space equivalents `drawGround`/`drawOverhead`
exist for identity-transform callers.

Particles are never saved: `particles.serialize()` returns `{}`.

`military.js` must call `particles.arrow(fromTileX, fromTileY, toTileX, toTileY)`
explicitly when a Guard Tower or crossbowman shoots — there is no frozen §11
event for a shot.

## F5. Browser testing: launch your own Chrome

**The `chrome-devtools` MCP is not usable in this session.** The user's own
Chrome occupies port 9222 without a working CDP HTTP endpoint (`/json/version`
returns 404). Any agent that needs a real browser must launch its **own**
headless Chrome on a unique port with its own profile directory and drive it
over CDP directly, e.g.:

```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome \
  --headless=new --remote-debugging-port=<unique port> \
  --user-data-dir=<scratchpad>/chrome-<yourname> --no-first-run
```

Never attach to port 9222, and never drive the user's browser.

---

# ADDENDUM G — Resolutions forced by the first end-to-end run (FROZEN)

`economy.js` was the first module to drive the real `world`/`paths`/`buildings`/
`villagers` together for 120 in-game days. Doing so exposed three blocking
defects and five places where this document asks for something it does not make
possible. Per §0's standing rule, contradictions are resolved by **a design
decision stated here**, not by quietly retuning a number at one end of the seam.

## G1. The first raid must be winnable with agency, so defence starts at tier 1

**The contradiction.** §15 requires "first raid held with no buildings lost" by
day 12. Every defensive building in ADDENDUM A is tier 2+, and tier 2 requires
pop ≥ 24 — unreachable by day 12. So the player's only response to the first
raid was §10.6's emergency draft: bare-handed militia, no decisions, no agency.
That directly contradicts the "peace is preparation" pillar, which promises the
player wins the battle in the fifteen days *before* it.

**The decision.** Bodies and timber are tier 1; steel is not. Override
ADDENDUM A's tier column for exactly four defs:

| id | was | now |
|---|---|---|
| `palisade` | 2 | **1** |
| `wooden_gate` | 2 | **1** |
| `watchtower` | 2 | **1** |
| `barracks` | 2 | **1** |

Everything else in the Military category keeps its tier. The intended shape of
the early game is therefore: **a wooden wall, a gate, a watchtower and six
unarmed men by day 12** — enough to hold wave 1 if you planned for it, nothing
like enough for wave 5. Weaponsmith, Armourer and Guard Tower remain tier 3, so
arming those men stays the mid-game project it was designed to be.

This does not weaken tier 3's `barracks` requirement, which still gates on
having built one.

## G2. The opening must not deadlock on labour

**The defect.** With `START_VILLAGERS = 6`, the Town Centre's 2 job slots plus
two gathering huts employ every villager. §16.3 promises "unemployed villagers
always build" — but there are no unemployed, and no porters exist until a store
is built, which itself requires hauling. Construction and logistics both stop
dead on day 1, and nothing in the UI explains why.

**The decision, three parts:**

1. **`START_VILLAGERS = 10`.**
2. **The Town Centre's role becomes `porter`, not `elder`.** It is the town's
   first storage building; its two workers must haul. `ROLE_COLOURS.elder`
   becomes unused.
3. **§16.3 is strengthened and supersedes its earlier wording:** if a
   construction site has all its materials delivered and no builder has worked
   on it for 10 game-seconds, **any villager whose own workplace is currently
   idle** (`b.idleReason !== ''`) may act as a builder at
   `UNEMPLOYED_BUILD_RATE`. A town can never be unable to finish a building it
   has already paid for.

## G3. Storage classes must not starve each other

**The defect.** The Town Centre and Warehouse both accept `['good','food']`.
A food surplus (the measured run reached 79 days of food) fills every
shared-class store, leaving no room for timber; the goods chain stalls with
`'no storage'`, and the player cannot build more storage because that needs
timber. Legal escapes exist (pause or demolish a food building) but nothing
tells the player that, which violates §16.8.

**The decision:**

1. **The Warehouse takes `['good','arms']` only.** Food has the Granary.
2. **A multi-class store reserves capacity per class.** The Town Centre's
   `cap: 150` becomes a per-class cap of 75 food + 75 good. No class may
   consume another's room.
3. **The idle reason becomes `'no storage: <class>'`** (e.g.
   `'no storage: good'`), parameterised exactly like `'no materials: <item>'`
   and resolved by the same `alertFor()` colon-splitting. The alert must say
   which class is full, because "build a Granary" and "build a Stockpile" are
   different actions and the player cannot currently tell which they need.

## G4. Winter hunger is real, not decorative

§9.4 sets `seasonMult = 1.25` in Winter, but `villagers.js` raises hunger at a
flat rate with no season term — so the HUD's `daysOfFood` was 25% pessimistic
while actual consumption never rose. **Villagers must draw their hunger rate
from `economy.hungerRatePerSecond()`**, which applies §9.4's multiplier. Winter
genuinely costs 25% more food. This is the whole point of the season.

## G5. `recentPlagueDays` is a no-op

The term appears in §9.4's `healthTarget` formula but no plague system is
defined anywhere in this document. **It is frozen at 0.** The property
`economy.recentPlagueDays` remains settable so a plague can be added later
without touching the formula, but nothing sets it and no agent should implement
one. Illness deaths below health 25 (§9.4) already carry that pressure.

## G6. Emitter ownership of the population events

`villagers.js` and `economy.js` disagreed about who emits what. Frozen:

| event | emitted by |
|---|---|
| `villager:born` | **economy** (it decides the birth; it calls `villagers.spawn({emit:false})`) |
| `villager:arrived` | **villagers** (it knows when the migrant physically reaches the centre) |
| `villager:left` | **villagers** (it knows when the emigrant reaches the pass) |
| `villager:died` | **villagers**, from `kill()` |
| `task:completed` | **villagers** |

Any module emitting one of these that it does not own double-counts §9.6's raid
grief or the population figures. No exceptions.

## G7. Happiness has no floor without houses — this is intended

`housingScore`, `marketAccess` and `civicScore` are all measured per-house, so a
town with **zero houses scores 0 on all three** and sits at happiness ≈ 36,
below the 55 immigration gate. Building a Cottage is therefore a hard day-one
requirement, not advice. **The intro modal must say so explicitly** rather than
leaving the player to discover it. §13's "three things to do first" becomes:
build a Woodcutter, run a path to it, **build a Cottage**.

## G8. Formulas §9.6 left as prose

Frozen as implemented, since §9.6 gave names but not arithmetic:

```
housingScore = 20 * housedShare * (0.75 + 0.25 * (avgHouseTier - 1) / 3)
marketAccess = 15 * (houses within 12 tiles of a market / total houses)
civicScore   = average per-house civic radiance, each house capped at 20,
               then the result capped at 20
emigration   = 1 + floor(population / 40) per day
arrears      = §9.7's "happiness drops 5/day" is capped at a total of 30 and
               halves per solvent day (measured recoverable in 8 days).
               Unbounded would be a death spiral and violate §16.
STARVING_HUNGER = 1.5, STARVING_SHARE = 0.5
```

The arrears cap matters: §9.7 as written had no floor, which is a soft-lock.

## G9. The two "blocking defects in `villagers.js`" were misdiagnosed

`economy.js` reported both as defects in `villagers.js`. Both were verified
independently against the real modules, wired in the frozen §12 order, and the
attribution was wrong in both cases. Recorded here because the *method* matters
more than the verdict: an agent's report about a file it does not own is a lead,
never a finding.

1. **Gathering works.** `villagers.js` calls
   `buildings.gatherComplete(b, workerId, nodeIdx)` correctly (`villagers.js:1618`),
   guarded on the worker actually being back at the door. A direct run of a
   Woodcutter with two foresters accumulates wood in its buffer and stalls with
   `'output full'` once the buffer fills — exactly right. The original
   observation ("the building's inventory stays `{}` forever") reproduces only
   when the hut has **no storage with room to haul into**, which is `'no storage'`
   behaving as designed, or when the workers have starved off the job. **No
   change to `villagers.js`.**

2. **`arriveAt` is being called wrongly, by `economy.js`.** The real signature is
   `villagers.arriveAt(vOrId, toTile)` — a villager or id first. `economy.js`
   calls it as `arriveAt(idx, opts)`, passing a tile index where a villager is
   expected, so `resolve()` finds nothing and returns `null`. Verified:
   `arriveAt(villager, tile)` succeeds, `arriveAt(tileIdx, {})` returns null.
   **The fix belongs in `economy.js`**: spawn the migrant first, then call
   `arriveAt(villager, townTile)`. Economy's spawn fallback then becomes dead
   code and must be removed, not left as a second path.

**Standing rule this establishes:** a defect reported by one agent against
another agent's file is not actionable until reproduced against the real
modules in the frozen update order. Two of the three "blocking" defects in the
first end-to-end report were seam errors on the reporter's own side.

## G10. `buildings.overflow` needs a drain

Goods enter `buildings.overflow` (the never-destroy refund pool) and can only
leave via `spend()`. **`buildings.takeOverflow(item, qty)` must exist** so
`economy` can pour it back into storage as room appears. Conservation holds
either way — overflow is counted in `stockOf` — but the goods are otherwise
stranded and invisible to the player.

## G11. Town Centre pre-placement

`buildings.place()` checks `economy.available()`, so pre-placing the Town Centre
at boot fails with `'not enough timber'` against an empty stock. `main.js` must
seed the cost first (`buildings.deposit('wood', 30, …)`, `deposit('stone', 20, …)`),
let `place()` spend it straight back out, then `buildings.add(tc, item, qty)` for
`START_STOCK`. There is deliberately no free-placement path in `buildings.place`.

---

# ADDENDUM H — Military balance and the gate bug (FROZEN)

`military.js` simulated 5,600 raids across waves 1–40, 20 seeds and 7 town
states. The measurements below are real, not estimates, and they force four
changes. G1 (defence at tier 1) was necessary but **not sufficient** — measured
directly, a palisade is 60hp, which is six seconds of raider work, and walled
towns lost the same 5–9 buildings as unwalled ones.

## H1. The confirmed gate bug

**`world.gate[idx]` is `0` for a built gate.** `buildings.blocksEnemies(b)`
correctly returns `true`, and `paths.js` correctly reads the bitmap in enemy
mode — but nothing ever sets it. Measured live: ring a patch in palisade with
one gate, and `paths.find(outside, inside, {enemy: true})` returns a path
**through the closed gate**.

`military.js` is immune (it validates every route and re-plans on its own BFS —
11 illegal routes offered, 11 rejected, 0 raiders ever stood on the gate), so
the wall system works today. But every such call wastes a full-map BFS, and the
next module to trust enemy pathing would be silently wrong.

**Fix, in `buildings.js`:** on completion of any `def.gate` building, call
`paths.setGate(idx, true)` for every footprint tile, and `setGate(idx, false)`
on destruction — the exact parallel of the existing `paths.setSolid` call for
`def.solid`. This was in the handoff list from `world.js`/`paths.js` and was the
one line that did not get wired. It is the archetypal seam bug: two correct
modules, one missing call between them.

## H2. The militia gap (waves 2–4) — arms move to tier 2

**Measured:** with defence at tier 1 but every *arms* building at tier 3, the
only garrison possible between day 24 and day ~47 is tier-0 militia at power 4,
i.e. 0.4 dps each. Six of them need 104 seconds to kill four bandits while
taking 24 dps. Wave 2 ravaged 7 buildings and killed all six defenders; wave 3
ravaged 9. Walls did not change the outcome.

The design promise is that preparation wins battles. A window where no
preparation is *possible* breaks it. Overriding ADDENDUM A:

| id | was | now |
|---|---|---|
| `weaponsmith` | 3 | **2** |
| `armoury` | 3 | **2** |

And, because the arms chain bottoms out on iron (which needs the tier-3 Iron
Mine and Bloomery), **the spear becomes a wooden spear**:

| item | was | now |
|---|---|---|
| `spear` | 1 plank + 1 iron | **2 plank** |

A sharpened stake is exactly right for a hamlet, and it makes the tier-1 kit
reachable from timber alone: Sawmill → Weaponsmith → Armoury. `armourer` stays
tier 3, so early spearmen fight unarmoured; `EQUIPMENT_TIERS` already assigns
weapon and armour independently, so a spear-without-gambeson soldier is a valid
kit at roughly 2.5× militia power. Every other arms recipe is unchanged — steel,
mail and plate remain the mid- and late-game projects they were designed to be.

## H3. The raid curve must not run away before the endgame

**Measured** with `strength = 22 × 1.28^wave`: wave 20 = 3,125 (28 warlords),
wave 40 = **427,445**, which the 120-enemy spawn cap turns into an identical
unwinnable wall from wave ~30 on. The curve is fine through §15's horizon (City
by day 110 ≈ wave 10, comfortably held) and becomes impossible at wave 14–16,
around day 150.

**Frozen: the growth base becomes `1.17`.**

```js
strength = 22 * Math.pow(1.17, wave) + townValue * 0.035
```

Giving wave 10 ≈ 106, wave 20 ≈ 508, wave 25 ≈ 1,047, wave 30 ≈ 2,444. A
competent City (measured 245 dps / 10,310 hp) holds comfortably to wave ~20,
fights hard to ~25, and is overwhelmed around wave 30 — roughly day 270.

That is the intended shape of an endless game with pressure: **the town is
meant to fall eventually.** There is no win screen. The goal is to have the fall
arrive after a long, legible decline the player can see coming, not as a cliff
at day 150.

## H4. Guard towers must not out-perform soldiers

**Measured:** a Guard Tower's three archers deal 18 dps; a knight deals 5.2.
Four towers out-damage eighteen knights. That makes the entire equipment
system — the Armoury, the smiths, the steel chain, the thing the player spends
the mid-game building — strictly worse than four stone boxes.

**Frozen:**
- Soldier damage coefficient rises from `power × 0.1` to **`power × 0.22`**.
- Guard Tower archers fall from 6 dps to **4 dps** each (12 per tower).

A Guard Tower (3 jobs) now deals 12 dps; three knights (3 jobs) deal 34. The
investment pays, which is the point. `SOLDIER_HP` may need retuning against the
new coefficient — that belongs to the balance pass, which measures outcomes,
not to a guess here.

## H5. Decisions from `military.js` confirmed and frozen

- **`SOLDIER_HP = {base: 160, perPower: 3.2, shield: 26}`.** §10.5 never gave
  soldiers hit points; this is the free parameter that was swept to hit §17's
  "scary and survivable". Subject to the balance pass, not to redesign.
- **`held`/`ravaged` is decided on non-wall losses only.** Counting wall tiles
  would label every walled player "ravaged" after three palisades fell.
  `raid:ended` gains a `wallsLost` field alongside the honest `buildingsLost`.
- **`townValue`** = sum of building `cost` quantities + 3 × population. Using
  `ITEMS.value` would make one steel worth thirty planks.
- **Guard Tower garrisons do not sortie**; Barracks and Keep garrisons do.
  Tower archers stay and shoot, and are excluded from enemy soldier-targeting
  (they are inside a solid building, and targeting them stalls raiders).
- **Routed enemies ignore walls on the way out.** This is the only way to
  guarantee a raid terminates when the player has walled over the pass the
  raiders came from. They despawn on arrival or after 22s.
- **Kit recovery (50%) applies on `'held'` only** — §10.2 says "after a won
  battle".
- **Soldiers heal to full at raid start.** Wounds do not compound between raids.
- **`equipSoldiers()` is skipped while a raid is active** (a raid can span three
  in-game days, since `RAID_MAX_SECONDS` 180 = 3 × `DAY_SECONDS`).
- **`military.js` owns `game:over`**, not `economy.js`. Double emission would
  double the stats screen.

## H6. Two more cross-module fixes

- **Destroying a Guard Tower, Barracks or Keep must kill or evict its
  garrison.** Currently the workers survive the building and simply drop out of
  military's roster. `buildings.js` owns this, on destruction.
- **§10.1's peacetime patrol belongs to `villagers.js`.** `military.intentFor()`
  returns `null` outside a raid by design — villagers hold `VS.FIGHT` only while
  an intent exists, so a patrol intent would pin soldiers in combat forever.
  Idle `role: 'soldier'` agents should wander between their garrison door and
  the nearest gate as ordinary villager behaviour.

---

# ADDENDUM I — The tier/cost invariant, and post-fix interface changes (FROZEN)

## I1. A building may not cost what its own tier cannot obtain

Moving six defs down a tier (ADDENDUM G1, H2) silently made two of them
**unbuildable**, because their costs referenced items produced only by
higher-tier chains. This is now a permanent, checkable invariant:

> **For every building def, every item in its `cost` must be obtainable by a
> player who has only reached that def's own tier.** An item is obtainable at
> tier N if some def of tier ≤ N produces it, transitively.

`constants.js` carries a static check for this and it must stay green. It is
cheap, and it catches an entire class of unbuildable-content bug that no
gameplay test will find — the player simply never sees the building work and
has no way to know why.

Three corrections it forced:

| def / item | was | now | why |
|---|---|---|---|
| `barracks` cost | `{wood:20, plank:10, stone:8}` | `{wood:45, stone:12}` | `plank` needs the tier-2 Sawmill, and 10 plank is the *entire* `START_STOCK`. A tier-1 Barracks was unbuildable. |
| `weaponsmith` cost | `{plank:12, brick:8, stone:6, tools:2}` | `{plank:14, brick:8, stone:8}` | `tools` needs iron → tier-3 Iron Mine + Bloomery. A tier-2 Weaponsmith could never exist, which would have silently voided H2. |
| `spear` value | 34 | **18** | Its inputs fell from 26 (plank+iron) to 12 (2 plank) when it became a wooden spear. At 34 a Weaponsmith was a 2.8× coin printer at the Trading Post. 18 matches the ~1.3–1.5× crafted markup every other arms recipe uses. |

The `spear` value change is a knock-on, not a line in ADDENDUM H, and is
recorded here so the balance pass does not "restore" it.

## I2. Interface changes from the fix round

- **`buildings.siteNeedsAnyBuilder(b) -> bool`** is the published name for
  G2.3, alongside a live per-tick flag `b.needsAnyBuilder` and
  `buildings.SITE_STALL_SECONDS` (= 10). It is true only when
  `!built && active && deliveredComplete && 10s since the last applyBuilder`,
  and `applyBuilder()` resets it immediately — so it is an **entry** condition,
  not a sustained one. `villagers.js` still owns the other half of the test
  (is *this* villager's own workplace idle) and must pass `unemployed = true`
  to `applyBuilder`.

- **`buildings.damage(id, n, true)` now kills the garrison itself** for every
  worker of a `role:'soldier'` building (Barracks, Guard Tower, Keep), via
  `villagers.kill(id, 'raid')`. A demolish or a non-raid destruction evicts via
  `villagers.loseJob(agent)` instead. **`military.js` must NOT also kill them**
  — doubling it double-counts §9.6's raid grief.

- **`buildings.capacityFor(b, item)` is the only correct source of storage
  room.** With per-class caps (G3), `storage.cap - invCount` is now wrong for
  the Town Centre, the Warehouse and the Trading Post. Any module computing
  room arithmetically is wrong.

- **The Warehouse now also stores `arms`**, so
  `buildings.nearestStorage('spear', …)` can legitimately return a Warehouse
  rather than the Armoury.

- **`paths.find(..., {enemy:true})` is now trustworthy** (H1 is fixed and
  proved against the real stack: a sealed ring returns `null` for enemies while
  villagers still path through the gate; destroying the gate opens the enemy
  route through that tile). `military.js` may keep its defensive re-plan, but it
  is no longer load-bearing.

- **`ui.js`**: the `'no storage'` label becomes *"No storage with room for
  this"* and must append the class from the parameterised reason, so the player
  can tell Granary from Stockpile.

---

# ADDENDUM J — Villagers eat at home; storage monopoly (FROZEN)

## J1. The measurement

`economy.js` reported gathering huts producing 0.5–7 units/day against a
documented-seam rate of ~45–53/day, and correctly filed it as a lead rather
than a finding. Measured directly, with a Woodcutter sited on 69 trees, roaded,
fully staffed, over 20 game-days — here is where a forester's day actually goes:

| activity | share of worker-seconds |
|---|---|
| **eating** | **44.7%** |
| walking | 33.1% |
| asleep | 14.5% |
| going home | 7.3% |
| **working** | **0.2%** |

Output: **0.20 wood/day.**

The cause is not the gather loop, the pathfinder, or the working-day window.
It is §8.3: a villager walks to a **market or granary** every time hunger
passes 0.55. Hunger rises 1.0/day and a meal removes 0.6, so that is ~1.7
round trips per villager per day, across the whole map, in daylight — the only
hours in which they could otherwise work.

For context, the daylight budget is `(0.88 − 0.22) × 60 = 39.6` game-seconds
per day. One gather round trip costs 9.2s on cobble, 11.3s on dirt, 22.2s
off-road. There is no room in that budget for two cross-town meals.

## J2. The fix: food comes to the villager, not the villager to the food

**Frozen — this supersedes §8.3's eating rule:**

1. **Houses hold food.** Every housing def gains a small food buffer
   (`foodCap: 6` units). It is ordinary building inventory, subject to the
   ordinary inventory API.
2. **A new haul task kind, `'feed'`**, delivers food from a Market (preferred)
   or a Granary to houses whose buffer is low. Its priority sits **between
   `build` and `supply`** — a hungry town outranks a stocked workshop but not a
   half-finished building. All of §9.3's anti-bug rules apply to it unchanged.
3. **Villagers eat at home, in the evening**, as part of the existing walk-home
   cycle. No dedicated daytime trip. A villager arriving home hungry eats from
   the house buffer.
4. **Fallback, to preserve §16:** if a villager's house has no food, or they are
   homeless, they walk to the nearest Market or Granary exactly as before. The
   old behaviour remains as the safety net; it stops being the common case.
5. Hunger and meal sizes are retuned so a fed villager eats **once per day, at
   home**, rather than ~1.7 times mid-shift.

This is the standard model for the genre, and it earns its keep three ways
beyond the fix: the **Market finally matters** (it is the distribution hub, not
a vending machine), **housing placement matters** (a house far from a market
starves), and the **logistics network becomes the heart of the game**, which is
what §9.3 always claimed it was.

`villagers.js` owns 3 and 4; `economy.js` owns 2 and 5; `constants.js` owns 1.

**Re-measure after this lands.** If a worker still cannot complete ~3 gather
round trips per daylight period on a dirt path, the next lever is
`DAY_SECONDS` (60 → 100) and widening the work window to 0.20–0.90, in that
order. Do not touch either until the eating fix is measured.

## J3. One item may not monopolise a storage class

ADDENDUM G3 stopped a *class* from starving another class. It did not stop a
single *item* from starving its own class, and measurement shows that is just as
fatal:

> At the plateau, the good class sat 508/575 full of **stone (374) and hide
> (100)** — neither of which anything consumes at tier 2. `roomForClass('good')`
> was **0 from day 20 to day 120**. Wood was pinned at 6–7 for a hundred days
> because the Woodcutter was `'output full'` with nowhere to haul. Every unlock
> was then blocked *on wood*: a Chapel needs 14 wood and 12 stone, with **374
> stone sitting in the stockpiles**.

Pausing the Quarry does not help — it stops more stone arriving, but the 374
already stored never leaves.

**Frozen, two parts:**

1. **No single item may occupy more than 40% of a store's capacity for its
   class.** A Stockpile (300 good) therefore caps stone at 120 and always keeps
   room for timber. `buildings.capacityFor()` enforces it, so every caller gets
   it for free.
2. **The player can discard.** The inspector's inventory rows gain a discard
   action that destroys a chosen quantity of a chosen item from that building.
   This is the one place in the game where matter is deliberately destroyed, and
   it is the §16 escape hatch of last resort: a town can always unwedge itself.
   It must confirm, and it must never be the *suggested* fix in an alert.

`hide` accumulating from tier 1 with no sink until the tier-3 Tannery is a
related smell; the 40% cap contains it, and no further change is made.

---

# ADDENDUM K — Raid composition, wall doctrine, and labelling (FROZEN)

The H3/H4 re-sweep met its targets: a §15-competent town holds comfortably to
wave 20, fights hard to 25, and is overwhelmed around wave 30 (day ~270), losing
0 → 0 → 0.5 → 3.9 → 9.2 → 33 buildings across waves 12/16/20/25/30/40. That is
the legible decline H3 asked for. Four things it exposed are fixed here.

## K1. H2's premise was false about the code

ADDENDUM H2 asserted "`EQUIPMENT_TIERS` already assigns weapon and armour
independently". It did not — `_bestKitFrom` required **both** halves of a tier
and fell through to tier-0 militia otherwise. Since `gambeson` comes only from
the tier-3 Armourer, H2's timber-only spearman would have equipped as **power 4
militia** and the whole of H2 would have been a no-op.

Now fixed and frozen: **weapon and armour are ranked and taken separately. The
weapon sets power; the armour sets hit points.** A spear with no gambeson is a
Spearman (power 10, 132hp). Kit tier is the highest §10.2 row accepting both
halves, else the weapon's own rank.

**§10.2's tier-3 row lists `sword` as well as `crossbow`, making `sword`
ambiguous between tiers 2 and 3. Frozen resolution: a sword alone is a
Swordsman's; a sword with mail is a Man-at-arms'.**

This is a lesson about the contract, not about the code: an addendum must not
assert what another module already does. State the requirement; let the owner
confirm it.

## K2. A wave must field a force that can fight

**Measured:** waves 8–11 cost a §15-competent town *literally nothing* — zero
men, zero buildings, raids over in 48 seconds. The cause is not the curve. Wave
8's budget of 133 bought **two rams and a bandit**, and a `ram` does damage to
buildings only. The greedy spend was buying siege engines to fight soldiers.

**Frozen:**

1. **At most 25% of a wave's strength budget may be spent on units that cannot
   fight soldiers** (currently `ram`, i.e. anything `vsBuildingsOnly`).
2. **At least 50% must be spent on units that can.**
3. A wave must field a credible **number** of bodies, not one expensive unit —
   enforce a minimum count that scales with the budget.

A siege train is a threat *accompanied* by an army, never instead of one.

## K3. Walls must not cost the defender men

**Measured:** building a palisade made wave 1 *worse* — 3.3 men lost walled
versus 1.8 unwalled, and the raid took longer. Soldiers sortie at
`SOLDIER_RESPONSE = 25` regardless of fortification, so they file out through
their own gate and fight in the open, surrendering exactly the advantage the
player paid for. That is a direct violation of "peace is preparation", and of
§17's "when you lose a building to a raid, do you know why".

**Frozen wall doctrine:** while a wall/gate perimeter stands between a soldier
and an enemy, the soldier **holds the line** — it intercepts enemies that are
already inside the perimeter, and otherwise musters at the nearest gate rather
than walking out through it. A soldier only fights beyond the wall when there is
no intact perimeter between them and the enemy.

Militia drafted under §10.6 are exempt: they are civilians with pitchforks and
have no doctrine.

## K4. `'ravaged'` must mean the town was ravaged

§10.5.7's `losses >= 5` labels a raid "ravaged" when a 30-soldier garrison loses
six men and **not one building burns** — which is what waves 16–20 actually do.
The player is told a disaster happened while looking at an untouched town.

**Frozen, superseding §10.5.7's threshold:**

```
ravaged  if  nonWallBuildingsLost >= 3
         or  villagersLost >= max(5, population * 0.15)
held     otherwise
```

Wall tiles never count toward `buildingsLost` for this decision (H5 already
established this; K4 extends it to the villager clause). `raid:ended` keeps
carrying the honest raw `buildingsLost` **and** `wallsLost` so the UI can
report "5 buildings lost, of which 5 were palisades doing their job".

## K5. Scarce kit goes to the men who fight

`_equipOrder` ranks garrisons by **building tier**, so a Guard Tower (tier 3)
outranks a Barracks (tier 1) for scarce equipment — and by H5, tower archers
never sortie. Measured: 12 knight kits across 24 soldiers and 9 archers put 12
on the Keep, **0 on the Barracks, 0 on the towers**, but the ordering is wrong
in principle and bites whenever kit count falls between the Keep's capacity and
the towers'.

**Frozen: sortieing garrisons (Barracks, Keep) are equipped before
non-sortieing ones (Guard Tower).** Within each group, larger garrisons first,
as now.

## K6. UI consequences

- **A kit may now be partial** — `weapon` without `armour`, or the reverse.
  `kit.name` comes from the weapon, so a spearman with no gambeson still reads
  "Spearman", and **`kit.maxHp` no longer tracks `kit.power`**. Any UI that
  renders a kit name and infers the armour, or derives hit points from power,
  is wrong.
- **Show `buildingsLost - wallsLost`** as the headline and mention walls
  separately. The raw total tells a walled player they lost five buildings when
  five palisades did precisely their job.
- **`raid.losses` now includes garrison members killed by their building
  collapsing** (it was silently under-reporting, and their kits leaked). Expect
  post-raid death counts and §9.6 grief to rise for raids that flatten a
  Barracks or Keep. That is the correct number, not a regression.

---

# ADDENDUM L — The subsistence trap (FROZEN)

Measured on the assembled game (seed 1234, raids disabled, scripted competent
opening: Granary, Forager, Hunter, Fisher, 3 Cottages, roads laid, 12 villagers):

| day | pop | food units | produced/day | eaten/day | groups | items |
|---|---|---|---|---|---|---|
| 5 | 12 | 38.0 | 9.2 | 10.4 | 1 | 1 |
| 11 | 12 | 30.0 | 6.0 | 12.0 | 1 | 1 |
| 15 | 12 | 32.4 | 4.6 | 4.0 | **0** | **0** |
| 21 | 12 | 30.0 | 10.6 | 8.0 | **0** | **0** |

The town neither starves nor grows. It is stuck, and two independent causes
compound:

## L1. A food worker feeds fewer than two people

Five food workers across a Forager, a Hunter and a Fisher produce **~9
nutrition units per day** against a 12-person town eating ~12. Every villager
the town gains must immediately be put on food, so labour can never be freed
for industry, construction or a garrison. §15's trajectory is arithmetically
impossible from here, regardless of how well the player plays.

**Frozen target: one food worker feeds four to six people.** That is what
leaves a town the slack to build anything at all.

The lever is **yield per round trip**, not radius or harvest time — a gatherer's
day is dominated by travel, so paying more per trip is the change that scales
with distance instead of fighting it. Food `gathers.yield` rises accordingly
(Forager 2 → 5, Hunter 1 → 3, Fisher 2 → 5 as the starting point), and the
balance pass measures the ratio rather than assuming it.

**Non-food gathering is not changed.** Timber and stone throughput measured
fine (wood grew 23 → 47 over ten days on one hut); this is specifically a food
problem.

## L2. Variety must measure what the town *eats*, not what it hoards

§9.4 computes `varietyScore` from `stored(item) >= 4`, where `stored()` counts
**storage buildings only**. Since ADDENDUM J2, food flows Granary → house
larder → villager, so a working subsistence economy holds almost nothing in
storage at any instant. Measured: 22–46 nutrition units present in the town and
`distinctGroups === 0`, because none of it was sitting still.

Health target is therefore `22 + 0 × 0.62 = 22`, which is below §9.5's birth
gate of 35 **and** below tier 2's gate of 45. A town eating four different foods
every day was scored as eating nothing.

**Frozen, superseding §9.4's counting rule:**

> A food item counts toward variety if `stored(item) >= 4` **OR** it was eaten
> anywhere in the town within the last 3 days. Groups are counted from the
> items that qualify.

This is truer to the design's own words — "their healthiness will be determined
by the variety of food available" — and it cannot be gamed by hoarding, because
eating is what qualifies an item. It also makes the §13 health tooltip more
honest: it can name what the town actually ate this week, not what happens to be
sitting in a granary.

`economy.js` keeps a 3-day rolling set of eaten item ids, fed by the existing
`onVillagerAte` hook. `ui.js`'s variety breakdown reads the qualifying set
rather than re-deriving it from `stored()`, so the meter and the tooltip cannot
disagree.

## L3. Consequences to re-check after L1 and L2

- Health should clear 45 (tier 2) for a competent player by roughly day 18, and
  the §15 table becomes reachable again. If it does not, report it — do not
  retune §15.
- `'output full'` on a food gatherer with a Granary standing and idle porters
  is a **separate** defect seen in the same run (a Forager sat on 16 berries at
  `'output full'`). It is a logistics bug, not a balance number, and must be
  diagnosed rather than tuned around.
- The birth gate at health 35 and tier 2's gate at 45 are unchanged. They were
  never the problem; the health *input* was.

---

# ADDENDUM M — Why L1 failed, and the real levers (FROZEN)

ADDENDUM L1 named `gathers.yield` as the lever for food throughput. **Measurement
disproved it**, and the disproof is more useful than the fix would have been:

> Output is **flat** across yields 5 → 16. `world.harvest(idx, n)` returns
> `min(n, amount[idx])`, and `findResourceNear` always returns the *nearest
> non-empty* node — so a gatherer drains its closest tile and thereafter lifts
> only that tile's regrowth. Measured average-per-trip against `yield`: forager
> 4.9 @5, 4.7 @10, **5.3 @16**. Above the node's regrow rate, `yield` is inert.

L1's target (one food worker feeds 4–6 people) stands. Its lever does not. The
raised yields (forager 5, hunter 3, fisher 5) are kept — they are necessary but
not sufficient — and four further levers are frozen here, in the order they
matter.

## M1. A gatherer must be able to pick up a full load

`world.findResourceNear` must prefer **the nearest node holding at least a full
`yield`**, falling back to the nearest non-empty node only when none qualifies.
Without this, `yield` above the regrow rate does nothing and the whole
food-per-trip lever is dead. This also spreads harvesting across a resource
patch instead of hammering one tile, which is both better-looking and better
economics.

## M2. The working day is too short for a walking simulation

**Measured round trips:** forager 32.8s, hunter 57.8s, fisher 18.8s, against a
daylight budget of `(0.88 − 0.22) × 60 = 39.6` game-seconds. Completed trips:
**0.20–0.47 per worker per day.** ADDENDUM J assumed ~3. A hunter literally
cannot complete one round trip in a day.

Frozen, both parts (J2 pre-authorised this once eating was measured, and it now
has been):

- **`DAY_SECONDS` 60 → 100.**
- **The work window widens from 0.22–0.88 to 0.18–0.92** (`NIGHT_START` /
  `NIGHT_END` in `villagers.js`).

That takes the daylight budget from 39.6s to **74s**, a 1.87× increase.
Pacing cost is accepted: this is an endless sandbox with localStorage
persistence, and §15's day numbers are unchanged.

## M3. Roads are the real multiplier — and an unroaded hut must SAY so

Roading each hut until `b.connected` took trips from 0.2–0.5 to **1.5–3.7 per
worker per day**, and the people-fed-per-food-worker ratio from **0.71 to 3.66**.
The road mechanic works exactly as §6 intended.

But the failure mode is invisible, and that is a Tier-1 bug against §13 and
§16.8:

> `buildings.doorTile()` falls back to the building's own corner tile when it
> has no road adjacency. That tile is **solid** — no villager can stand on it.
> The hut's workers therefore walk to the node and back forever, `gatherComplete`
> never fires, `producedTotal` stays 0, and **`idleReason` is `''`** — the
> building reports itself as working. Measured: a Fisherman's Hut, 20 days,
> 35.7% of worker-seconds walking, **0 units produced, no UI signal.**

**Frozen: a building with no reachable door reports `'no road'` and does not
employ workers.** §16.8 requires every stopped building to name its reason; a
building that is stopped and claims to be fine is the worst case in the game.

## M4. A starving town must staff its food buildings first

`villagers.assignJobs()` sorts openings by player `priority` (default 1 for
everything) then by `b.id` — i.e. **build order**. Measured at pop 10: final
roles `{soldier: 3, porter: 4, forester: 1, forager: 2}` — **two** food workers
for ten mouths, with an idle Hunter's Lodge and Fisherman's Hut standing.

**Frozen: when `daysOfFood` is low, food-producing buildings outrank storage,
garrison and civic slots in job assignment.** The threshold and the ordering are
the implementer's to choose and measure; the guarantee is that a town with
staffed granaries and an empty hunting lodge while it starves is a bug.

## M5. `chooseFood()` reads the wrong field

`villagers.js` `chooseFood()` and `eatAt()` read `def.foodGroup`; the field is
`def.group`. `gi` is therefore always −1, `v.groupLast` is never written, and
**group rotation never fires** — villagers always eat whatever there is most of.

This silently undercuts §9.4's central claim and L2's premise: variety cannot
emerge from behaviour if the behaviour never varies. Two-word fix, inside the
untested ADDENDUM J code.

## M6. L3's root cause, recorded

`economy._generateStoreTasks()` compared each item against
`buildings.outputFillRatio(b)`, which pools every declared output into one
bucket of `outputCap × (number of outputs)`, while `capacityFor()` caps each
item at `outputCap` individually. **A building with two outputs therefore could
not reach the 50% trigger on one item at all.**

Measured over 1,200 rebuilds: the Hunter's Lodge (venison + hide) generated
**zero** store tasks in its entire life; the single-output Fisherman's Hut was
always fine. That asymmetry was the fingerprint. Fixed by measuring the trigger
per item against that item's own `outputCap`.

## M7. `claimTask` distance-blindness (noted, not yet frozen as a bug)

`economy.claimTask()` scores `kindRank * 1000 + d`, so a `feed` task beats a
`store` task at *any* distance — a house 40 tiles away outranks a granary run
next door. Not L3's cause, and not changed, but it is the next thing to look at
if porters appear to be doing something daft.

---

# ADDENDUM N — Adversarial QA findings (FROZEN)

An independent, report-only QA pass drove the real modules through `main.js`
for ~2,960 audited town-days. It found two Tier-1 soft-locks, invalidated the
project's balance data, and confirmed a great deal else genuinely works.

## N0. Every prior balance number was measured with free materials

The scripted-player harness set `b.built = true; b.progress = 1e9` immediately
after `buildings.place()`. Because `reservedOf()` skips built buildings and
`b.delivered` is never filled, **nothing was ever paid for** — no materials, no
construction time, no haulage. Four rounds of §15 and food-ratio numbers were
measured in that game, including ADDENDUM M's.

Honest numbers (real sites, real hauling, roads bought at 1 wood/tile):

| metric | claimed | honest |
|---|---|---|
| food worker feeds | 3.70 | **2.22** (1.12–3.20) |
| 12 pop + 3 foods (target day 8) | day 3 | **day 16–48** |
| Village, tier 2 (target day 18) | day 9 | **day 40–53, or never (3/6 seeds)** |
| Town, tier 3 (target day 45) | day 35 | **never** |
| raids on, 4 seeds | peak pop 47 | **all four wiped, end pop 1** |

**Frozen rule: a balance harness must pay for what it builds.** Any measurement
taken with instant or free construction is inadmissible, and §15 is not to be
retuned against one. §15 stays as written until the Tier-1 defects below are
fixed and the table is re-measured honestly.

## N1. §16.1's hand-gather is dead code — a real, fast soft-lock (TIER 1)

`economy.handGatherAllowed()` exists and returns correctly. **Nothing calls it.**
`villagers.js` has no hand-gather behaviour at all.

Reached by ordinary play in about two minutes: spend the opening timber on
cottages, as a new player does. Once `available('wood')` hits 0 with no
Woodcutter standing, a path tile costs 1 wood and a Woodcutter costs 8, so
`canPlace` check 7 refuses **every def in the roster**. Measured: 8 idle
villagers stood beside 70 forest tiles for 40 days while the town starved to
population 0, with `handGatherAllowed() === true` throughout.

**Fix: implement it in `villagers.js`.** An idle villager, when §16.1's
condition holds, walks to an adjacent forest tile and gathers 1 wood per
`HAND_GATHER_SECONDS`. This is the guarantee that makes the game recoverable
rather than merely hard.

## N2. One road tile can take the whole town permanently dark (TIER 1)

`buildings.computeDoor()` picks the road-adjacent footprint tile with the lowest
`(tx+ty)` **with no reachability check**. `hasDoor(b)` for every building is
`paths.sameRegion(b.doorIdx, townDoor())`. So if the **Town Centre's** door
lands in a walled-off pocket, every building in the valley fails `hasDoor`,
reports `'no road'`, dismisses its workers, and `assignWorker` then refuses to
re-staff them. The town freezes: no production, no construction, no employment.

Measured on a plain 16-building order with roads maintained: **5 of 8 seeds**
lost 7–16 of 17 buildings this way, permanently. One seed sat frozen from day 20
to day 96 — population 22, health 22, zero food produced for 76 consecutive
days, and `starvingDays = 0` so the starving alert never fired.

Two aggravations make it worse than an ordinary bug:

- **`b.connected === true` while the reason is `'no road'`.** `isConnected`
  answers "touches a road"; `hasDoor` answers "reachable from the Town Centre".
  Two different questions share one message, so the player lays more road — the
  named remedy — and nothing happens. That is a §16.8 violation in substance.
- The fault is at a *different building* (the Town Centre) from the one
  reporting it.

**Frozen fix, three parts:**
1. `computeDoor()` must prefer a road-adjacent tile that is **reachable from the
   town**, falling back to any road-adjacent tile only if none is.
2. The Town Centre's door must be re-evaluated whenever roads change near it,
   and a Town Centre whose door is unreachable is a bug to be corrected, never a
   state to propagate to every other building.
3. **`'no road'` and "cut off from the town" are different idle reasons.** Add
   `'cut off'` to §7's frozen set, with its own remedy text ("this building has
   a road, but no route back to the town centre — connect the two"). A player
   must never be told to do something they have already done.

## N3. Save robustness (TIER 1 / TIER 2)

- **A save truncated by one tile in `world.resource` is accepted, then throws
  once per game-day forever.** `world.restore()` length-checks only `terrain`;
  the other eight layers silently accept a short array and `regrow()` then reads
  `RESOURCE_INFO[undefined]`. **Every world layer must be length-checked**, and
  a failure must reject the save.
- **`restoreGame()` throws on 11 of 43 corrupt blobs and returns `false` for
  none of them.** Past the `save.world` gate there is no rejection path at all.
  It needs its own try/catch and must return `false` rather than half-applying.
- **`SAVE_VERSION` is written and never read.** A `v` mismatch must discard the
  save with a toast, per §14.
- **Corrupt scalars survive and poison live state permanently** — `happiness`
  becomes `NaN`, `coin` becomes a growing string, buildings hold negative stock.
  `townHealth = NaN` is the worst: every `townHealth < X` comparison is then
  false, so game-over can never fire. Guards are inconsistent *within a single
  object literal* (`hp` is type-checked, `progress` on the next line is not).
  **Type-check every restored scalar.**
- Four timers (`v.eatUntil`, `v.arriveTimer`, `v.leaveTimer`, `b.scanTimer`) and
  the whole of `economy.nutrition` are not serialized, so happiness is computed
  from zero variety for up to a day after each load. This is also why **saving
  and reloading mid-raid changes the outcome in ~40% of cases** — save-scumming
  a raid works. Serialize them.

## N4. The 50% loot rule has two owners (TIER 2)

`military._damageBuilding` calls `_loot()` (taking 50%) **and then**
`buildings.damage()`, which also takes 50%. The town loses **75%** of a
destroyed building's stock, and the raid report under-counts what left by a
third. **`buildings.damage()` owns it; `military._loot` must go.**

## N5. Feed tasks starve the production chains (TIER 2)

`_generateFeedTasks()` runs before `_generateSupplyTasks()` and claims every
unit of grain in storage for house larders. `_findSource` only ever looks at
storages, never at a producing building's own buffer. Result: a Wheat Farm sits
`'output full'` with 24 grain while a Windmill 15 tiles away reports
`'no materials: grain'` and idle porters stand between them. Measured: **0 bread
in 110 days**, the Chicken Coop received **zero** grain in 80 days, and the pair
was the most-repeated stopped-building pair in every long run.

**Frozen, two parts:**
1. A `'feed'` task may not claim an item that a **built, active production
   building is currently short of**. Larders come after the chains that fill
   them; a town that eats its seed corn produces no bread.
2. `_findSource` must be able to pull from a producer's output buffer, not only
   from storages. A full buffer 15 tiles away is not invisible stock.

## N6. Raid labelling and the draft (TIER 2)

- **`forcedConscript` drafts 0 at population 1–3** (`floor(pop * 0.3)`), and
  skips everyone under 16, so an all-child town drafts nobody. §16.6 promises a
  town always fights back. **Floor the draft at 1 whenever any villager lives.**
- **A raid that razes the entire town reports `'held'`** — a town with fewer
  than 3 non-wall buildings can never trip K4's first clause. **Add: if the town
  has no non-wall buildings left, or lost all of them, the raid is `'ravaged'`.**
- **K4's villager clause divides by the population *after* the deaths**, so the
  threshold deflates exactly when losses are heaviest. **Use the population as
  it was when the raid started.**
- **No re-draft when the garrison is wiped mid-raid** — flattening the Barracks
  three seconds into a wave leaves 0 defenders for ~110s with 20 adults idle.

## N7. Winter does nothing — and the cause is §5, not a bug (TIER 3)

Measured food/day across the year-1 Winter: Autumn 22.4 → Winter 22.7. Nothing
happens.

**My first diagnosis was wrong and is corrected here:** `winterMult` *is*
applied (`buildings.js:1417`), and the roster values are faithful to §5 —
forager 0.5, fisher 0.5, herbalist 0.5. The real cause is §5's own rule that
**"Hunting is unaffected"**, combined with `grows` buildings being tier 2+.

So a tier-1 town's winter looks like this: its `grows` buildings do not exist,
its berries and fish halve, and its Hunter's Lodge — the single best tier-1 food
source — carries on at full rate. Consumption rises 25% and production barely
moves. Winter is a recolour.

**Frozen: game is thin in winter too. `hunter.gathers.winterMult` becomes 0.6**,
overriding §5's "hunting is unaffected". With forager and fisher at 0.5, a
tier-1 town now loses roughly 45% of its food production while eating 25% more —
which is the pressure the season was always supposed to apply, and the reason
granaries and the tier-2 farm chain are worth building.

This is a design decision, not a bug fix: §5's exemption made the one
winter-proof food the easiest one to get.

## N8. Confirmed working — recorded so it is not re-litigated

Per-item conservation is **exact** across ~2,960 audited town-days and ~2,000
destructive operations (stone never became planks). Zero NaN/Infinity/negative
anywhere. Zero illegal `idleReason` strings. **Raids always terminate** — 890
raids including maximally pathological towns, `hardEnds: 0`. **H1's gate fix is
real** (`badEnemyPaths === 0` across ~1,700 raids). **K3's wall doctrine holds**
— 64 matched pairs, walls cut building losses 36% at no cost in men, 0.0
soldier-seconds spent outside the perimeter. `game:over` fires exactly once.
Save round-trip on a healthy save is exact across 64 trips and 2.24M steps.
§16.3/16.4/16.5/16.9 all hold. M3's silent-stall fix is genuinely gone (longest
silent stall 74s = exactly one daylight window). M5's group rotation is real and
emergent — though its published distribution does not reproduce, and **dairy
never appeared in any run**, because honest play reaches only 3–4 food groups.

The earlier `economy.alerts === []` observation was **reading the wrong field**:
`ui.collectAlerts()` unions it with every building's `idleReason`, and the UI
panel was never empty across 570 town-days. §16.8 is intact on that axis.

---

# ADDENDUM P — The dead-town soft-lock, and the unaffordable Barracks (FROZEN)

An independent browser playtest played real sessions end to end. Its verdict:
*"fun for about eleven days, and then it kills you and the corpse won't lie
down."* Two Tier-1 failures cause that, and they compound.

## P1. Losing every storage building bricks the town permanently (TIER 1)

This is the **default outcome of the day-12 raid**, not an edge case.

When the last storage building falls, the town's entire wealth lands in
`buildings.overflow` — the never-destroy refund pool. G10 says it drains "by
porters or into storage as room appears", but with **zero** storages there is no
room and it can never drain. And `_findSource` only searches storages and
producer output buffers, so overflow is invisible to the task queue.

Measured: a connected Stockpile site, 10 idle villagers, `economy.tasks = 0`,
zero builders assigned, `delivered = {}`, for 56 game-seconds and counting.
Organically at day 17: 13 villagers all IDLE at `hunger: 1.00`,
`consumedYesterday: 0`, `starvingDays: 0` so the starving alert never fires,
nobody ever dies, `game.state === 'playing'`. A stable dead town.

The alerts panel meanwhile advises: *"10 villagers have no work — Place a
workshop or a **Stockpile**."* It recommends the one action that cannot work.

Violates §16.3 (unemployed villagers always build), §16.8 (a site reporting
`'under construction'` that will never advance), and G10.

**Frozen fix: overflow is goods lying in the town, not goods in limbo.**

1. `buildings.overflow` has a **notional location** — `world.start`, the town
   centre's tile. Goods in it exist at a place on the map.
2. **`_findSource` may source build and supply tasks from overflow**, at that
   location. A villager walks there and picks them up like any other haul.
3. `economy.handGatherAllowed()` gates on `stock('wood') > 0`, which is true
   while wood is stranded in overflow — so §16.1's floor stays shut precisely
   when it is needed. **Gate it on `available()` instead**, and per the earlier
   finding, on being **below the cheapest wood-producing building's cost plus a
   road allowance (≈10)**, not on being exactly 0. A town holding 7 wood and no
   Woodcutter is as stuck as a town holding none.

## P2. The Barracks is unlocked at tier 1 but not obtainable (TIER 1)

ADDENDUM G1 moved defence to tier 1 so the first raid could be met with agency.
ADDENDUM I1 then repriced the Barracks to `{wood: 45, stone: 12}` because planks
need the tier-2 Sawmill. **45 timber was my substitution and it is too much.**

Measured across two honest playthroughs with two roaded Woodcutters running:
wood **never exceeded 27 at once** by day 12. So the Barracks cannot be built
before wave 1, and the outcome is binary:

| garrison | result |
|---|---|
| emergency draft, 5 militia | **ravaged** — 10 buildings burned, 5 dead, Town Centre gone → P1 |
| Barracks garrisoned, 6 soldiers | **held** — zero buildings lost |

**Frozen: `barracks` costs `{wood: 24, stone: 8}`.** That is reachable by day 12
on a competently-played opening and still a real investment for a hamlet — it is
roughly a day's output from two Woodcutters, spent instead of on housing.

G1's promise was that preparation wins the first raid. A price the tier-1
economy cannot pay is not a choice, it is a coin flip.

## P3. Placement refusals all say "blocked" (TIER 2)

`canPlace` computes genuinely good reasons — `'needs rock'`, `'needs shore'`,
`'needs flat ground'`, `'not enough timber'`, `'locked'` — and then
`buildings.lastError` is set to `'blocked'` in every case, which is what the
toast shows. §1's priority 2 is thrown away one line before the finish.
**`lastError` must carry the real reason.**

## P4. Smaller, all measured

- **The Town Centre is offered in the build menu.** It is `unique, prePlaced`,
  so clicking the map does nothing at all — no building, no toast,
  `lastError === ''`. `ui.chooseBuild` only tests `def.tier > tierNow()`; it must
  also respect `unique`/`prePlaced`.
- **Happiness cannot answer §17's first question.** The meter shows a number and
  one word. `economy.happinessParts` already carries the full breakdown
  (`housingScore`, `marketAccess`, `civicScore`, `homelessPenalty`, `raidGrief`,
  `unemployedPenalty`, `arrears`) and `ui.js` never reads it. This is the
  cheapest high-value fix in the report.
- **All §13 hotkeys fire while the intro modal is open.** `input.js` honours
  `ui.modalOpen`; `ui.js`'s own `handleKey` does not check it. A new player
  tapping keys to skip the intro lands in a paused game with demolish armed.
- **The minimap is 71% covered by the build menu at 1024×700** — the exact size
  §13 calls out — and its viewport rectangle is drawn unclipped, so it escapes
  the minimap box at low zoom.
- **Demolish is one click with no confirmation**, beside Pause, same size. The
  discard dialog by contrast was judged airtight; demolish should match it.
- **Day 1 reads "0 of 6 food groups" while 42 food units sit in the Town
  Centre**, because `computeNutrition()` first runs on `day:ended`. It also
  claims "settling toward 60" when the formula gives 22. Self-corrects on day 2,
  but it is the player's first screen. **Compute nutrition once at boot.**
- **Construction sites are indistinguishable brown pads** — six simultaneous
  sites read as identical flat slabs. §1 puts readability above prettiness and
  this is the one place the art loses.
- `R` twice does not cycle dirt → cobbled (ui owns the key, `input._roadCycle`
  is dead code); Escape mid-drag cancels the drag *and* drops the tool in one
  press, contra F2's one-step-at-a-time backout; the game-over screen has no
  "Start again"; the minimap is not clickable.

## P5. Recorded as working, so it is not re-litigated

Pillar 1 is **real**: following one villager for 60 seconds gave a coherent
story, and the tester found three fish in a cottage larder delivered by a named
porter. The road lesson is the best-taught mechanic in the game — measured,
an unroaded Woodcutter produced 0 wood in 40s, and roaded it produced 8 by +40s
with the idle reason walking `'no road' → 'no workers' → 'night' → ''`. Tier-up
is an event. The alerts panel, the inspector and the discard dialog were all
praised specifically. The variety/health tooltip agrees with itself to the pixel
(meter fill measured 48.0% against `townHealth 48.35`). Layout is clean at
1440×900, 1280×800, 1024×700 and 900×600. Zero console errors across ~90 minutes
of play. The art holds up, and the day/night re-alignment checks out —
villagers are not working blind.

---

# ADDENDUM Q — The hunger livelock, and three recovery blockers (FROZEN)

P1's fix (overflow is goods on the ground, sourceable by haul tasks) is verified:
a town that loses every storage now rebuilds instead of freezing. But the P1
report surfaced the **other half of the same dead town**, and two things that
stop a burnt-out town rebuilding at all.

## Q1. Villagers livelock when no food is reachable (TIER 1)

`villagers.js:999` calls `releaseTask(v, 'starving')` every `EAT_COOLDOWN`, and
that cooldown is **shorter than a haul takes**. So a hungry villager claims a
task, drops it to go looking for food, finds none, claims again, drops again —
forever.

Measured on a post-raid town: **52 `'starving'` cancels against 2 completions in
300 game-seconds**, four villagers each holding goods they never deliver, all at
`hunger: 1.00`, with `starvingDays: 0` and `hungryCount: 0` so no alert fires
and nobody dies.

That is the exact signature of the day-17 dead town the playtest found
organically. P1 fixed the storage half; this is the villager half, and the town
stays dead without it.

**Frozen: a villager who cannot reach food must not thrash.** Going to eat may
interrupt a haul at most once per attempt; failing to find food must back off
for progressively longer rather than re-firing every cooldown, and a villager
already carrying goods should deliver them before going to look. A town with no
food should visibly starve — `starvingDays` rising, the alert firing, people
dying — not stand still at full hunger forever. Silent stasis is worse than
losing.

## Q2. A burnt-out tier-1 town cannot rebuild its Granary (TIER 1)

ADDENDUM I1 froze the invariant that **no building may cost an item its own tier
cannot obtain**, and two pre-existing violations survived it:

| def | tier | costs | problem |
|---|---|---|---|
| `granary` | 1 | includes `plank` | `plank` needs the tier-2 Sawmill |
| `wooden_gate` | 1 | includes `plank` | same |

This is why a town that loses its food storage to a raid can never replace it:
the only tier-1 food store in the game is priced in a tier-2 material. **Reprice
both in tier-1 materials** (timber and stone), and add these two to the static
tier/cost check so the class of bug cannot return.

## Q3. A Barracks that stands gets no garrison (TIER 1 for §15, not for safety)

P2 repriced the Barracks so it is affordable by day 12 — verified, first
affordability moves from day 4–8 to **day 2**. But at day 12 a town runs
population 6–7 against **13–21 tier-1 job slots**, so `barracks.workers.length`
is **0** when the raid starts and the result is still `ravaged`.

ADDENDUM M4 made food buildings outrank storage and garrison when `daysOfFood`
is low. That was right, and it is now the thing standing between the player and
a defended town.

**Frozen: when a raid is warned or active, garrison slots outrank storage and
civic slots** in `villagers.assignJobs()` — below food, above everything else.
A player who built a Barracks before the raid must get soldiers in it. The
warning already gives two days' notice (three with a Watchtower), which is
exactly the window this should use.

## Q4. `game.state` stays `'playing'` at population 0

Observed on several seeds. §10.7 says the game ends when population reaches
zero. `military.js` owns `game:over` and checks on `day:ended` and at raid end,
but an empty town outside those moments never triggers it. **Check it on
population reaching zero, wherever that happens.**

## Q5. Recorded, not acted on

- **Feed tasks deliberately cannot source the overflow pool.** It was
  implemented and measured: enabling it turned "pop 6, frozen, 12 uneaten
  berries" into "berries eaten in 3 days, `starvingDays` 1→3, pop 6→3". Faster
  death is not a fix. The real blocker is Q1 — with villagers no longer
  thrashing, this should be re-measured rather than assumed.
- **Build tasks cannot source producer output buffers** (§9.3.1 restricts build
  to storages). In the P1 repro a Stockpile site waited four days at
  `delivered {wood: 6}` while two Woodcutters sat on full buffers. Worth a
  narrow rule: when `storages().length === 0`, let build fall through to
  buffers.
- **The "wood never exceeded 27 by day 12" figure did not reproduce** — honest
  defence-first openings peak at 31–122 available wood on timber-rich maps and
  10–15 on poor ones. The reprice is still correct; the number was map-specific
  and should not be treated as a constant.

---

# ADDENDUM R — Wave 1, and a town that cannot die (FROZEN)

Q1's livelock fix is verified (28 `'starving'` cancels → 1, longest undelivered
load 199s → 75s). Q3's garrison rule was delivered exactly as frozen, and the
measurement showed **the outcome got worse**. That is the most useful result of
the round, and it points at two real problems.

## R1. A tier-1 garrison is a worse trade than no garrison (TIER 1)

Measured, 5 seeds, garrison size swept against wave 1 (three bandits):

| garrison | buildings lost | defenders dead | survivors @ d20 | `held` |
|---|---|---|---|---|
| 0 | 47 | 15 | 35 | 0/5 |
| 2 | 24 | 33 | 19 | 0/5 |
| 4 | 13 | 33 | 20 | 0/5 |
| 6 | 7 | 40 | 10 | 0/5 |

Monotone: **roofs are bought with people, and `held` is unreachable at every
size.** With 5 garrisoned soldiers, `stats.soldiersLost` is 8 for 1–2 enemies
killed, because §10.6 keeps feeding replacements in as the garrison falls.

The arithmetic: a tier-0 militia deals `4 × 0.22 × healthFactor × moraleMult`
≈ **0.69 dps**. Five of them need ~35s to kill three bandits, while three
bandits at 18 dps kill a 132hp defender every 7.3s. It is a dead heat that the
top-up then loses.

**The cause is that a Barracks at tier 1 cannot arm anybody.** `spear` needs the
Weaponsmith and Armoury, both tier 2 (H2), so a day-12 garrison fights
bare-handed — exactly what §10.6's emergency draft already provides. The player
pays 24 timber for a building that changes nothing.

**Frozen: the Barracks issues its own basic arms.** A garrisoned soldier at a
Barracks (or Keep) is equipped at **kit tier 1 (Spearman, power 10)** whether or
not an Armoury exists, drawing nothing from stock — the barracks keeps a rack of
spears, and that is what a barracks *is*. An Armoury with better kit still
upgrades them normally via §10.2.

That takes a 5-man garrison from 3.4 dps to ~8.6, so wave 1 is held with losses
rather than lost with losses — §17's "scary and survivable" — and it makes the
Barracks meaningfully better than the draft, which is G1's whole promise.

`'held'` at day-12 population should then follow without touching
`_endRaid`'s `losses >= max(5, popAtStart × 0.15)` threshold: with a real kit,
losses fall below it. Re-measure before changing that line.

## R2. The town cannot die, three independent causes (TIER 1)

The playtest's day-17 dead town had `starvingDays: 0` and `hungryCount: 0` while
everyone sat at `hunger: 1.00`. Q1 fixed the villagers' thrashing; the *town*
still cannot notice. Three separate blocks, all in `economy.js`:

1. **`STARVING_HUNGER = 1.5` is compared against `v.hunger`, which §8 defines as
   `0..1`.** `hungryCount` is therefore structurally 0 and
   `hungryShare > STARVING_SHARE` can never fire. **Lower it to ≈0.95.** Note
   this must be fixed in `economy.js`, not by lifting the hunger ceiling in
   `villagers.js` — that was tried and measured, and craters 2–3 of 4 seeds'
   population because in a merely-thin town most of the population routinely
   crosses 1.5.
2. **`_updateStarvation`'s `noFood` test counts `buildings.overflow`.** Feed
   tasks deliberately cannot reach the pool (Q5), so a town whose storages
   burned reads 10.8–49.8 food units against a 1.1–1.5 starvation line and never
   trips. **Exclude the pool from the starvation test.**
3. **Individual `v.health` is never drifted toward `townHealth`.** §9.4 requires
   it; nothing writes it after spawn, so it sits at 70 forever and
   `_doPopulation`'s `hp < 25` illness-death path never fires. **`townHealth`
   reaching 0 currently kills nobody.**

Together these mean a starving town neither recovers nor dies. §16 forbids the
soft-lock; §17 wants losing to be legible. A town with no food must visibly
starve — `starvingDays` rising, the alert firing, people dying.

## R3. `canPlace` says yes and `place` refuses (TIER 2)

Repeatable: `canPlace('stockpile', x, y).ok === true`, then `place()` returns
null with `lastError === 'a road is already here'`. **A spot the player is told
is legal must place.** The two must not disagree.

## R4. Build tasks cannot reach the overflow pool's contents

P1 made the pool sourceable, but in the stranded repro with zero storages the
recovery Stockpile still sat at `delivered {}` on 2 of 4 seeds for the whole
window. Q5's narrow rule is now frozen: **when `storages().length === 0`, build
tasks may fall through to producer output buffers** as well as the pool.

## R5. Recorded

Q1's numbers: 28 cancels / 31 completions → **1 cancel / 39 completions**;
townHealth at day 60 up 40.5 → 47.0 mean; nutrition per food-worker-day 2.20 →
2.66; M5 rotation still fires with the dominant group's share falling on 4 of 6
seeds. The 20,000-tick sweep is clean (worst no-progress run **0.2s**), per-item
conservation unbreached everywhere, save round-trip exact across 36 trips, and
perf at 220 villagers is 0.035 ms/tick — 0.2% of the frame budget.

---

# ADDENDUM S — R4 has a food twin (FROZEN)

Closing the last two Tier-1 items. They were one feature: **a town that loses
every storage must be able to feed itself and rebuild.**

## S1. The two blockers, and why neither could be fixed alone

- **No hauliers.** In a zero-storage town `economy.claimTask` was called **0
  times in 300 game-seconds**. Not refused — never reached: every villager had a
  job, and `stepJob()` admits only `porter` and `builder` roles to hauling.
  With no storage there are no porters and nobody is unemployed.
- **Nobody could eat.** All food lands in the refund pool, and `_findFeedSource`
  walked only `storages()`.

Fixing either alone does nothing, which is why an earlier round measured the
obvious one-line unlock and correctly reported that it rescued neither repro.

**Frozen:** when `buildings.storageCount() === 0`, an employed non-combatant may
fall through to `economy.claimTask(v, 'build')` — `'build'` only, and only while
no storage stands. Normal behaviour resumes the moment one exists.

## S2. The food twin — confirmed as designed

ADDENDUM R4 lets *build* tasks fall through to producer output buffers when
there is no storage. **It needs an eating counterpart**, and this is it:

> With no food store standing, the town's larder is the **refund pool** and the
> **producers' own baskets**. A starving villager may eat from either.

Without it, towns starved to death beside a full forager's basket while that
forager sat stalled on `'no storage'` — the two halves of §16.9's food floor
pointing at each other. Measured: P1's literal repro went from **0 of 8 seeds
alive to 3 of 8**, and two seeds now hold `starvingDays 0` for **70 days with
zero storage**, which is the floor working as written.

A whole-building skip keeps it honest: a producer's basket is an emergency
larder **only for food it produced itself**, so a baker's grain is never a meal.

**The two gates are paired and must move together**: `economy.poolIsTheLarder()`
and `villagers.foodStores.length === 0`. If they drift apart, the starvation
line gets measured against food nobody will walk to — which is exactly the class
of bug ADDENDUM R2.2 existed to fix.

`reachableFoodUnits()` therefore counts the pool **exactly when**
`poolIsTheLarder()` is true, so "reachable" means the same thing on both sides
of the seam.

## S3. Measured outcome

The headline is the **real day-12 raid**, not a synthetic demolish — same seed,
same six buildings lost including the Town Centre and Granary:

| | before | after |
|---|---|---|
| outcome | **game over, day 18** | **alive at day 31**, pop 4, rebuilt to 4 buildings |
| waves survived | 1 | **2** (held wave 2 at day 24) |

P1's literal repro across 7 seeds: the Stockpile is rebuilt **7/7 (was 6/7,
never on seed 11)**, on day 7–10 instead of day 12, five of seven while still at
full population with `starvingDays 0`; **3 of 7 alive at day 25, up from 0 of 7**.
`claimTask` calls go 0 → 170. The four seeds that still die had 0–6 food units
and a single forager — at ADDENDUM M's measured rate one forager cannot feed
ten, and they now die **legibly**: alert firing, `starvingDays` climbing,
`state: 'gameover'`.

**It costs nothing.** The 64-seed banded regression is **bit-identical** — not
one seed moved, in either direction. Across 3,498 normal town-days: kind-filtered
claims 0, buffer-sourced build lookups 0, pool meals 0, basket meals 0. Every
gate stays shut in a town with a granary.

Per-item conservation across 2,631 deliberately-disrupted town-days (every
storage razed on a 12-day cycle, so the pool, the lent hauliers and both
emergency larders are live): **0 breaches, 0 stock-cache mismatches.**

## S4. Known and accepted

- A villager can hold goods for a whole 300s window in a zero-storage town —
  `stepDeliverCarry` has nowhere to deliver and only reaches `depositCarry`
  after `MAX_CARRY_FAILS`. Pre-existing, identical before and after, and not a
  conservation issue (goods in hand are counted), but it is a few units out of
  circulation at the worst moment.
- An unemployed builder mid-task restores as `IDLE`/`NONE` rather than
  `WORK`/`BUILD` — 3 of 180 round trips in a stranded town, identical before and
  after, self-healing on the next decision tick. The normal-town save is exact
  (36/36).
- `economy.daysOfFood()` returns `Infinity` at population 0. Pre-existing, and
  only reachable now that towns can actually empty.

---

# ADDENDUM T — The forager's basket (FROZEN)

## T1. The honest arc, measured

An adaptive competent player that pays for everything (real sites, real
materials, real build time, real hauling, roads bought per tile), reacting to
what the town lacks, over 120 days:

| seed | peak pop | end tier | outcome |
|---|---|---|---|
| 1234 | 14 | 1 | **dead, day ~30** |
| 7 | 16 | 1 | **dead, day ~32** |
| 99 | 18 | 1 | **dead, day ~35** |
| 4242 | 10 | 1 | **dead, day ~24** |
| 31337 | 14 | 1 | **dead, day ~31** |
| 8080 | 16 | 1 | **dead, day ~47** |

Six of six. Health 0–21, **0–1 food groups**, tier 1 forever. §15's table is not
merely unmet — the town cannot sustain itself at all, so 44 of the 66 buildings
in this game have never been seen by anyone.

The two failures compound: too little food to feed more than ~15 people, and too
little *variety* to lift health above the 35 birth gate, so the town neither
grows nor holds.

## T2. Why every previous lever failed

ADDENDUM L1 set the target — **one food worker feeds 4–6 people** — and it has
never been reached. Measured honestly it is **2.22**. Every lever tried so far
was either inert or exhausted:

- **`gathers.yield` (L1)** — inert. `world.harvest` clamps to the nearest node's
  stock, so output was flat from yield 5 to yield 16. Fixed by M1 (prefer a node
  holding a full load), which made yield *work* but did not make it enough.
- **The working day (M2)** — `DAY_SECONDS` 60 → 100 and a wider window took the
  daylight budget from 39.6s to 74s. Necessary, insufficient.
- **Roads (M3)** — the single biggest multiplier, taking trips per worker-day
  from 0.2–0.5 to 1.5–3.7. Already in, already exploited by a competent player.

What remains is the shape of the trip itself. A gatherer's day is **55% walking
and 8% harvesting**: they walk nine tiles to a bush, take one basket, and walk
nine tiles home. The walk home is paid in full for a single node's worth of
food.

## T3. Frozen: a gatherer fills its basket from several nodes

**A gatherer walks out, harvests a node, steps to the next nearby node, harvests
again, and only walks home when its basket is full or no node remains in range.**

- Each gathering def gets a **`gathers.basket`** (units carried per trip),
  independent of `gathers.yield` (units taken per node).
- Between nodes the villager walks normally — short hops within the working
  radius. **Nothing teleports**; the whole trip stays visible on the map, which
  is pillar 1.
- The long walk home is amortised across a full basket instead of one node's
  worth.

Starting values: forager `basket 15` (yield 5), hunter `basket 9` (yield 3),
fisher `basket 15` (yield 5), and the non-food gatherers in proportion. The
balance pass measures the resulting ratio and tunes `basket` to land L1's
4–6 target; `basket` is the dial, not `yield`.

This is also simply what a forager *does*. A woman with a basket does not walk
home after one bush.

## T4. What this must not do

- It must not let one worker strip a whole patch in a day — node depletion and
  regrowth (§5) still bind, and M1's "prefer a node with a full load" already
  spreads harvesting across a patch.
- It must not break the trip's visibility. A gatherer standing still for three
  harvests in a row at one tile is a bug; walking a short circuit is the design.
- It must not regress the M3 legibility fix: an unroaded hut still reports
  `'no road'` and employs nobody.

## T5. The success criterion

**A competently-played town must survive 120 days and reach at least Town
(tier 3).** That is not a stretch target, it is the floor: without it the game's
whole second half — 44 buildings, the iron chain, walls, the Keep, the
cathedral — is content nobody can reach, and the "grow a hamlet into a city"
premise is false.

---

# ADDENDUM U — No child has ever been born (FROZEN)

ADDENDUM T's lever was disproved the same way L1's was, and the disproof found
something much larger underneath it.

## U0. T3's basket is inert; `outputCap` was the real gain — confirmed

Measured across 16 seeds: **every point of throughput gain came from raising the
hut's output buffer, none from the basket**, and above ~2× the basket is
actively harmful. The time census explains it — T2 correctly measured harvesting
at ~8% of the day, but the walk it identified is **walk-out (17–44%)**, which a
basket cannot shorten. The walk home a basket amortises is only 4–10%.

The basket circuit is kept (it is correct, visible, and `basket = 2× yield` is
the measured optimum), and the **`outputCap` ×2.5 raise is confirmed as
deliberate** — it was partly forced by T3 (a hut must be able to receive a
basket) and partly a balance decision, and it is the single biggest measured
improvement in food throughput so far.

**The patch was never the constraint.** Units removed per hut per day: 0.0–3.2,
against 2–68/day of regrowth standing in range. The berries are sitting there;
the labour cannot reach them.

## U1. Births are structurally impossible (TIER 1 — this is the real defect)

**0 births across 16 seeds and 960 town-days, against 348 immigrants.**

`_doPopulation` requires a house with `2 <= occupants < capacity`. But
`_assignHomes` **packs each house to capacity before opening the next**, so at
every day boundary every house is either full (4/4) or empty (0/4). The birth
window is never occupied by anyone, ever.

So §9.5's entire birth mechanic has never once fired, and the town can grow
**only by immigration** — which gates on three days of food, imports mouths, and
starves. That is the boom-bust the last four rounds have been measuring, and it
is why no amount of food tuning has fixed it.

**Frozen: housing assignment must leave the birth window reachable.** Spread
residents across available houses rather than packing each one full — a family
of two in a four-bed cottage is the normal state of a growing town, not an
inefficiency to be optimised away. Re-measure the birth rate against §9.5's
`BIRTH_CHANCE` afterwards; the constant has never been exercised.

## U2. Meals are the biggest remaining tax on a worker's day

A food worker spends **5–9% of their existence harvesting and 12–32% on meals.**

ADDENDUM J2 moved eating into the home to stop exactly this, and it works — but
only while the **house larder has food**. Once a larder empties, every villager
walks to the granary in working hours again, which is the pre-J2 failure mode
returning under load. It amplifies every famine: less food → more walking to
eat → less food gathered.

**Frozen: the larder must be kept stocked as a first-class obligation.** `'feed'`
tasks already outrank `'supply'`; the gap is that an empty larder produces no
signal urgent enough to beat the rest of the queue, and a villager whose larder
is empty should prefer to wait for a delivery over walking across town, when a
delivery is actually inbound.

## U3. A Forager's Hut may be built on a single bush

`canPlace` accepts one node in radius. The hut then has a **1.8 nutrition/day
ceiling for two workers** while reporting itself as `(working)` — the M3 failure
mode with a different cause: the building is not stopped, it is simply futile,
and nothing tells the player.

**Frozen: a gathering def requires a minimum worth of resource in range**, and
placement must refuse below it with a specific reason. §13's placement preview
should show what a site is actually worth before the player commits 8 timber.

## U4. Still open, measured this round

- **Wave 1 still ravages.** Over the first 30 days raids destroy 5–17 buildings
  including the **Town Centre on 6 of 6 seeds** and kill 5–12 villagers;
  `raid:ended` reports `ravaged` on 5 of 6. R1's Barracks kit made a *garrisoned*
  town hold, but a town at its actual day-12 population cannot garrison one.
- **A `'cut off'` idle reason appears on a gathering hut mid-run and never
  clears** (seed 1234's forager from day 19 onward, two idle workers,
  permanently). It silently retires a food building for the rest of the game.

## U5. Where T5 stands

**Not met.** With raids on, 0 of 6 seeds survive 120 days and 1 reaches tier 2.
With raids off, **3 of 6 now survive** (was 0 of 6) and one reaches tier 2 with
peak population 36. The food-worker ratio is **2.06 mean** against L1's 4–6.

U1 is the most likely reason the remaining gap exists: a town that cannot bear
children cannot compound, and every food fix so far has been feeding a
population that could only ever arrive by cart.

---

# ADDENDUM V — The trip is longer than the day (FROZEN)

## V0. Births work, and do not move T5

U1's diagnosis was right and the fix is correct: birth-eligible house-days went
**9.3% → 20.8%** of all house-days, births 2 → 12 across 72 seeds. And it changes
nothing: peak population still ceilings at **~22 across 72 seeds**, tier 3 needs
60, and **tier ≥3 is 0 of 72 in every build at every `BIRTH_CHANCE` tested.**

`BIRTH_CHANCE = 0.06` is separately ~10× too low — the realised rate is 0.0088
per birth-eligible house-day, because the `health/100 × surplus` product averages
0.44. **It stays at 0.06 until food is fixed**: raising it to 0.20 or 0.60 took
raids-on survival from 4/36 to 0/36. More mouths in a town that cannot feed them
is not growth.

U2 is likewise implemented, correct, and neutral — and its premise was wrong.
Larders are not dry because the queue deprioritises them; **60–75% of failed feed
posts find no food in any store in the town.** The larder is dry because there
is no food.

## V1. The one number that explains everything

**Trips per gatherer per day: 0.42–0.91.** The working day is 74 game-seconds.
So a single round trip — walk out, harvest, walk home — takes **longer than the
entire day**, and every gatherer sleeps mid-errand.

That is why every lever so far has failed, and the measurements now agree from
four directions:

- **`yield` was inert** (harvest clamps to the node) — fixed by M1.
- **`basket` was inert** — it amortises the walk *home* (4–10% of the day), not
  the walk *out* (17–44%).
- **The patch was never the constraint** — huts remove 0–3.2 units/day against
  2–68/day of regrowth standing in range. The food is sitting there.
- **Harvesting is 5–9% of a gatherer's existence.** Everything else is travel,
  meals and sleep.

**The binding constraint is that a gatherer walks to its nodes off-road at 0.50
tiles/sec** (§6), and forest at 0.35. A nine-tile radius is a 36-second round
trip at best, before harvesting, before meals, before night.

## V2. Frozen: the lever is travel time, and roads keep their meaning

Raise off-ground movement so a gatherer can complete **2–3 trips in a working
day**:

```
GRASS / MEADOW / SAND : 0.50 -> 0.85
FOREST                : 0.35 -> 0.60
ROCK                  : 0.40 -> 0.65
ROAD_DIRT             : 1.15   (unchanged)
ROAD_COBBLE           : 1.55   (unchanged)
```

**This does not weaken the road mechanic**, and the measurements say why: roads
took trips per worker-day from 0.2–0.5 to 1.5–3.7, and almost all of that came
from the **connectivity gate** — an unroaded building does not function at all
(§6, M3) — not from the speed differential. Roads remain 1.4–1.9× faster and
remain mandatory. What changes is that the ground between a hut and its patch,
which no player would ever pave, stops costing three quarters of the day.

`FASTEST_SPEED` stays 1.55, so ADDENDUM C's cost normalisation and the octile
heuristic's admissibility are untouched.

The balance pass measures the result and tunes these five numbers to land
**ADDENDUM L1's target of one food worker feeding 4–6 people**, which is now the
sole remaining blocker on **T5** (survive 120 days, reach tier 3).

## V3. `canPlace` will seal villagers into a pocket (TIER 1)

A ring of solid buildings can enclose a 4–5 tile walkable pocket **with
villagers inside it**. Seed 4242: **38% of villager-samples off-region**, 4–6
villagers permanently stranded, *both* porter slots held by men who can never
walk to a store. They claim hauls they cannot complete and cancel them forever —
2,636 feed tasks created, 2,568 cancelled, 65 completed.

This is also the root cause of U4's permanent `'cut off'` huts.

**Frozen, two parts:**
1. **Placement must refuse a site that disconnects a walkable region** containing
   villagers or buildings, with its own reason. A player cannot be allowed to
   brick their town by placing a cottage.
2. **§16 needs a recovery for a villager already inside a pocket.** They cannot
   walk out, never eat, and hold their job slot forever. Freeing the slot is not
   enough — the villager must be freed too.

## V4. Measurement standard

**Six seeds is too few to judge T5.** Tier counts at n=6 are noise. Every T5
claim from here uses **n ≥ 36** and reports `meanPeak` and `meanTier`, not the
alive count.

---

# ADDENDUM W — V2 worked; the food never leaves the hut (FROZEN)

## W1. V2's measured result

The off-ground speed change is the first lever since roads that actually moved
the game. Measured at ADDENDUM V4's standard (n = 36, raids on, honest adaptive
player, 120 days):

| | before V2 | after V2 |
|---|---|---|
| mean peak population | ~14.7 | **28.4** |
| median peak | — | 27 |
| max peak | 22 | **60** |
| tier ≥ 2 | **0 of 72** | **15 of 36** |
| tier ≥ 3 | 0 | 0 |
| alive at day 120 | 0 of 6 | 7 of 36 |

V1's diagnosis was right: the trip was longer than the working day, and nothing
else could matter until it wasn't. Tier 2 is now routinely reached. **T5 is
still unmet** — tier 3 needs 60 population and remains 0 of 36.

## W2. The next constraint: food is produced and never collected

**57% of the town's food sits in gathering-hut output buffers**, not in stores,
not in larders, not in anybody's hands.

This is consistent with everything measured before it and explains the two
oddest earlier results:

- **`outputCap` was the only lever that moved the ratio** (U0) — raising it
  helped because huts were filling and stalling, not because buffer size is
  interesting. That was the symptom, and it was misread as the cause.
- **60–75% of failed feed posts find no food in any store** (V0) while the town
  is simultaneously producing plenty. The food exists; it is in the wrong place.

The haul path — not the gather path — is now the binding constraint. Porters
exist only as jobs at storage buildings, `CARRY_CAP` is 8, and a `'store'` task
is the **lowest** priority in §9.3's queue, below `build`, `feed` and `supply`.
A hut 12 tiles out therefore waits behind everything.

**Frozen: collection must keep up with production.** The mechanism is the
implementer's to choose and measure — porter supply, carry capacity, `'store'`
task priority, or gatherers walking a full basket to the store rather than to
their own hut — but the invariant is that **a working gathering hut must not
accumulate a stalled buffer while the town starves.**

Measure the share of food sitting in hut buffers before and after; it should
fall well below half. And re-measure L1's ratio, which has never left 2.0–2.3
through five rounds of gather-side tuning — if the ratio finally moves, this was
why.

## W3. Standing corrections

- `BIRTH_CHANCE` stays 0.06 until the ratio is in band (V0).
- Do not re-tune the larder mechanisms (U2) expecting the meal share to fall;
  measured neutral, and its premise was downstream of this.
- Six seeds is noise for any T5 claim (V4). n ≥ 36, report `meanPeak` and
  `meanTier`.

---

# ADDENDUM X — Tier 3's gate was never openable (FROZEN)

## X1. W2 was right, and it moved the game again

Collection was the constraint, and the number was worse than W2 recorded — at
n=36 the baseline held **68.2%** of the town's nutrition in producer output
buffers, with **79.4%** of samples showing at least one food producer stalled at
its store trigger. The town completed **3.0 `store` hauls per day** at
`CARRY_CAP` 8: twenty-four units of collection per day for a town eating thirty.
81% of stalled huts already *had* an open task — nobody could walk it.

| | before | after |
|---|---|---|
| food sitting in hut buffers | 68.2% | **33.1%** |
| samples with a stalled food buffer | 79.4% | **19.5%** |
| L1 ratio | 2.57 | **3.51** |
| meanPeak (raids on) | 27.2 | **33.3** |
| tier ≥2 (raids on) | 9/36 | **17/36** |
| alive at day 120 (raids on) | 8/36 | **20/36** |
| meanPeak / tier ≥2 / alive (raids **off**) | 35.0 / 10 / 15 | **43.5 / 23/36 / 30/36** |

Half the towns now live out the run, and villages are the norm rather than the
exception. The ratio is still below L1's 4–6 band, so **`BIRTH_CHANCE` stays
0.06** (W3).

## X2. Every T5 claim for five rounds was measured against a gate the harness
could not open

Tier 3 requires **pop 60 AND health 58 AND Market + Chapel + Barracks.**
Measured across 36 seeds on both builds:

| gate | met |
|---|---|
| health 58 | **36/36 — never once the blocker** |
| pop 60 | 3/36 → 6/36 |
| Market + Chapel + Barracks all standing | **0/36, both builds** |

**The chapel was never sited at all** — the adaptive player's build order buries
it behind six tier-2 economy buildings. A corrected player that pursues Market
and Chapel the moment tier 2 lands gets chapel 7/36, market 9/36, barracks
25/36 — and the **conjunction is still 0/36.**

So "tier 3 is 0/36" has been true for five rounds for a reason that had nothing
to do with the thing being measured. Food, births, travel and collection were
all real problems and all worth fixing — but none of them was ever going to move
that number.

## X3. The gates are fiction and are re-baselined here

§9.8's tier thresholds and §15's whole table were written **before a single
measurement existed**. Measured reality after every fix in this project: mean
peak population **33.3 with raids, 43.5 without**, best single seed 138.

A gate of 60 sits above the mean peak, so most towns can never reach Town however
well they are played. That is not difficulty, it is an unreachable rung.

**Frozen — §9.8's table is replaced:**

| tier | name | requires |
|---|---|---|
| 1 | Hamlet | (start) |
| 2 | Village | pop ≥ 24, a Granary, a Stockpile, townHealth ≥ 45 |
| 3 | Town | **pop ≥ 40**, a Market, a **Chapel**, townHealth ≥ 58 |
| 4 | City | **pop ≥ 75**, a Keep, a Town Hall, townHealth ≥ 68, happiness ≥ 60 |

Two changes beyond the numbers:
- **The Barracks is dropped from tier 3's requirement.** It is a tier-1 defence
  choice, not a civic milestone; requiring it conflated "this town is
  prosperous" with "this town is fortified".
- **Market + Chapel stay** — two civic buildings *is* the statement that a
  village has become a town, and that conjunction is the intended difficulty.
  If they remain unaffordable after the pop gate moves, the answer is their
  cost, not the requirement.

§15's day-by-day table is likewise aspirational fiction and is **not** a
measurement target until it has been re-derived from a playable game. The
binding question is the tier arc, not the calendar.

## X4. Two defects found and fixed while measuring

- **Orphaned cargo froze a worker out of the haul queue permanently.** Only the
  porter branch delivered goods held with no task, and `claimTask` refuses a
  villager with full hands — so any non-porter left holding an aborted haul
  carried it for **up to 86 days** and could never take another task. Two to
  seven villagers per town, **50–82% of all food-carriers.**
- **A leftover basket deadlocked its worker.** `gatherComplete` runs only on a
  `TO_DOOR` arrival; a worker parked at a full hut never arrives again, and
  `gatherTargetFor` refuses to send out a worker whose basket has no room.

## X5. Open, measured, not yet acted on

- **Population is the remaining gap**: mean peak 43.5 against the new gate of 40
  — close, and the immigration gate (happiness > 55 / free housing / 3 days of
  food) is where to look.
- **Windmills short of grain in 44.6% of samples**, with grain in town stores in
  35% of those. The only chain whose numbers look bad, and it only surfaced now
  because the chain finally runs at all.
- **17.9% of gatherer labour sits on an unchanged basket for >2 days**, 27% of it
  in `walk/to-node`. Worth confirming none of it is a worker pathing to a node
  it can never stand at — a livelock `pathFails` cannot catch, because a path
  *is* found each time.

---

# ADDENDUM Y — §16.10, walled-in villagers (FROZEN)

## Y1. The guarantee, as implemented

**§16.10: the player cannot brick their town by placing a building, and a
villager who ends up walled in gets out.**

1. **`canPlace` check 9** refuses a site that seals a side of the map holding
   villagers or buildings, with the reason `'would cut off the ground behind
   it'`. Sides are weighed against the rest by **heads + doors, Town Centre at
   1.5** — the same weighting `hubRegion()` uses, so the two can never disagree
   about which side is "the town".
2. **Recovery**: on `day:ended`, and on the first tick after `restore()`, the
   town pulls down the cheapest building sealing a pocket and the villagers
   **walk out on their own feet**. Nothing teleports (§1). Unfinished sites are
   chosen first (free to undo), then walls, then the cheapest thing that opens
   the way. The Town Centre is never chosen. Maximum 3 per sweep.

`paths.pocketIfSealed()` returns `{tiles, count, sides}` — it may report
**several sealed sides at once**, with `sides[i]` the exclusive end offset of
pocket *i* inside `tiles`. The check never refuses a split it has not proved
(`SEAL_CAP = 192`, `SEAL_MAX_SIDES = 8`).

## Y2. Why the first implementation passed lint and was still wrong

Worth recording, because it is the same lesson as N0 and H2. The previous
attempt linted clean, imported clean, and **permitted 15 of 15 real stranding
placements.** Seven distinct defects, of which three are instructive:

- `sealFlood` returned at the **first** side to close — which is routinely a
  one-tile crevice, never the yard holding the villagers.
- `sealsOffPocket` summed all sides, so an empty crevice out-voted a sealed yard.
- Occupancy was tested by **door**, so a pocket could be sealed around a
  roadless hut for free; the first road laid inside then minted a permanent
  `'cut off'`. Occupancy is now tested by **footprint access**.

"It lints and the tests I wrote pass" is not evidence a guard works. The
evidence is an independent re-derivation: all **301 seal refusals** were
re-verified in the contract's own terms, by code sharing nothing with
`buildings.js`.

## Y3. Measured

| | before | after |
|---|---|---|
| off-region villager samples (n=36) | 7.72% | **0.272%** |
| `'cut off'` building samples | 5.78% | **0.041%** |
| longest stranding episode | **87.92 days** | **0.67 days** |
| villagers who died off-region | 4 | **0** |
| `'cut off'` building-days on arc's seeds | 2.369% | **0.000%** |
| mean peak population | 25.25 | **28.14** |
| mean end tier | 1.25 | **1.56** |

Pre-fix saves: **226 of 226** stranded villagers freed. R3's lockstep holds —
12,824,064 `canPlace` calls, **0** disagreements, 0 inaccurate reasons across 26
distinct refusals. A legitimate walled courtyard is still allowed: the gap
refuses a palisade and **accepts a gate**, through which villagers path and
enemies do not (H1 intact). An empty ring closes freely — this is not a ban on
walls.

Ghost cost, worst case (hovering a tile the check refuses, memo cold): 11.71 µs
→ **1,423 calls per frame**, and `render.js` caches per tile.

## Y4. Two design questions it raised, resolved

- **A forced demolition refunds.** The recovery pulls down a building the
  player did not choose to lose, so §16.4's "cancelling always refunds" applies
  in spirit: the town correcting its own mistake must not also charge for it.
  `refundAll()` currently returns only `delivered` and `inv`, and `delivered` is
  cleared on completion — so a *built* building refunds nothing. For the
  recovery path specifically, refund the build cost.
- **Placing a building on a villager must move them, not bury them.** Placement
  does not check whether anyone is standing on the footprint; the man ends up on
  a non-walkable tile. It is not a soft-lock (A* can leave a solid tile, worst
  measured episode 0.75 days, none fatal) but it is **90% of the remaining
  off-region samples**. The villager steps aside to the nearest walkable tile —
  walking, not teleporting; a person standing where a barn is going up moves.

## Y5. Deliberately not changed

`hubRegion()` is untouched. The pocket-captures-the-vote case is real in
construction but occurs on **0 of 4,320 measured town-days** on either build, and
N2's fix is independently verified — so the dangerous *consequence* is guarded
instead (`freeStranded` declines any region holding ≥ the hub's villager count)
rather than reopening a verified vote.

---

# ADDENDUM Z — The circular lock (FROZEN)

## Z1. `townHealth = 60` on day 0 misdirected five rounds

`economy.js` seeds `this.townHealth = 60` at construction — **above the 58 gate**.
Every "has this gate ever been met" statistic that includes day 0 therefore
returns 36/36 for free:

```
townHealth >= 58, ever, INCLUDING day 0 : 36/36   <- ADDENDUM X2's number
townHealth >= 58, ever, from day 10 on  :  9/36 raids off,  1/36 raids on
```

X2 concluded "health 58 is met 36/36 — never once the blocker" and froze X3's
re-baseline on that basis. **Health was always the binding gate.** Measured share
of town-days each tier-3 gate is open: **health ≥58 10.7% (0.7% with raids)**,
pop ≥40 29%, market+chapel 47%.

**Frozen: `townHealth` is seeded at the value its own formula gives for the
starting stock, not at a flat 60.** A town must earn the gate. And any harness
measuring a gate must exclude day < 10.

## Z2. The health gate is locked behind itself

This is a genuine design flaw and it is mine. Measured: mean `varietyScore`
**35.2** against the **58.1** the gate needs. Group presence across 36 seeds:
produce 96%, meat 64%, fish 51%, grain 29%, dairy 10%, **sweet 2%**.

Earliest tier per food group: produce 1, meat 1, fish 1, grain 2, dairy 2,
**sweet 3**. And **both positive health modifiers are tier 3** — the Apothecary's
+8, and the ale +5 that needs the tier-3 Brewery (which fires on **0.0%** of
town-days).

So the sixth food group and both health bonuses sit behind the very gate they
would open. Lowering the gate does not help — sweeping it 58 → 46 moves tier 3
only 8/36 → 12/36, because the ceiling is variety, not the threshold.

**Frozen, to break the circle:**

| def | was | now |
|---|---|---|
| `apiary` (honey — the only reachable `sweet`) | 3 | **2** |
| `apothecary` (+8 health) | 3 | **2** |

The Brewery stays tier 3: ale is a luxury, and honey alone opens the sixth group.

## Z3. Tier 4 is unsatisfiable by construction

`keep` and `town_hall` are **tier-4 defs**, and tier 4 **requires both of them**.
`canPlace` refuses `def.tier > economy.tier`, and neither has an `upgradeFrom`.
Probed directly at a forced tier 3: `canPlace('keep') → {ok:false, reason:'locked'}`,
same for `town_hall`. **City can never be reached on any seed, ever.**

Tier 2 requires two tier-1 buildings. Tier 3 requires two tier-2 buildings. Tier 4
required two tier-4 buildings — and ADDENDUM X3 re-froze that without noticing.

**Frozen:**
- `keep` and `town_hall` move to **tier 3**.
- **ADDENDUM I1's invariant is extended and must be enforced by the same static
  check: a tier-N gate may only require buildings of tier ≤ N−1.** This is the
  same class as I1 (a def costing an item its tier cannot obtain), one level up,
  and it was invisible for exactly the same reason — nothing checked it.

## Z4. Market and Chapel were never a cost problem either

They were a **harness artifact**. The adaptive player's want list is an
`if/else` chain, so one unplaceable earlier want (a quarry with no rock in range;
`housing <= pop`, true every day in a growing town) starves every want behind it
forever. Replacing the chain with a list that skips an unplaceable want, changing
nothing in the game:

| | if/else chain | list |
|---|---|---|
| market built | 12/36 | **20/36** |
| chapel built | 8/36 | **20/36** |
| both standing | 8/36 | **19/36** |
| meanPeak | 38.5 | **49.6** |

Every civic building that gets sited finishes (21 sited → 20 built). Materials are
abundant when they would be paid for. Build throughput is not it either —
raising the concurrent-site cap 2 → 8 takes buildings finished 32.6 → 48.7 and
site-blocked days 49/120 → 4/120, and **tier 3 stays 8/36.** No cost changed.

## Z5. Where T5 stands, honestly

| | raids OFF | raids ON |
|---|---|---|
| tier ≥3 | **8/36** | **0/36** |
| meanTier | 1.83 | 1.44 |
| meanPeak | 49.6 (max 134) | 32.4 (max 64) |
| alive at day 120 | 35/36 | 18/36 |

X3's gate re-baseline bought **+2/36 raids-off and zero raids-on** — correct, but
not the fix. Z1–Z3 are the fix, and they are untested until measured.

**Raids remain a separate problem**: a raids-on survivor holds a mean of **5.5
finished buildings** at day 120, and the health gate is open on 0.7% of its
town-days. Tier 3 under raids is not a gate problem, it is a `military.js`
problem.

## Z6. Also open

- **The grain chain shows ADDENDUM W's stranded-output pattern again**: grain
  stock 56.5 but only **18.6 in a storage building**, which is what §9.4 counts.
  Bakery built **0/36**.
- `ui.js`'s tier-3 celebration still promises "a market square and a barracks
  yard"; the Barracks is no longer required (X3).
- §9.8's table in this document still shows the pre-X3 numbers. X3 explicitly
  replaces it, so the contradiction is documented rather than silent.

---

# ADDENDUM AA — Stepping aside, walls that are walls, and a measurement correction (FROZEN)

## AA1. Y4 as implemented

`buildings.place()` calls `villagers.stepAside(x, y, w, h)` right after
`claimTiles()`, for solid defs only. Everyone standing inside walks off under
their own power — the stride is driven directly rather than through `move()`,
because `move()` steps centre-to-centre and a man in the middle of a 3×3 has to
cross the site being raised. A one-entry path is set so the renderer animates him
walking.

Measured, n=72 paired: **off-region villager samples 0.301% → 0.047%**
(t = −4.60, better on 67 seeds of 72). "Buried in a footprint" episodes **153 →
18**, longest **2.00 days → 0.08 days**. Direct probe: **61 of 61** villagers
standing on a footprint when it went up stepped aside, **0 buried**; across 34
traced placements, 34 walked and none snapped, **24/24 kept their task, 20/20
kept their cargo, 34/34 kept their destination**.

Edge cases all behave: a sleeper shuffles and goes back to bed through the
ordinary night branch; a harvester drops the node and cancels the pending cut but
**keeps the basket**; four men on one 3×3 get four distinct destinations; and a
footprint with no reachable neighbour falls back to a snap — worse than a step,
far better than buried, and it fired **0 times in 960 real town-days**.

The forced demolition refunds (`demolish(id, forced)`, `refundAll(b, withCost)`),
and only for a *built* building — unfinished sites keep the `delivered`-only
path, so nothing refunds twice. Verified across 960 town-days, 22 forced
demolitions, 84 units refunded, **0 conservation breaches**, with the harness
re-deriving the refund from what it watched enter each building rather than
trusting `refundAll`.

## AA2. Villagers walked through buildings — kept, as its own decision

Found while measuring AA1, outside its brief, and reported rather than folded in.

**`world.speedAt()` reads road and terrain only**, so `move()`'s existing
`path-blocked` branch was unreachable and a villager **walked straight through a
building raised across a route they had already planned.** That is a §1
violation — a wall the player paid for is not a wall — and it was invisible
because nothing ever asked whether the next step was still walkable.

**Frozen: a step onto a now-solid tile stops the villager where they stand and
re-asks for a route to the same destination**, keeping task and cargo, falling
back to the existing `recover('path-blocked')` after 3 attempts. Measured: fires
on 0.4% of path requests (280 of 70,328) and produced **0** `path-blocked`
recoveries in the 20,000-tick sweep. Without it the off-region figure stalls at
0.102%; with it, 0.047%.

## AA3. The remaining floor is corner-clipping, and it is cosmetic

All 18 remaining "buried" episodes are **one sample long**. `move()` interpolates
in a straight line from a fractional position, so a villager rounding a corner
spends a fraction of a second inside a solid tile. It is never a stranding, and
it is what the 0.047% now measures. Fixing it needs a corner-aware mover, not a
placement change — and ADDENDUM E2 already accepts corner-clipping as the price
of never isolating a tile.

## AA4. ADDENDUM V4 is amended — n≥36 is a floor for *tier*, not for population

The same change measured **peak population −3.75 at n=36 and −0.44 at n=72**
(sd 13.0). An n=36 read would have reported a real regression that does not
exist.

**Frozen: tier claims use n ≥ 36; peak-population claims use n ≥ 72**, and any
claim of a difference reports the paired t and the better/worse split, not just
the means.

## AA5. The conservation ledger has two blind doors

`lib.mjs`'s `tLedger` never books a recipe batch consuming `r.in` (`tickRecipe`'s
`take`) nor a building consuming `def.consumes` at `day:ended`. **Any tier-2 town
breaks that ledger**, which means conservation results from it are only
trustworthy for tier-1 towns. Corrected doors exist in `scratchpad/y4lib.mjs`
(`tLedgerY`), re-derived from the def; fold them into `lib.mjs`.

This does not invalidate the conservation results in this project — the
independent whole-world audits (W, X, Y, AA1) re-derive from observed events
rather than from `tLedger` — but it is exactly the shape of ADDENDUM N0's
lesson, and any future use of `tLedger` must carry the fix.

## AA6. Two notes for whoever touches these next

- **`demolish(id, forced)` has a second parameter.** Never pass it through
  `Array.prototype.forEach` — the index becomes `forced` and mints the build
  cost. `ui.js` and `input.js` both call it with one argument today.
- **`aside` and `asideResume` are serialized villager fields.** Anything
  hand-writing a villager save blob must carry them, or a man saved mid-stride
  restores standing in a wall until the next recovery. 266 of 266 villagers
  saved mid-stride finished the stride after restore, 0 left in a wall.

---

# ADDENDUM AB — No armour has ever existed (FROZEN)

## AB1. The invariant I claimed was enforced was never written

ADDENDUM I1 says, in this document: *"`constants.js` carries a static check for
this and it must stay green."* **There was no such check in the file.** I wrote
that sentence and never verified it, and for twelve addenda every tier/cost claim
has rested on it.

It exists now: `obtainableAt(tier)` + `contentViolations()`, run at import,
throwing with every offending def named. It enforces I1 **transitively** (a
producing building's own cost counts) and Z3's rule (a tier-N gate may require
only tier ≤ N−1 buildings). Verified against five deliberately broken inputs —
including a broken `constants.js` that now **throws on import** with all seven
violations listed.

## AB2. What it found immediately

> **`iron_mine` cost `tools: 4`. Tools are smelted from iron. Iron comes from
> that mine.**

A closed cycle with no entry point. Unobtainable at **every tier, on every seed,
for the entire history of this project**:

`iron_ore, iron, tools, steel, sword, halberd, crossbow, gambeson,
leather_armour, shield, mail, plate, candle`

**Every weapon and every piece of armour in the game.** No soldier could ever
rise above Militia. No Bloomery, Blacksmith, Foundry, Weaponsmith, Armourer,
Crossbow Range or Plate Armoury could ever run. The Cathedral (candles) was
unbuildable.

Fixed: `iron_mine` costs `brick: 10` instead of `tools: 4`. Post-fix every item
is obtainable by tier 4 and no def is unbuildable.

**Everything §10.2 has ever claimed about equipment tiers was measured against
kit that no real game could produce.** ADDENDUM R1's Barracks-issued spear is the
only reason any soldier was ever armed at all — and it was issued free, precisely
because the chain behind it did not work. `military.js` must re-measure raids now
that armour is reachable; this may be a large part of Z5's raid problem.

## AB3. Z1–Z3 did not open tier 3, and the agent said so

| | raids OFF | raids ON |
|---|---|---|
| tier ≥3, base → new | 7/36 → **7/36** | 2/36 → **1/36** |
| meanPeak | 44.9 → 47.0 | 33.7 → 35.1 |
| sweet group present | 3.9% → **13.2%** | 1.3% → 3.6% |

Honey works — sweet presence more than tripled — but it **displaces grain**
(24.2% → 14.0%), because variety competes for the same build slots. Mean variety
moved 33.7 → 33.2. Z2's diagnosis of the levers was right; the levers are simply
not affordable.

**Z3 is structurally proven fixed**: forced to tier 3, `canPlace('keep')` went
from `{ok:false, reason:'locked'}` to placing and building, and `checkTier()`
now returns 4. A Town Hall stands on 1.2% of raids-off town-days — **the first
one ever built in play.**

## AB4. The real ceiling is basic material throughput

Counterfactual, materials handed over on day 20, n=36:

| gift | tier ≥3 OFF | tier ≥3 ON | meanVariety |
|---|---|---|---|
| nothing | 7/36 | 1/36 | 33.2 |
| 200 brick only | 5/36 | 0/36 | 32.4 |
| **200 wood + stone + plank** | **18/36** | **12/36** | **46.1** |
| the health buildings, paid for | 20/36 | 15/36 | 42.9 |

Wood, stone and plank alone take tier 3 from 7/36 to 18/36 raids-off and 1/36 to
12/36 raids-on, **with no health building involved.** That is ADDENDUM X1's
collection theme one level up, and it is where the next round belongs.

Two supporting findings:
- **The Apothecary is unaffordable, not unreachable.** It costs `brick: 6`, and
  **0.8% of town-days hold a single brick** — clay pit, charcoal burner and kiln
  is a three-building chain a 40-person town never runs. It is built **1/36**, so
  its +8 delivers nothing. Worth +5/36 raids-off on its own.
- **Population and health compete for the same labour.** A player that fills its
  site budget lifts mean health 37.3 → 42.3 but crashes mean peak 47.0 → 33.7.
  Tier 3 is a conjunction of two objectives that trade against each other.

## AB5. Z1's honest opening is cheap — keep it

`townHealth` now starts at **38.37** (`22 + 26.4 × 0.62` from START_STOCK), not a
flat 60. Day-1 `healthFactor` falls 0.800 → 0.692, −13.5%.

Measured cost: **−0.1% of town stock at day 3, −1.8% at day 10, −1.0% at day 20,
and no population difference at all.** The base *decays* 60 → 49.2 by day 10; the
honest opening *rises* 38.4 → 47.5, and they are equal by day 20. A town now
earns its health instead of being handed it.

## AB6. Open

- **Material throughput (wood/stone/plank) is the next lever** — AB4.
- **`military.js` must re-measure everything** now that armour exists — AB2.
- A **tier-2 Apothecary cannot run its recipe** (it needs ale from the tier-3
  Brewery), so its worker is a permanent `'no materials: ale'` idler. Accepted
  under Z2 — the +8 aura is the point — but it is a live UX wart.
- `ui.js` still promises "a market square and a barracks yard" at tier 3; the
  Barracks was dropped in X3.
- §9.8's table is now two addenda stale (X3, Z3). Recorded, not silent.

---

# ADDENDUM AC — The arms chain is unreachable, and the raid model is fine (FROZEN)

AB2 fixed the `iron_mine`/`tools` cycle. It did **not** make arms reachable.

## AC1. No town has ever produced a weapon

Adaptive player wanting the whole arms chain, paying for everything, n=36 per
arm, **200-day** horizon:

| | raids OFF | raids ON |
|---|---|---|
| produced **any** arm | **1/36**, first on day 89 | **0/36** |
| produced any **weapon** | **0/36** | **0/36** |
| Weaponsmith / Armoury ever built | 2/36 | 0/36 |
| Iron Mine / Bloomery / Blacksmith | 2/36 | 0/36 |

The one armed town in 72 runs produced **184 gambesons and nothing else**.

The structural reason, derived from the defs:

- **`spear` is the only arm below tier 3**, and it needs **six** buildings
  (sawmill, quarry, clay pit, charcoal burner, kiln, weaponsmith) because the
  Weaponsmith costs `brick: 8`. With the Armoury it is seven before one spear is
  stored.
- **Every armour piece needs 11–12 buildings.** A `gambeson` — tier-1 armour,
  recipe `cloth: 2`, no metal in it — still needs iron mine → bloomery →
  blacksmith, because **the Armourer costs `tools: 2`**. The cheapest armour in
  the game is iron-gated.
- **The Keep costs `iron: 12`**, so tier 4 sits behind the same never-run chain.

## AC2. The raid model is not the problem — it is emphatically correct

Measured on a fixture whose kit was **produced in-game** (construction materials
gifted and really spent; **no arm, iron, tools, steel, cloth or leather ever
gifted**), n=12 × 4 waves:

| garrison | net buildings lost, waves 3/6/9/12 | ravaged |
|---|---|---|
| unprepared (draft only) | 23.8 / 46.5 / 49.3 / 40.8 | **48/48** |
| Barracks, R1 rack spear only | 1.0 / 2.8 / 6.5 / 9.3 | 24/48 |
| **armed with produced kit** | **0.00 / 0.17 / 0.17 / 0.17** | **0/48** |

**The moment a garrison is actually armed, the model works** — 55× fewer
buildings lost at wave 12 than with the rack spear alone. Z5's "tier 3 under
raids is a `military.js` problem" is disproved: it is AB4's throughput problem
all the way down.

The load-bearing caveat: the arms chain needs roughly **170 days and ~190
workers** to put armour on one man. Real towns have 8.6 people and 5.1 buildings
at day 120.

## AC3. R1's rack spear is carrying the game — and is worth exactly nothing to
build past

Ablation, n=72 paired, raids on:

| | R1 on | R1 off | t | better/worse |
|---|---|---|---|---|
| raids held | 3.26 | 1.51 | **+7.62** | **40 / 0** |
| survivors | **38/72** | 23/72 | | |
| peak population | 28.61 | 25.18 | +3.60 | 25 / 1 |

Remove it and the held rate halves and fifteen more towns in seventy-two die.
**It stays, exactly as frozen in R1.**

But the marginal value of the chain it protects is **zero**:

| | Barracks only | + Weaponsmith + Armoury | marginal |
|---|---|---|---|
| R1 on | 10.00 power/man | 10.00 power/man | **+0.00 (0%)** |
| R1 off | 4.00 power/man | 10.00 power/man | +150% |

Both produced **298 spears**; under R1 all 298 sit in the armoury forever. The
town builds a seven-building chain and gains nothing, because **the only weapon
reachable below tier 3 is the same item the Barracks gives away.**

`_bestKitFrom` is correct and is not the problem.

**Frozen: the rack is drill kit, not smith's work.** A Barracks-issued weapon is
capped at **power 7**; a *crafted* spear remains power 10. The rack keeps the
floor that is demonstrably saving the game, and an Armoury becomes worth +43% on
the first rung instead of nothing. The Armoury's armour half was never flattened
— it is worth +82% hit points (132 → 238) — it is just iron-gated.

## AC4. Content changes to unlock the chain

- **`armourer` drops `tools: 2`.** One line, and it decouples the entire
  cloth-armour branch from the iron chain — a gambeson is cloth, and should
  never have needed a blacksmith.
- **`weaponsmith`'s `brick: 8` is the six-building tax on the only tier-2
  weapon.** Reprice it in tier-2-reachable materials.
- **`keep`'s `iron: 12`** puts City behind the same chain. Reprice.

## AC5. H3/K's decline curve is stale and is un-frozen

Measured against a town **stronger** than H3's reference (337 dps / 12,291 hp
against 245 / 10,310):

| wave | 12 | 16 | 20 | 25 | 30 | 40 |
|---|---|---|---|---|---|---|
| H3/K recorded | 0 | 0 | 0.5 | 3.9 | 9.2 | 33 |
| measured, own kit | **2.0** | **4.8** | **15.3** | **38.3** | **66.8** | **140.2** |
| measured, hand-stocked (H3's own fixture) | 1.8 | 2.8 | **9.3** | 18.2 | 45.5 | 133.3 |

**The kit is not the cause** — H3's own hand-stocked fixture is 19× off its
recorded figure at wave 20. Towns are overwhelmed at **wave 25 (~day 200)**, not
wave 30 (~day 270), and `_patience()` saturates at 180s from ~5 bodies on, so
every wave from ~12 presses for the full three in-game days.

H3's shape is **no longer a frozen target.** It is to be re-measured and
re-recorded honestly once throughput lands, not tuned toward.

## AC6. The fixture that hid AB2 for twelve addenda

`BIG_STOCK` in the QA library hand-stocks `spear: 60, sword: 40, gambeson: 40, …`
and is still the default for **every `makeTown()` in the suite**.

**Frozen: `BIG_STOCK` may be used for structural invariants and never again for
a balance number.** A production-based fixture now exists (`makeArmedTown`) where
every arm is endogenous. This is ADDENDUM N0's lesson in a second costume: a
fixture that grants what the game cannot make will report a game that does not
exist.

## AC7. Also measured

- **Charcoal is the chain's true choke** — the Bloomery sat at
  `'no materials: charcoal'` while the town held hundreds of wood and the
  Charcoal Burners read `'no materials: wood'`. A haulage failure, not a
  production one, and the same shape as W2.
- `iron_mine` hits `'resource exhausted'` by day 150 with two mines running.
- **`defencePower()` over-reports by ~12%** — it sums every soldier's kit power
  including Guard Tower archers, whom `_soldiersTick` skips. Left alone
  deliberately: it is UI-visible and other numbers may be calibrated against it.
- Every military invariant re-run and green: **~3,480 raids, `hardEnds: 0`**,
  `badEnemyPaths: 0`, K3's 0.0 soldier-seconds outside the perimeter (and walls
  now *save* men, 194 vs 239), equipment conservation 1,440 checks with 0 totals
  risen, N4's exact 50% loot, N6's draft floor and re-draft (first defender back
  in 0.10s, 8/8), `game:over` exactly once, mid-raid save 16/16 endings matched,
  and U4's melee reach clean across 10,867 damage calls.

---

# ADDENDUM AD — The rack cap, priced honestly (FROZEN)

## AD1. AC3's freeze was wrong about `_bestKitFrom`, and the agent was right to break it

AC3 said "`_bestKitFrom` is correct and should not change — a crafted spear must
simply now beat the rack, which it will once it is worth more power." **It would
not.** `_bestKitFrom` compared `WEAPON_RANK[stocked] <= ISSUE_RANK`, and a rack
spear and a crafted spear are both tier 1 — so a tier comparison can never see a
power cap.

Measured, one armoury holding crafted spears and nothing else:

| build | kit taken | power | armoury spear used |
|---|---|---|---|
| pre-AC3 | issued | 10 | no |
| **cap only, `_bestKitFrom` untouched** | **issued** | **7** | **no** |
| cap + power-based test | crafted | 10 | **yes** |

Cap-only is strictly worse than doing nothing: the floor drops and the chain is
still worth +0.00. **Frozen: the rack-vs-stock decision is on power, not tier
rank.** A frozen instruction that makes its own goal unreachable should be
broken and reported, which is what happened.

## AD2. The cap is 9, not 7 — priced against what it actually buys

AC3 froze the cap at 7 on a predicted +43%. That prediction was right about the
unlock and wrong about the price. Measured, n=72 paired, real games:

| | rack 10 | rack 7 | t | better/worse |
|---|---|---|---|---|
| raids held | **3.60** | 2.58 | 5.86 | 33 / 5 *for rack 10* |
| peak population | **35.15** | 31.74 | 2.95 | 23 / 6 |
| final population | **7.08** | 4.86 | 2.61 | 28 / 11 |

And the rung it prices is reached by **almost nobody**: at a 200-day horizon
with a player that wants the chain and AC4's repricings landed, **1 of 72 towns
ever built a Weaponsmith, 0 of 72 built both**, and every one of them was dead by
day 200. So the +43% is a fixture-only number today, while the cost is paid by
all 72 towns.

The sweep (held raids against rack 10):

| cap | cost | unlock |
|---|---|---|
| 9 | −0.40 (t 3.32) | **+11%** |
| 8 | −0.71 (t 5.93) | +25% |
| 7 | −1.01 (t 5.86) | +43% |

Any cap below 10 flips the preference, so the qualitative unlock — a crafted
weapon beating the rack — is available at **cap 9 for 40% of the price.**

**Frozen: `ISSUE_POWER_CAP = 9`.** Revisit only when AC4's reachability is
actually demonstrated in play rather than in a fixture.

## AD3. H3's *shape* survives; its magnitudes were fiction. No constant changed.

`RAID_GROWTH` stays 1.17 and `_patience()` is untouched, on three pieces of
evidence:

- **AC5's arithmetic was wrong too**: wave 25 is **day 230**, not ~day 200.
- **`_patience()` does not shape the curve.** Measured durations: 32s (w8), 58s
  (w20), 101s (w25) against a 180s cap. Raids below wave 30 end because the
  attackers die, not because patience expires.
- **AC5's numbers were measured pre-AC4.** Same 12 seeds, old constants vs new:
  w25 19.67 → 14.00, w30 55.50 → 40.83. AC4's repricings moved the curve back
  onto H3's intent; the raid model never needed touching.

**Recorded replacement for H3/K's table** — n=36, production fixture, town at 51
soldiers / ≈322 dps / 12,133 kit hp / pop 199, stronger than H3's own reference:

| wave | 8 | 12 | 16 | 20 | 25 | 30 | 35 | 40 |
|---|---|---|---|---|---|---|---|---|
| day | 89 | 126 | 158 | 190 | 230 | 270 | 310 | 350 |
| bodies | 7 | 8 | 10 | 13 | 18 | 29 | 61 | 120 |
| **net buildings lost** | 0.7 | 0.8 | 1.8 | 2.7 | 12.4 | 40.4 | 98.3 | 138.3 |
| men lost | 1.6 | 2.1 | 4.0 | 7.9 | 33.7 | 109.5 | 154.0 | 167.1 |
| **ravaged** | 5/36 | 4/36 | 7/36 | 11/36 | 26/36 | 34/36 | 36/36 | 36/36 |
| hard ends | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Comfortable through wave 20 (day 190), fighting hard at wave 25 (day 230),
overwhelmed at wave 30 (day 270) — **H3's intended shape at H3's intended days**,
with the ravaged share climbing 11/36 → 26/36 → 34/36 so the fall is visible for
~80 days before it lands. H3 recorded 0/0/0.5/3.9/9.2/33 and no ravaged share at
all; those magnitudes were never measured.

## AD4. AC4 did not unlock the arms chain

With `armourer`'s `tools`, `weaponsmith`'s brick and `keep`'s iron all repriced:
**1/72 Weaponsmiths, 0/72 Weaponsmith + Armoury at day 200.** Prioritising arms
ahead of the civic list and raising the site budget moves it to 4/72 and 2/72 —
still all dead.

**The block is not price. It is that towns die around day 100 and never reach
tier 2's back half.** AB4's throughput ceiling is still the only thing that
matters.

## AD5. Two harness defects worth carrying forward

- `r1kit.mjs` filtered arms with `ITEMS[k].cls === 'arms'`, but `cls` is
  `'good'` and the marker is `category`. The predicate never matched, so its
  "arms in town" and "issued arms as loot" figures were **vacuously 0**.
- `r1seal.mjs` reports 10 "risen" totals on old and new builds alike because its
  census counts building inventory only, so kit recovered from `raid.fallen`
  legitimately re-enters stock. `t_equip`'s full-ledger census (stock + on men +
  fallen) is the authoritative one and reports 0. AA5's blind door, a third time.

---

# ADDENDUM AE — City exists; the health gate is the last ceiling (FROZEN)

## AE1. Measured

| n=36, day ≥10 | raids OFF | raids ON |
|---|---|---|
| tier ≥3 | 7/36 → **10/36** | 0/36 → **5/36** |
| **tier 4 (City)** | 0/36 → **3/36** | 0/36 |
| meanTier | 1.78 → 1.97 | 1.42 → 1.64 |
| meanPeak | 41.8 → **57.9** | 34.7 → 38.6 |

n=72 paired: tier ≥3 **11/72 → 21/72** (t = 2.56, better/worse 21/7) raids off,
**4/72 → 9/72** (t = 2.11) raids on. Plank production **+148%**. **City has now
been reached in play.**

Gap closed without gifting anything: **27% raids off, 56% raids on.**

## AE2. Four diagnoses worth keeping

- **Stone is inert.** Gifting 200 stone is *worse than gifting nothing*
  (6/36 vs 7/36 baseline). ADDENDUM AB4's "wood + stone + plank" was really
  **wood and plank**; the stone third measured nothing. **Every future materials
  claim must be decomposed by item.** Repricing the health buildings into stone
  is the first thing that has ever given stone a use.
- **The Woodcutter was the worst-provisioned gatherer in the game** —
  `yield 2 / basket 4` (3.83 units/trip) against the Forager's and Fisher's
  `yield 5 / basket 10` (9.3), for a *longer* trip. The food gatherers were tuned
  through five rounds; the goods gatherers sat at their day-one numbers and
  nobody looked.
- **U3's patch floor read the candidate as if it were alone on the patch**, so
  **nine Forager's Huts passed the same test on the same berries**. Regrowth is
  now shared across every hut that reaches a tile.
- **Only porters and the jobless ever reached `claimTask`** — so a quarter of
  every goods worker's day was idle labour the queue could not see, while the
  stall itself *was* a haulage problem. A worker whose workplace is stalled on
  something standing at the door now joins the haul queue.

## AE3. T5's remaining blocker is the health gate, and it is content

`townHealth >= 58` is the tight gate on both builds. Ever-met at day ≥10:
pop ≥40 **16/36**, Market+Chapel **18/36**, **health ≥58 12/36**, all four 10/36.

Hand the *baseline* town **600 free units** and health still only reaches
**19/36** while population reaches 32/36. Health 58 needs `varietyScore ≈ 58` —
four to five distinct food groups at ≥4 stored — and measured towns run
**2.44 → 2.78 groups, 2.98 even when gifted.**

**The gate asks for a food roster the town has not the labour to staff.** This is
not a throughput problem; more materials do not buy it.

**Frozen: tier 3's health gate drops 58 → 50.** A Town with three to four food
groups and health around 50 is a plausible town; requiring four to five makes the
mid-game look like the late game. Tier 4's 68 is unchanged — a City *should* eat
well.

## AE4. Storage does not scale between tier 1 and tier 3

The Stockpile (now 500) is the only goods store below the **tier-3** Warehouse,
and the Warehouse is priced in brick — of which stock is still ~0 at tier 2. A
town that grows past 60 jams again, and `roomForClass` reports class room, so the
`'storage full'` alert fires late.

**Frozen: the Warehouse moves to tier 2 and is repriced out of brick.** Likewise
the **Townhouse** — tier-2 housing priced in a tier-3-and-lucky material is the
same mistake as AC1's gambeson.

The brick chain is now two buildings rather than three (the Kiln fires with wood;
the Bloomery, Foundry and Smokehouse keep charcoal), and brick production went
0.03 → 0.21/day — but stock is still ~0 at tier 2. **Anything still priced in
brick is effectively tier-3-and-lucky**, and the static content check does not
catch it because brick *is* technically obtainable.

## AE5. Also fixed, and one still open

- **`villagers.restore` cleared the phase of any villager without a job** — and
  §9.3's unemployed haulier is exactly that, so a jobless carrier mid-haul lost
  `TO_STORAGE`/`TO_TOWN` and a jobless builder lost `VS.WORK`. Save round-trip
  faults **23 → 4**.
- The remaining 4 are **`military.kits` dropped on restore** — a soldier's
  equipment does not survive a save. Still open, in `military.js`.
- **`economy._wantsOf` is dead code** (`_bWants` routes every call to
  `buildings.wants()`). It silently caps a hopper at four batches and would bite
  whoever re-enables it.
- `tLedger`'s **third** blind door: §16.10's forced demolition refunds a built
  building's cost and the shared ledger has no sink for it. It reported 48 false
  "breaches"; `tLedgerY` covers it and reports **0 across 480 disrupted
  town-days**.

## AE6. The population/health labour tension did not resolve

A player that fills its site budget is now simply **worse on both axes** —
health 41.9 vs 45.2, peak 41.8 vs 57.9, tier ≥3 6/36 vs 10/36 — and more
throughput *widened* the peak gap (5.1 → 16.1) rather than closing it. AB4's
"health up, peak down" trade does not reproduce on this seed set.

## AE7. Trips per gatherer-day are still 0.24–0.73

Against ADDENDUM V2's stated target of 2–3. The forester now spends 16.5% of the
day hauling and **2.9% harvesting**; the quarrier 23.2% and 3.3%. `stalledHaul`
converted blocked time into haul time and unjammed the chain, but **32–42% of the
day is still meals, sleep and commuting.** That is the next travel-side number,
and V1's original finding has survived every round since.

---

# ADDENDUM AF — Breadth, not bulk (FROZEN)

## AF1. The site budget is a harness cap the game does not impose

The measurement player is **site-blocked on 64% of town-days** at its
`MAXSITES = 2`. Raising it to 4 lifts mean peak population 54 → 66 and tier ≥3
from 9/36 to 12/36; 6 is identical to 4. **The game imposes no such cap.**

So an unknown share of every "the town cannot afford it" result in this project
has been the harness refusing to queue a third building. This is ADDENDUM N0's
lesson a third time: a fixture constraint read as a game constraint.

**Frozen: the measurement player queues up to 4 concurrent sites**, and any
future claim that a town "cannot build X" must state its site budget.

## AF2. Breadth is the lever; bulk is not

Standing daily delivery from day 20, n=36 raids off:

| gift/day | tier ≥3 | meanGroups | meanHealth |
|---|---|---|---|
| none | 11/36 | 2.75 | 44.8 |
| **berries ×16** (one group) | 11/36 | 2.80 | 47.6 |
| **grain/eggs/honey/fish ×4** (same 16 units, four groups) | **15/36** | **5.34** | **69.2** |
| those four ×16 (64 units) | 16/36 | 4.91 | 65.7 |

**The same sixteen units a day, spread across four groups instead of one, is
worth +4/36 tier 3 and +24 health. Quadrupling the quantity on top adds +1/36.**

And variety is **not** a haulage problem — for every food, "ever made" equals
"ever ≥4 in a store". It is a **roster** problem: only berries (23/24), mushrooms
(22/24) and venison (23/24) are near-universal — **two groups**. Fish 13/24,
grain 7/24, eggs 6/24, honey 9/24, cabbage/carrots/apples 6/24, milk 3/24,
cheese/pork/smoked fish **0/24**.

The tier-2 food roster exists and is simply never built: Wheat Farm 9/24,
Chicken Coop 10/24, Apiary 10/24, Vegetable Garden 8/24. Materials are not the
reason — sited buildings finish (9 sited → 9 built) and stalled sites were short
of a material on 0–22% of site-days, always wood.

**This is the last real lever in the game, and it needs a diagnosis, not a
number.** Why does a town that is starving for variety not build the four
buildings that would give it? Candidates: the player's want ordering, the food
buildings' labour cost against a town of 35, siting requirements, or the fact
that a hut on berries is always cheaper than a farm.

## AF3. A full store is not a failure

Goods producers are stopped on storage **57% of town-days** even after the
Warehouse tripled class capacity, because J3.1 caps any single item at 40% of a
store and wood and stone are what fill it. The honest `'storage full'` alert now
fires on **65% of town-days** — truthful, and close to useless.

But most of that is a woodcutter idling because **the town already has all the
wood it needs**, which is a healthy state, not a fault. The chain itself is
unjammed: the Sawmill's `'no materials: wood'` went 19.9% → 0.4%.

**Frozen: `'no storage: <class>'` is raised only when the item is actually
wanted somewhere** — a consumer short of it, or a construction site needing it.
A producer at capacity with nothing downstream waiting is **idle at capacity**,
and should read that way. §16.8 requires every stopped building to name a reason
with a fix the player can perform *right now*; "build another Stockpile for wood
nobody needs" is not one.

## AF4. Population binds, and the gate stays

Of the days a failing town was **one condition short** of tier 3, it was
population on **127 of 127**. Peak-population quantiles: p10 20, p25 24, median
36, p75 81, p90 116, max 140.

**Pop ≥40 stays.** It sits just above the median and a quarter of towns clear it
twofold — this is not X3's "gate above the mean peak". The gate is fair-shaped;
the **distribution** is the problem, and what separates a 36-peak town from an
81-peak town is whether the early food roster landed. Which is AF2.

On days a town is under 40, immigration is allowed on 6% of days (refused: no
free housing 47%, food < 3 days 44%) and births on 24% (no free bed 53%, health
< 35 38%).

## AF5. My error: the Townhouse is tier 3

ADDENDUM AE4 called it tier-2 housing. It is **tier 3** — so it cannot help a
town reach tier 3, and it was repriced but not moved. A probe measured nothing
because the measurement player only asks for it at `tier >= 3`.

**Frozen: the Townhouse moves to tier 2**, and the measurement player must want
it there. If density is the answer to pop ≥40, the building that provides it
cannot sit behind the gate it is meant to open — the same shape as Z3's tier-4
defect and AC1's gambeson.

## AF6. Recorded

- **Warehouse at tier 2 works**: built by 3/24 towns → **8/24**, median first day
  62 → **30**, pressured town-days without one 908 → 449. The pop-40–60 jam is
  essentially gone (zero-free-room days 33% → 4%); 60–80 is halved, not solved.
- **Brick rule applied**: nothing of tier ≤2, and nothing a tier gate *requires*,
  may cost brick — brick runs 0.21/town/day and the Kiln is built by 5/24 towns.
  Repriced out: Warehouse, Townhouse, Armoury, Keep, Town Hall. Left in
  deliberately: the eleven tier-3 defs for which brick is *the* tier-3 material,
  and `iron_mine`. **This class of bug is not statically checkable** — brick is
  genuinely obtainable, so only a throughput measurement can see it.
- **Tier 4 unmoved** (2/72 off, 1/72 on). Keep and Town Hall are affordable in
  stone now, but pop ≥75 is the p72 of peak population and health ≥68 wants five
  food groups: the same food problem one tier up.
- `economy._wantsOf` is still dead code silently capping a hopper at four batches.

---

# ADDENDUM AG — N0, a fourth time (FROZEN)

A round reported, as a correction, that **ADDENDUM L1's ratio target is met
(4.97 naive / 5.77 competent against 4–6) and every §15 row is reached, with
Town at day 32 under raids.**

It is not. Both harnesses behind those numbers — `player5.mjs` and `ratio3.mjs` —
contain `b.built = true; b.progress = 1e9`. **Nothing is paid for, nothing takes
time to build, nothing is hauled.** That is the N0 violation verbatim, and the
same round's *earlier* "target not met at 3.70" came from the same harnesses, so
both figures are inadmissible.

**The authoritative numbers stand**: measured with a paying player, tier ≥3 is
**24/72 raids off and 14/72 raids on**, the food-worker ratio is ~3.5, and **T5
is unmet.**

## AG1. The count so far

Four distinct times, a fixture constraint or grant has been read as a fact about
the game:

1. **N0** — the scripted player never paid for a building. Four rounds of §15 and
   ratio numbers invalidated.
2. **AC6** — `BIG_STOCK` hand-stocked arms, hiding for twelve addenda that **no
   town could produce a single weapon**.
3. **AF1** — the player was capped at 2 concurrent sites, blocking it on 64% of
   town-days, when the game imposes no cap.
4. **AG** — this one.

**Frozen: a harness claim is inadmissible until the harness has been read.** Not
"the agent says it pays" — *read the file*. Every one of these four passed review
on the strength of a confident report.

And the tell is always the same shape: **a number that is dramatically better
than the last honest measurement, arriving without a mechanism that explains
it.** Town at day 32 under raids, against 14/72 ever reaching it, needed a
cause. There wasn't one.

## AG2. My orchestration error, recorded

That round was told `constants.js`, `world.js`, `villagers.js` and `buildings.js`
were its files. **Another agent was editing three of the four at the same time** —
the basket rework, `minPerDay`, `outputCap`, `winterMult`, and the
`'no road'`/`'cut off'` split. Nothing was lost and the combined result is better
than either round alone, but that was luck: both were pulling on food throughput
in the same functions, and one re-tuned `FOOD_PANIC_DAYS` against measurements
the other invalidated within the hour.

Disjoint file ownership is the whole basis on which parallel agents are safe
here, and I broke it. It is also why a stale report can arrive hours later
describing a tree that no longer exists.

## AG3. Worth keeping from that round anyway

- **M's own levers reached 3.70, not 4–6** — the agent was right the first time,
  and right to say the later basket work is what carried the ratio. Both were
  needed: M1's full-load rule and M3's door contract make baskets worth
  anything, and M2's 74-second day is what lets a basket trip finish.
- **M1's yield curve is obsolete**: re-run today it is flat at 10.00 units/trip
  across yields 2→16, because `gathers.basket` now governs the load and `yield`
  is only the per-node bite. The curve was real and did prove M1; it describes
  superseded code.
- `render.js`'s `SKY_STOPS` still paints full night at t=0.18 and t=0.94 against
  a 0.18–0.92 work window — **this was fixed earlier in the session and has
  since been reverted or lost.** Worth re-checking.
- **Competent siting is now worth only ~16% over naive** (down from 2×). §6's
  road-and-siting mechanic has lost most of its teeth as a skill expression,
  which is worth a decision rather than a drift.

---

# ADDENDUM AH — Nobody told the army that people leave (FROZEN)

## AH1. The root cause was not in `restore`

`military.js` subscribes to `villager:died` and **not to `villager:left`**.
`villagers.finishLeaving()` sets `v.removed = true` and emits `villager:left`
with no death event — so an emigrant's `kits`, `hpById`, `intents` and `drafted`
rows stayed in `military` forever, and `_villager()` kept happily resolving him.

That produced an **asymmetric save**: `serialize()` wrote rows keyed on men that
`villagers.serialize()` (which skips `v.removed`) does not carry, and `restore()`
— correctly, by its own existing filter — dropped every one. **A living armed
soldier's kit always round-tripped fine.** What vanished was the bookkeeping for
men who had walked out.

Fixed: `_onVillagerLeft()` drops every row keyed on the emigrant (he is **not** a
casualty — no loss booked, nothing to `raid.fallen`, so the 50% roll cannot mint
his kit back); `_villager()` returns null for a removed villager; and
`serialize()` writes only rows the save will carry.

**All 9 military save faults → 0.** 288/288 kit fields identical after restore
across tier-0 through tier-4 kits, shields, ranged weapons and 96 issued rack
spears at the cap-9 power, mid-raid saves included. The `issued` seal holds
through a reload: 857 issued kits before and after, 0 weapons reaching
`raid.fallen`, 0 minted by the recovery roll, 0 arms totals risen across 72
restored raids.

## AH2. This is a leak *class*, and it needs an audit

`military` is simply the module that got checked. **`economy.js` and
`buildings.js` also key state on villager ids** — tasks, worker lists, home
assignments — and if either listens only to `villager:died`, it has the same
leak.

One concrete tell already in the code: `_refreshSoldiers` had to guard
`!this._villager(b.workers[k])`, which says **dead and departed men do linger in
`b.workers`.**

This is the fourth time in this project a frozen event has had a missing or
one-sided listener (§11's `paths.setGate`, `task:completed`,
`villager:arrived`/`left`, and now this). **Frozen: every module holding state
keyed on a villager id must handle `villager:left` as well as
`villager:died`**, and the two must be audited together — an emigrant and a
corpse leave the same hole.

## AH3. Open

- **`villagers.restore` still loses `state`/`phase` for a jobless idler carrying
  cargo** — 3 faults in 36 seeds × 120 days, the last non-zero entries in the
  whole-game round-trip. Same §9.3 unemployed-haulier class fixed in AE5; this is
  the residual variant where the man is an idler with cargo and no task.
- **An emigrant walks out wearing his kit.** Chosen deliberately as pure loss
  (totals may fall, never rise) over returning his gear to the Armoury, because
  the return path is a balance change and the `issued` seal makes it non-trivial.
  Now that the arms chain is reachable at all, whether a town keeps a departing
  soldier's plate is a design call worth making.
- **`r1seal.mjs` reads as failing** (10 item totals risen, `sword 25→37`) on both
  the fixed and baseline trees. Superseded by `ac3seal.mjs`, which runs the same
  seal on barracks-only towns and reports 0 risen over 36 censuses — `r1seal`'s
  towns have stocked armouries, so its premise no longer matches what they
  produce. Retire or re-baseline it before the next agent chases it.

---

# ADDENDUM AI — Tier 1 cannot clear its own gate (FROZEN)

## AI1. The headroom table

The clearest statement of what has been wrong with this game's arc:

| tier | groups | items | max varietyScore | max healthTarget | gate | **headroom** |
|---|---|---|---|---|---|---|
| **1** | **3** | **4** | **41.8** | **47.9** | **45** | **2.9** |
| 2 | 6 | 13 | 94.6 | 80.7 | 50 | 30.7 |
| 3 | 6 | 18 | 100 | 84.0 | 68 | 16.0 |

**A tier-1 town's theoretical maximum health is 47.9 against a gate of 45.**
Near-perfect play for 2.9 points of slack — and measured towns average a
varietyScore of 27.4, giving healthTarget **39.0, six points under their own
gate.** Starvation (6% of days) and winter-wood (4%) are both negligible; this
is a ceiling, not an accident.

Consequence: only **13 of 24 towns reach tier 2 at all** in 120 days, and on
**48% of tier-1 town-days health is the single missing condition** (population
7%, granary/stockpile 0%).

## AI2. The cause is ADDENDUM Z2, one tier down

**Dairy and sweet sit at 0% of tier-1 town-days**, because their only
non-tier-3 sources — the Chicken Coop and the Apiary — are **both tier 2.**

So "the tier-2 food roster is never built" (AF2) was the wrong question. It was
never **unlocked**. The gate demands a roster that lives behind the gate — the
same circular lock as Z2, at tier 1→2 instead of 3→4, and invisible for the same
reason: nothing checked whether a tier's *reachable* food could clear the gate
out of it.

**Frozen: the Apiary moves to tier 1**, repriced `{wood: 8, plank: 4}` →
`{wood: 14}` (plank needs the tier-2 Sawmill, so the old cost was itself a
tier-2 dependency). Tier 1 becomes **4 groups / 5 items — ceiling 56.1, headroom
11.1.**

**A new static content rule fires on exactly this defect**: a tier's reachable
food roster must be able to clear the health gate out of that tier. It is silent
on the fixed tree. This is the third static invariant in `constants.js`, after
I1's obtainability and Z3's tier-gate rule — and like both of those, it only
exists because something got through.

## AI3. ADDENDUM AF1 is amended — four sites is not universally better

AF1 froze "the measurement player queues up to 4 concurrent sites" on evidence
from peacetime runs. Measured with raids on, it is **worse**:

| | sites 2 | sites 4 |
|---|---|---|
| tier ≥3, raids **off** | 11/36 | **12/36** |
| tier 4, raids off | 2/36 | **3/36** |
| mean peak, raids off | 54.1 | **63.2** |
| tier ≥3, raids **on** | **7/36** | **3/36** |

Plank per town-day falls 0.58 → 0.23: four half-built sites spread the builders
thin, and the raid takes them unfinished.

**Frozen: the measurement player reports both budgets, and a raids-on claim uses
2.** The finding itself is a real piece of game design — under pressure,
finishing one building beats starting four — and it is the first time a *player
strategy* has shown up as measurable skill rather than a harness artifact.

## AI4. The `villager:left` audit confirmed AH2

Predicted and found: **16 of 16 emigrants leaked an `economy.groupRecency` row,
and the save carried 27 phantoms.** Both now zero, and `economy.js` listens for
`villager:left` alongside `villager:died`.

That is the fourth frozen §11 event found with a missing or one-sided listener,
and the second module holding permanent state keyed on men who had simply walked
out of the valley.

---

# ADDENDUM AJ — Playtest feedback, and the Next Milestone panel (FROZEN)

First human playthrough. Three findings, all from actually playing it.

## AJ1. Confirmed working

- **"The first raid was fair — enough warning, and you really only need a
  barracks to defend it."** That is exactly the promise in ADDENDUM G1 and §17,
  and it took R1 (the Barracks issuing its own arms), U4 (the melee-reach seam
  and town-centre-last objective) and AD2's rack cap to get there. It lands.
- **"The alerts are useful for knowing what I should build next."** §13 calls the
  alerts panel the single most important legibility feature in the game, and
  priority 2 of the frozen priority order is that a player can always answer
  "why is this not working?" in under ten seconds. Confirmed by a human.

## AJ2. The gap: alerts are reactive, nothing is directional

> *"A Next Milestone objective could also be useful to give you a goal once
> you've dealt with all the more important alerts."*

This is §17's "is there ever a 60-second stretch with nothing to decide?" and the
honest answer is **yes — once the alerts clear.** The alerts panel tells you what
is *broken*. Nothing tells you what you are *working toward*.

**Frozen: a Next Milestone panel.** It shows the next town tier and every
condition for it, each with its current value against what is needed, and which
are already met. At the top tier it says the valley is yours and switches to
holding it.

Everything it needs already exists: `TIERS` carries `pop`, `health`, `happiness`
and `requires` per tier, and `economy` exposes all four live.

## AJ3. Why this is more than a convenience

It incidentally fixes the **worst legibility failure left in the game.**

Measured: a town following the intro's own advice reaches **29 days of food
while health sits at 32** and the population halves. Food *quantity* is never the
killer — **variety** is. Health is driven by distinct food groups, the tier-2
gate wants 45, and **nothing in the UI has ever told the player that.**

A milestone panel naming "health 45 — you have 32" puts the hidden blocker on
screen for the first time, and the existing health hover already explains which
food groups are missing. The chain from "I am stuck" to "I need a second kind of
food" becomes walkable without reading `DESIGN.md`.

That makes this a §16.8 fix as much as a feature: the game's real failure mode
has been invisible, and §13's legibility duty was unmet for it.

## AJ4. The milestone is a fixture, not a fallback

Second piece of playtest feedback, and it overrides AJ2's framing:

> *"Making it to a village was a bit of a surprise to me during the playthrough
> rather than an objective."*

The tier-up **fired without the player knowing it was coming.** §17 asks "does
unlocking a tier feel like an event?" — the celebration modal works, but it
landed as a *surprise* rather than a payoff, because nothing had ever told them
Village was a destination.

**Frozen: the Next Milestone is visible from day 1 and stays visible.** A goal
the player only sees once their problems are solved is not a goal, it is a
consolation prize. Two consequences:

- **Progress must be legible at a glance**, not only as a list of conditions —
  the player should watch a gap close. That is what converts the tier-up modal
  from a surprise into something they earned.
- **It must coexist permanently with a full alerts panel.** The alerts panel is
  the feature this same playtester singled out as the most useful thing in the
  game; the milestone must not crowd it. The top bar, beside the tier name that
  already reads "Hamlet", is the more likely home than a second left-hand panel.

And it must **read differently from an alert.** Alerts are already doing the
"what should I build next" job well for urgent things, by the same playtester's
account. The milestone is the long arc — a destination, not a problem.

---

# ADDENDUM AK — The resource row tells you nothing (FROZEN)

Third piece of playtest feedback:

> *"The plank icon is a little confusing, and while it's clear in the build menu
> how much things cost, the resources in the top right aren't made clear. I'm
> not sure how to gather the items after planks."*

Three separate faults, and two of them are mine from §13.

## AK1. The plank icon was a saw

`ITEMS.plank.icon` was **🪚** — which reads as the *tool*, or as the Sawmill, not
as the material. Changed to **🟫**, a board, distinct from timber's 🪵 log.
Fixed.

## AK2. The row shows two resources the player cannot obtain

§13 froze the key-goods row as **`wood, stone, plank, iron, tools`**, and
`HUD_GOODS` implements it literally. But **iron and tools are tier 3**, behind a
six-to-eleven building chain that ADDENDUM AC1 measured as effectively
unreachable — *no town in 72 runs has ever produced a weapon*.

So a tier-1 player permanently watches two unlabelled counters reading 0, for
materials they cannot make and the game never mentions again. That is the
opposite of §13's purpose, and like every other number in §13 it was written
before a single measurement existed.

**Frozen: the key-goods row is tier-aware.** Show what the player can actually
obtain now, plus what the next tier opens — and if a locked good is shown, it
must read as *locked*, not as *zero*. A counter at 0 means "you ran out"; a
counter that can never move means the UI is lying about the state of the world.

## AK3. Nothing says where a resource comes from

The build menu states costs clearly — the playtester confirmed that. But there
is **no path from "I need planks" to "build a Sawmill"**. The player can read
what a thing costs and still have no idea how to obtain it.

§16.8 requires every stopped building to name a reason with a fix the player can
perform right now. **The same duty applies to a resource**: seeing a number you
cannot act on is the same failure as an idle building with no reason.

**Frozen: every resource in the HUD carries a hover explaining what produces it
and what it is for.** Both are derivable from `constants.js` with no new data —
the producer is whichever def has the item in `recipe.out`, `gathers.item` or
`grows.item`; the consumers are the defs listing it in `cost` or `recipe.in`.

This is the same shape as ADDENDUM AJ3's health/variety blind spot: the
simulation knows the answer, and the UI has never said it out loud.

---

# ADDENDUM AL — Half the hills are invisible (FROZEN)

Fourth piece of playtest feedback:

> *"Flat ground vs hill is sometimes not clear. I think this depends on the
> direction of the hill. Makes it hard to determine why I can't place a
> building."*

The direction-dependence is real and the cause is exact.

## AL1. Cliff faces are drawn on two edges of four

`render.js` draws a cliff only for the **west and north** neighbours, and only
when that neighbour is **higher**:

```js
this.cliff(g, world, tx - 1, ty, elev, ...);   // west
this.cliff(g, world, tx, ty - 1, elev, ...);   // north
```

So a tile raised above the ground in *front* of it — to the south or east, the
two edges facing the camera — draws **no side faces at all**. It simply floats
`elev * 4px` higher with nothing to explain why. Approach the same hill from the
other side and it is plainly a hill.

**Frozen: a raised tile draws its own visible side faces.** The two
camera-facing edges are exactly where a step in elevation should read, and they
are the two currently missing. 4px of unexplained lift is not a hill; it is a
rendering artifact the player is being asked to infer a rule from.

## AL2. A refused placement must show *which* tiles refused

§7's check 4 rejects a footprint spanning more than one `world.elev` value with
`'needs flat ground'`. ADDENDUM P3 made every refusal state its real reason, and
ADDENDUM AK3 established that naming a problem the player cannot act on is the
same failure as not naming it.

`'needs flat ground'` names the rule and not the ground. **Frozen: when a
placement is refused, the build ghost marks the offending tiles** — the ones
breaking the rule, not just the footprint as a whole. That generalises past
elevation: `'blocked'`, `'needs shore'` and `'a building is in the way'` all have
a specific tile behind them.

This is the third instance in this playtest of the same fault: the simulation
knows precisely what is wrong and the UI reports only that *something* is
(AJ3's health/variety, AK3's resource origins, and now this).

## AL3. Worth re-examining, not yet frozen

`world.elev` is **purely cosmetic** — the renderer lifts a diamond by 4px, and
picking deliberately ignores it (ADDENDUM F3). Its only gameplay effect is this
one placement rule.

So the rule buys nothing but friction unless the elevation is legible. AL1 and
AL2 should make it legible; if a playthrough after those still finds it
arbitrary, the honest options are to relax the rule to tolerate one step, or to
drop it. A purely decorative field should not be allowed to refuse a build the
player has no way to predict.

---

# ADDENDUM AM — The town outruns the calendar (FROZEN)

Playtest, after being offered a faster game speed:

> *"Changing the speed just lets me build more faster though. I do think the
> speed can be a little quicker, but we also need to adjust the gathering rate a
> little so that expanding the village requires more seasonal time (not real
> time)."*

The distinction is correct and it is one this project has never separated.
**Game speed is a real-time control**: at 6× a day costs 17 real seconds instead
of 33, but exactly the same number of in-game days buys exactly the same number
of buildings. It changes how long the player waits, not how much the town
achieves per season.

## AM1. The calendar is the clock, and expansion is beating it

Measured against §15's own intent, which has never been re-examined since it was
written:

| | §15 intends | playtest reached |
|---|---|---|
| Village | day 18 | ~day 18 |
| Town | **day 45** | **~day 35** |
| first Winter | days 37–48 | not yet seen |

§15 puts **Town at day 45 — inside the first winter.** The playtester reached
Town-adjacent at 35, before winter arrived at all, and so has never been tested
by the game's main seasonal pressure while it still mattered.

So expansion runs roughly **25–30% ahead of the calendar it was designed
against**, and the seasons have become scenery rather than a clock.

**Frozen target: a competent player reaches Village in late summer and Town
during or after the first winter**, i.e. Village ~day 20–24 and Town ~day 45+.
The measure is **buildings raised per season**, not per real minute.

## AM2. Slow expansion, not the food supply

The obvious lever is gathering, and it must be applied with care: **food breadth
is already the binding constraint** (ADDENDUM AF2 — sixteen units a day across
four groups is worth +4/36 tier 3, the same sixteen as one food is worth
nothing), and towns still die of variety rather than volume.

**Frozen: slow the *expansion* materials, not the food.** Wood, stone and clay
are what buy buildings; berries, venison and fish are what keep people alive.
Reducing food gathering would tighten the noose that is already the game's
leading cause of death, and would undo ADDENDUM W and X's work for no gain
against this target.

Non-food gathering was raised sharply in the throughput rounds — the Woodcutter
went `yield 2 / basket 4` to `yield 4 / basket 12` (AE2), which was correct at
the time because the goods chain was starving. This is a partial walk-back of
that, now that the chain runs.

`buildTime` is a second, cleaner lever for the same goal: it costs days without
costing materials, so it slows expansion without touching whether the town can
feed itself. The balance pass should weigh both and report which carries it.

## AM3. A human plays better than the harness

Worth recording, because it changes how much headroom there is. The scripted
measurement player reaches tier ≥3 on **10/36 seeds raids-off**; a human with
the alerts panel reached Village by 18 and Town-adjacent by 35 on their first
attempt.

**The game is materially more winnable for a person than the harness measures**,
because the alerts panel tells a human what to build and the scripted player
follows a fixed want-list. Every balance number in this project is therefore a
*lower* bound on real play — which is the right direction to be wrong in, but it
means there is more room to slow expansion than the harness alone would suggest.

---

# ADDENDUM AN — What the harness is for (FROZEN)

> *"The test harness has some value, but it's a bit limited. Good to evaluate
> where it is useful and use that strategy only when it makes sense. Rely on my
> play testing for human feedback when that does a better job."*

Correct, and the evidence from this project is unambiguous. **Every UI, pacing
and legibility insight came from one human playthrough; not one came from a
36-seed sweep.** Meanwhile the sweeps found defects no person would ever isolate.

## AN1. What the harness is genuinely good at — keep using it

- **Invariants.** Per-item conservation across ~2,960 audited town-days. Zero
  NaN. The 20,000-tick no-stuck sweep. Save round-trips. 4,500 raids all
  terminating. A human cannot check these and should never be asked to.
- **Regression detection.** "Did this change break something already verified" —
  the single most valuable thing it does, and the reason a 33-addendum contract
  has not collapsed under its own edits.
- **Static content checks.** The tier/cost obtainability rule found that
  `iron_mine` cost `tools`, tools need iron, iron needs the mine — **every
  weapon and every piece of armour unobtainable on every seed, for the entire
  project.** No playthrough would ever have found that.
- **Absolute blockers.** Zero births in 960 town-days. Villagers sealed into
  pockets. A town that could neither recover nor die. Stated as *"X never
  happens"*, which is exactly what a sweep can prove and a person cannot.
- **Root-cause isolation** once a symptom is already known.

## AN2. What it is bad at — stop using it for these

- **Feel and pace.** "Seasons take too long", "Village was a surprise rather
  than an objective", "the raid felt fair". §17's fun checklist is a human
  instrument.
- **Legibility.** "The plank icon is confusing", "I can't tell why I can't
  place this", "I don't know how to get the items after planks". The simulation
  cannot report that it failed to explain itself.
- **Absolute difficulty.** The scripted player reaches tier ≥3 on 10/36 seeds;
  a human reached Village by day 18 and Town-adjacent by 35 on a first attempt,
  because the alerts panel tells a person what to build and the harness follows
  a fixed want-list. **Every balance number here is a lower bound on real play.**

## AN3. The rule

**Use the harness to prove a thing never happens, or to prove a change broke
nothing. Use the playtest to decide whether the game is any good.**

When a question is about feel, do not commission a sweep — make the smallest
honest change and let it be played. A measurement round that answers a question
the player could answer in ten minutes is waste, and worse, it answers it with a
scripted player that does not play like a person.

Five times in this project a fixture constraint was mistaken for a fact about
the game (N0, AC6, AF1, AG, and my own mis-invocation of a raids flag). That is
not a reason to distrust measurement — it is a reason to be precise about what a
given measurement can and cannot see.

## AN4. The milestone panel validated, and what it revealed

> *"I didn't actually find Market until the new milestone overlay landed, so
> that is working, but pointed me at a building I had missed earlier."*

The panel (AJ) works as designed. But the more useful result is what it exposed:
**the player had never found the Market at all**, because it sits last in the
Food tab behind every tier-3 building (AN's menu-ordering fault). The milestone
rescued a *discovery* failure in the build menu.

That reclassifies the tier-sort from cosmetic to a content-visibility bug — a
building the player needs for the next tier was effectively hidden — and it
confirms AN3's rule from the other direction: **no sweep would ever have
reported "the player did not notice this building exists."**

**Frozen: the milestone's requirements are clickable.** A requirement naming a
building the player has not built takes them to it — the build menu on the right
tab, that entry highlighted. It closes the loop the player just walked by hand:
*the game told me I need a Market → now go hunt for it in a fourteen-entry
list*. The alerts panel already sets this idiom by panning the camera to an
offending building, and the same playtester called that behaviour useful.

## AN5. Two more discovery failures from the same playthrough

**Housing upgrades already work and are unmentioned.** `cottage → house →
townhouse → manor` via `def.upgradeFrom`: place the higher building over the
lower one and §7 charges the difference and keeps the residents. Verified live
at Village tier — `canPlace` ok, `costFor` returns `{wood: 2, plank: 6}` against
a House's outright `{wood: 8, plank: 6}`, the instance id is preserved so
`homeId` never dangles, residents kept, beds 4 → 7. The player asked for the
feature. It has been there all along.

**Soldiers have no health bar.** The hp bar lives in the enemy draw path only,
and `render.js` never reads `military.hpById` or `kitOf` — `role === 'soldier'`
only tints the figure. So a raid shows the player exactly how every raider is
faring and nothing about their own men, which is backwards: **the enemy's health
is information, the defender's health is the decision.** It also hides the thing
that makes an Armoury worth building — `SOLDIER_HP = {base 115, perPower 4.2,
shield 26}` puts an armoured man near 238hp against a militiaman's 132, and that
spread is currently invisible.

## AN6. The pattern, stated plainly

Six pieces of feedback from one playthrough. **Every single one was the game
failing to explain itself, not failing to work:**

| reported | reality |
|---|---|
| "seasons take too long" | pacing, real vs game time conflated |
| "plank icon is confusing" | 🪚 a saw, for a material |
| "not sure how to gather the items after planks" | the row shows two tier-3 goods that cannot be obtained, unlabelled |
| "hard to determine why I can't place a building" | hills drawn on two edges of four |
| "Apiary and Market are further down than I'd expect" | menu in authoring order; the Market was never found at all |
| "upgrading a house would be great" | it already works |

Not one was a simulation defect, and **not one would ever have surfaced from a
sweep** — which is AN3's rule earning itself twice over. The measurement rounds
found unobtainable armour, villagers walled into pockets, zero births in 960
town-days, and a town that could neither recover nor die. A person found that
nobody can tell what any of it means.

## AN7. "I don't know what I lost" — the costliest one

> *"The raid just hit me harder, which is fine, but now I lost some buildings
> and I'm not sure what they were to rebuild them."*

Note the first clause: **a harder raid is fine.** The failure is purely that the
player cannot recover the information needed to rebuild.

`ui.js` listens to `building:destroyed` and uses it only to clear the selection
and invalidate the alerts cache — **discarding `p.defId` and `p.x/p.y`**, both of
which §11 puts in the payload. `onRaidEnded` then renders "3 buildings burned"
from a bare count.

So the game knows the name and the map position of every building that fell, and
tells the player a number.

**Frozen: the after-action report names what was lost**, and a named building
pans to where it stood — the idiom the alerts panel already uses. The player's
next move is always "where was it, and can I put it back"; "3 buildings burned"
does not survive contact with that question.

This is the seventh discovery failure of one playthrough and the most expensive,
because it strands the player mid-game with information the game holds and will
not surface. Every one of the seven is the same sentence: **the simulation knows
precisely what happened, and the UI reports only that something did.**

# ADDENDUM AO — Corrections, and the cost of putting things back (FROZEN)

## AO1. AL1's diagnosis was geometrically inverted

ADDENDUM AL1 is **wrong about the cause** and is corrected here rather than
edited, per the append-only rule. The frozen *requirement* stands; the stated
reason does not, and anyone reading AL1 later would go looking for a bug that
was never there.

In this projection (`tcx = (tx−ty)·HW`, `tcy = (tx+ty+1)·HH`, painted in
ascending `tx+ty`) the camera-facing edges are the **bottom-right (E) and
bottom-left (S)** edges. The old `cliff(tx−1, ty)` and `cliff(tx, ty−1)` calls
were therefore already painting the camera-facing faces — the east face of the
west neighbour and the south face of the north neighbour — merely attributed to
the lower tile in front. The *set of faces was complete*.

The two real faults were:

1. Each face was drawn **before** the tile's own diamond, which is painted
   oversized with seeded corner jitter and ate 1.2–2.7px of a 4px face. The
   faces read as dark scratches, not banks.
2. Where ground **rises toward the camera** there is no side face to draw at
   all. Geometrically the riser faces away; the lifted tile simply overlaps the
   tile behind it. No face can ever fix that direction — it needs a different
   cue, and now has one (a brow on the N/W edge where the ground steps down
   behind).

**`ELEV_LIFT` is now 6, not 4.** Any prose quoting "4px of lift" — including
AL1's own closing line — means 6. Picking still ignores elevation.

## AO2. The number in the HUD must be the number the player can act on

Eighth discovery failure, and the same sentence as the other seven:

> *"Resources allocated to a build site still show in the resource menu, which
> means I can get a not enough stone warning when I have 60."*

A site **reserves** its cost at placement and hauliers fetch it later, so §7's
check 7 measures `economy.available()` = `stock − reserved`. The HUD resource
row reads `economy.stock()`. The build menu's affordability greying reads
`stock` too. Three places ask the same question and one of them asks it
differently, so the game refuses a building while displaying a number that says
it shouldn't.

**Frozen: the HUD shows `available`, and shows the reserved remainder beside it
rather than silently subtracting it.** A number that drops for no visible reason
is a worse defect than the one being fixed — the player must be able to see
where the stone went. Affordability greying and placement must be the same
question asked once.

`stock` remains correct for anything answering "how much exists in the world" —
stores panels, tallies, the after-action report. This is not a blanket rename.

## AO3. Repair

> *"Is there a way to repair a damaged building?"*

There was not. `buildings.repair(id, amount)` has existed and been exported
since the first build and **nothing has ever called it**. A damaged building
stayed damaged permanently; the only recourse was demolish and rebuild at full
price.

That makes a raid's damage an unconditional, unrecoverable loss, which is the
wrong shape. **A raid should cost the economy, not amputate it.** The good
feeling after a battle is the town spending materials and labour putting itself
back together — a recovery phase, not a second punishment.

**Frozen:**

1. **Player-initiated.** Free automatic regeneration would delete the economic
   cost of a raid, which is the point of raids.
2. **Cost is pro-rata on missing hp at half rate** — `ceil(missing × cost × 0.5)`
   per item of `def.cost`, never exceeding the full build cost, never zero.
   Repair must be strictly cheaper than demolish-and-rebuild or the mechanic is
   decorative.
3. **Cost locks when repair begins.** Further damage mid-repair does not
   retro-charge; the target is always full `maxHp`.
4. **It reuses the construction delivery path.** Reserve, haul, build. A second
   materials pipeline is how conservation dies.
5. **The building stays operational while repairing.** Workers keep their jobs.
6. **Cancellable, refunding reserved-but-undelivered** per the existing
   cancellation rule; destroyed mid-repair follows the existing wreck rule.

Repair is a **new material sink**, and per-item conservation is this codebase's
strongest invariant. Begin, cancel mid-haul, destroy mid-repair, damage during
repair, save/load mid-repair, and a raid damaging many buildings at once are all
conservation tests before they are feature tests.

## AO4. SPEEDS is the only list of gears

`main.js`'s `setSpeed` clamped the multiplier at a hardcoded `3` while
`constants.js` had grown a fourth gear at 6×, so the new speed was inert and the
pacing fix AM asked for could not be felt. `input.js` separately hardcoded
`Digit1–Digit3` and passed the digit through as a *multiplier* while `ui.js`
passed the same digit as a *gear index* — identical only by the coincidence that
`SPEEDS[1..3]` are `1, 2, 3`.

**Frozen: `SPEEDS` is the single source of the gear list.** Clamps, key
handling, button rows and hint text all derive from it, and adding a gear is a
one-line edit to `constants.js`. A digit key is a gear index everywhere; the
multiplier is only ever `SPEEDS[gear]`.

# ADDENDUM AP — Expansion is priced in labour, not in ore (FROZEN)

ADDENDUM AM asked for two levers: slow the calendar and slow gathering, so that
expanding costs **seasonal** time rather than real time. The second half is
**disproved and is hereby retired.** Do not attempt it again without reading
this first.

## AP1. Cutting gather rates buys no days and costs food

Decomposed by item, n=18, 72 days, raids off, Woodcutter output cut:

| Woodcutter | Village med | Town med | tier ≥3 | groups | health | starvation | plank | cheese |
|---|---|---|---|---|---|---|---|---|
| 4/12 (base) | 14.5 | 29 | 8/18 | 3.4 | 50.0 | 3.6 | 174.7 | 10.0 |
| 3/9 (−25%) | 15 | 28 | 8/18 | 3.2 | 48.5 | 4.1 | 176.4 | 4.6 |
| 2/6 (−50%) | 15 | 28 | 6/18 | 3.1 | 44.4 | 6.0 | 141.1 | 0.0 |

A 50% wood cut moves the Town median by **−1 day** — noise — while taking health
from 50.0 to 44.4 and starvation deaths from 3.6 to 6.0.

Two reasons, both structural:

1. **Sites are never short.** Over 727 site-days at the normal cadence, a site
   lacked a material on 1.7% of them. Mean standing stock: wood 203, stone 86.
   A town banking 200 wood cannot be slowed by cutting wood income.
2. **AM2 mis-priced the tree.** AM2 separated "wood, stone and clay buy
   buildings; berries, venison and fish keep people alive." Wood is upstream of
   **plank**, and plank prices the Wheat Farm, Windmill, Bakery, Dairy Farm and
   Cheesemaker — the entire tier-2 food roster that AF2 named as the binding
   constraint. Cutting wood tightens food breadth, which AM2 itself forbids
   tightening, by a path AM2 did not see.

## AP2. The milestone days are a population clock

Instrumenting the day each tier condition is first met: **population was the
last condition met on 14/14 towns that reached Village and 8/8 that reached
Town.** Village health 45 lands day 5, Granary day 12, Stockpile day 10 — then
the town waits ~5 days for its 24th villager. Town: health 50 day 7, Market day
16, Chapel day 18 — then **12 days** waiting for the 40th.

**Frozen, and §15 should be read through this:** nothing outside the
housing / food / health / immigration / birth chain can move a milestone day at
all. A lever that does not touch that chain will measure as noise no matter how
large it is. `buildTime` works only because it slows *housing*.

## AP3. The lever that was shipped

**Every `buildTime` ×5.** One file, one kind of number, no code path altered.
A builder now spends five times as long raising a building: Cottage 10 → 50
builder-seconds, Woodcutter 12 → 60, Market 20 → 100, Keep 70 → 350. Against a
74-second working day the average building the town raises went from **0.20 of
one builder's day to 1.02** — a hut is a day's work for one man, and a Keep is a
project.

Felt: place → raised went **1.8 → 2.8 days** mean, p90 3 → 5.

| raids off, n=36, 120d | before | after |
|---|---|---|
| Village median day | 14 | 16 |
| Town median day | 28 | **37** (first day of Winter) |
| tier ≥3 | 19/36 | 19/36 |
| tier 4 | 3/36 | **5/36** |
| starvation deaths / town | 4.9 | **4.9** |
| food groups (day ≥10) | 3.7 | 3.5 |

**The change delays Town without costing it**, and food is untouched — which is
the whole point, and the exact thing the gather-rate lever could not do.

Applying the ~1.2× human/harness ratio (the playtester ran 18 vs 14 to Village,
~35 vs 28 to Town) this maps to a person reaching **Village ~day 20 and Town
~day 45** — AM's frozen target, reached without tuning against the harness's
absolute days.

**`×2` is on the shelf** (Village 15 / Town 30 medians, tier ≥3 17/36) if ×5
drags in play. That is a playtest question and only a playtest can answer it.

## AP4. Two fixture warnings

- **`af/regress.mjs`'s conservation ledger is broken** and reports ~1,100 false
  breaches on *any* tree, baseline included: its `START_STOCK + building:produced`
  ledger counts a gatherer's in-field basket as matter existing before
  `building:produced` fires at the door. `tLedgerY` reports 0 on the same runs.
  Retire it.
- **The measurement player places at most one building a day**, capping
  buildings-per-season at 12 by the *fixture* and hiding materials effects behind
  a 200-wood bank. Seasons 1–2 of any per-season table understate a change; read
  seasons 4–6, or read place→raised latency, which is fixture-independent. This
  is AF1's shape, still live.

# ADDENDUM AQ — The repair contract (FROZEN)

ADDENDUM AO3 froze the *design* of repair. This records what the implementation
settled, and corrects the sections it contradicts.

## AQ1. Repair is the construction machine one level down

A repair **reserves** its cost out of `available()`, hauliers deliver through the
ordinary task queue, and builders turn the pile into structure. `add()` remains
the only way matter enters a building. There is no second materials pipeline and
there must never be one — that is how per-item conservation dies.

State on the instance:

```js
b.repairing         // boolean, mirrors !!b.repair
b.repair = {
  cost,             // locked at begin, never re-priced
  delivered,        // CUMULATIVE — what has ever arrived. Never decremented.
  used,             // of that, what builders have turned into structure
  work, workNeeded, hpMissing, granted, sinceBuilder,
}
```

**`delivered` is cumulative and `used` is the consumed part; the pile standing at
the door is `delivered − used`.** This is load-bearing. The first implementation
decremented `delivered` as materials were consumed, which re-opened the shortfall
and made the building demand — and pay for — fresh wood forever. A 1-wood leak
caught by the ledger. Do not "simplify" these two fields into one.

## AQ2. Cost

`ceil(missingFraction × cost[item] × 0.5)` per item, clamped to the full build
cost, minimum 1 of the dearest item, derived from **the instance's `b.cost`** —
so an upgraded building quotes off its discounted upgrade price, not the
roster's. Measured across 63 defs × 6 damage levels = **378 quotes: all 378
strictly cheaper than a rebuild, none free, none above build cost.**

Cost locks at `beginRepair`. Later damage never re-prices, and completion still
lifts `hp` to `maxHp`.

## AQ3. Cancel is lockstep, not all-or-nothing — corrects §7.5

§7.5 says cancelling a site refunds everything already delivered. **A repair
cancel does not do that**, and must not: refunding delivered materials while hp
had already been granted for them is a free-hp exploit, and consuming the whole
pile is a silent per-item sink.

Consumption is **lockstep with builder work**: `used[k] = floor(cost[k] ×
work/workNeeded)`, with hp granted by the same fraction. At cancel, everything
genuinely worked into the building is consumed and has bought hp; the untouched
remainder is deposited back per §7.5/§16.4. The arithmetic is linear, so two
half-repairs cost exactly what one whole repair costs and it cannot be gamed.

## AQ4. Corrections to frozen sections

- **§9.1 is factually wrong.** `economy.reserved(item)` says "reserved by
  unfinished construction sites"; it now also counts live repairs. Anything
  reading that contract — including the HUD resource row under AO2 — must know.
- **§7** describes reserve/deliver/build only for `b.built === false`. Repair
  runs the same machinery on a built instance.
- **§10.5**'s wreck split (half looted, half salvaged) now also applies to a
  repair's on-site pile.
- **§11's event list gains three frozen names:** `building:repairing`,
  `building:repaired`, `building:repaircancelled`.
- **§14**: building rows carry an optional `repair` object, absent in every
  pre-repair save and restored as `null`. Nine corruption shapes tested (missing,
  null, empty, negative/unknown items, delivered > cost, used > delivered,
  NaN/0/Infinity, repair on an unfinished row, repair as a string): none threw,
  none produced negative accounting.

## AQ5. The building keeps working, and a paid repair always finishes

The building stays `built` and `active` throughout: production never stops and
workers never leave. A raid should cost the economy, not amputate it.

`tickRepair` advances a fully-supplied repair at `UNEMPLOYED_BUILD_RATE` after
`SITE_STALL_SECONDS` without a builder — G2.3's "a town can never be unable to
finish something it has already paid for", applied to repairs.

**This fallback makes broken builder routing look like working repair.** Any
future change to repair routing must report the split between real builder work
and the fallback; the fallback covering most of the work means the wiring is
broken, not that the feature is fine.

## AQ6. Two deliberate side effects

`capacityFor()` on a repairing building reports repair room **on top of** buffer
room. So `nearestStorage`/`deposit` route matching goods into a repairing store's
repair pile, and a repairing gatherer picks extra of its own output to feed its
own repair. Both measured conservation-clean, and the first is the only reason
storage-building repairs work at all.

`wants()` now merges duplicate rows per item — previously a def whose
`consumes.item` was also a recipe input posted its shortfall twice.

## AQ7. A third blind door — the harness rule again

`scratchpad/lib.mjs`'s `measureW()` does not count repair piles, so any
conservation run using it is silently wrong by whatever sits in `b.repair`. This
is the **third** instance of AA5's blind-door pattern: a ledger that cannot see a
place matter can rest reports clean runs and false breaches with equal
confidence. Corrected version at `scratchpad/rp/rlib.mjs`.

The rule that keeps being relearned: **a ledger must enumerate every place a unit
can be, and be re-derived from observed state rather than from what the module
under test reports about itself.**

## AQ8. A repairing building feeds its own repair

**The fifth instance of "a stopped thing that reports itself as fine."**

If a repair's material exists only inside the repairing building, no haul task can
exist — `_findSource` correctly refuses to source a haul from its own
destination. `repairSupplied` stays false forever, and `tickRepair`'s G2.3
fallback cannot fire because it *requires* `repairSupplied`. Measured on the
unmodified tree: a Town Centre needing 6 stone, with the town's only 18 stone
inside it, sat at 160/400 hp for 1,200 game-seconds with 9 wood and 6 stone
reserved permanently.

This is not exotic. The Town Centre, Granary and Stockpile **are** the stores, so
a damaged storage building routinely needs exactly the material inside it. The
class is wider still: any producer that is the town's only holder of its own
repair material has the same shape — a Woodcutter repaired out of its own output
buffer is the clean example.

**Frozen: `drawRepairFromOwn(b)` takes from `b.inv` into `b.repair.delivered`,
at `beginRepair` (before the `building:repairing` emit, so no listener is ever
told a haul is owed for material already in the building) and at the top of
`tickRepair` before the `repairSupplied` gate.** `used` is untouched, so
`delivered` stays cumulative and monotone; `stockOf()` and `reservedOf()` fall
together so `available()` never moves. It is precisely what an arriving haulier
would have done.

The live path for the per-tick sweep is `restore()` — the one repair-creation
path that does not run `beginRepair`, and which clamps `delivered` out of an
untrusted save. `add()` already fills `repair.delivered` before `b.inv`, so a
hauled delivery cannot strand material beside a shortfall.

No build cost contains a food-class item (every cost is `good`-class), so
self-feeding a Granary cannot take food out of villagers' mouths.

## AQ9. A severed road network is the player's problem, not the quote's

`beginRepair` tests affordability against `economy.available()`, which counts
stock in buildings in a **different region** — stock `_nearestSource`'s
`sameRegion` test will never haul from. A repair in a town partitioned by a raid
can therefore be quoted, begun, reserved, and then stall.

**An earlier draft of this section froze the opposite decision** — a region-aware
`availableTo()` so the quote counted only reachable stock. That was reversed
before anything was built on it, and the reversal is the design call worth
recording:

**Frozen: affordability checks for build and repair sites do not consider
reachability.** A partitioned road network is a thing the player should see and
fix, and hiding it behind a cleverer quote deletes the signal. The game already
says so: `'cut off'` (severity 3) reads *"A road touches it, but no route runs
back to the town centre"* and names the remedy, deliberately split from
`'no road'` so the player is never told to lay more road beside a building that
already has some.

The distinction against AO2 and AQ8, which look similar and are not:

- **AO2** (HUD showed gross stock, placement checked `available`) and **AQ8**
  (material inside the building itself) are the *game* disagreeing with itself.
  The player did nothing wrong and can see nothing wrong. Those must be fixed in
  code.
- **A severed region** is the player's town in a state they created and can
  repair. That must be *surfaced*, not compensated for.

The test for which kind a stall is: **can the player see the cause and act on
it?** If yes, alert them. If no, fix the code. Compensating for the first kind
teaches nothing and hides a town falling apart; alerting on the second kind
blames the player for a bug.

## AQ10. Test preconditions rot when a bug is fixed

`rr/t1_predicates.mjs` and `rr/t3_conservation.mjs` began failing after AQ8 —
**stale preconditions, not regressions**, each confirmed against baseline. They
picked a Woodcutter holding 40 wood to test a 2-wood repair, so after AQ8 the
repair is supplied the instant `beginRepair` returns and the three "before the
haul lands" assertions cannot hold. Every downstream assertion still passes.

Worth stating because it recurs: **a test that asserts an intermediate state
disappears when that state stops being reachable.** Fixing a stall deletes the
stall the test was watching. Retarget the assertion; do not conclude a
regression, and do not restore the bug to keep the test green.

## AQ11. Construction sites share the over-promise, and it is older than repair

Established from code, not inference, while investigating AQ9:

- §7's placement check 7 is `(road ? spendable(k) : available(k)) < cost[k]`.
  For a non-road building that is `economy.available()` — `stock − reserved`
  over **all** holders, with no reachability filter.
- `place()` then creates the site, and `reservedOf`/`reservedTotals` count
  `cost[k] − delivered[k]` for every unbuilt site, so the materials are reserved
  the instant the site is placed, **before a single haul is attempted**.
- Delivery runs `_generateBuildTasks` → `_findSource` → `_nearestSource`, which
  carries the same `sameRegion` gate the repair haul path does.

So a site placed in a severed region, against stock that lives only in another
region, is quoted affordable, placed, reserves its full cost, and never receives
a haul. Identical in shape to the repair stall and predating it entirely — the
repair path was retrofitted onto the same helper. The comment at §7 check 7 even
reasons that `available()` is the right measure "because hauliers will fetch it",
which is exactly the assumption `sameRegion` breaks.

Roads are unaffected: they use `spendable()` and are paid outright inside
`place()`, so they never reserve-and-wait.

**Per AQ9 this is not fixed in the quote.** But it changes the shape of the
alert, and this is the part worth acting on:

**A stranded reservation suppresses every other build in the town.** `available()`
is global, so materials reserved by an unreachable site are subtracted from
everyone's affordability. The player sees builds refused across a town that has
the wood, with nothing anywhere naming the cause.

**CORRECTION — the silence claim above is wrong.** It was written from a code
read and measurement disproved it: `hasDoor()` requires the door tile to be in
the town's hub region, so whichever side of a break is not the hub reports
`'cut off'` — **sites and repairs included**. The stall is not silent.

What is genuinely unsaid is the **cost**. `available()` is global, so an
unreachable reservation is subtracted from everyone's affordability. `'cut off'`
says *where the break is*; nothing said *what it is costing you or how to get it
back*. That, not silence, is the justification for the alert. The work stands;
the reasoning behind it was wrong.

**The detector — and why the obvious one is wrong.** The first proposal was
`_findSource` returns null **and** `economy.available(item) > 0`. Rejected on
measurement, for two independent reasons:

1. `available()` folds in `carriedTotals` (goods in villagers' hands, which
   `_nearestSource` can never source) and counts a producer's input pile (which
   `_nearestSource` refuses via `_producesItem`). Both raise **false** alerts.
2. Worse, `available()` can be driven to **zero by the stranded reservations
   themselves** — silencing the detector exactly when the problem bites hardest.

**Frozen instead: compare the same scan against itself.** A want is unserved,
and re-running the *identical* `_nearestSource` scan with only the region gate
neutralised finds a source. Both false-positive sources appear on both sides of
the comparison and cancel by construction — verified directly: a town whose every
unit of wood is in villagers' hands (`available` 114) and a town whose only wood
is a Sawmill's input pile (`available` 2) each raise nothing.

The general rule: **to ask "is this blocked by X", re-run the real query with
only X removed.** Do not hand-build a second predicate that approximates it —
the approximation is wrong in both directions.

Skip buildings with no walkable anchor (`_anchor(b) < 0`) rather than inheriting
E4's leniency: those already say `'no road'`/`'cut off'`, which is louder and
more accurate.

`economy.sameRegion` (economy.js:502) is the right wrapper and is cheap
(`paths.regionOf` is an array lookup over a lazily-rebuilt labelling). Note its
deliberate leniency per E4: a building whose anchor tile is unwalkable answers
`true` to everything, because its own `'no road'` reason is the honest
explanation. An alert should treat "no walkable anchor at all" as its own louder
case rather than inheriting that leniency.

## AQ12. Walls are not repairable — demolish and rebuild (FROZEN, owner-confirmed)

A wall or gate has no door, so no carrier can ever reach one; a repair on a wall
would reserve materials and wait for ever. A section costs 1–2 wood, so
demolish-and-rebuild is the honest remedy and the cheap one.

**Frozen: Repair is not offered on `def.wall` / `def.gate`.** The inspector says
why and names the remedy — *"Walls are never repaired — no carrier can reach one,
so the materials would never arrive. Pull the weak sections down and lay them
again."* Repair All filters them out and says how many it left alone. Damaged
walls carry a severity-1 alert only, so a chewed-up palisade line sorts below
real problems, matching §7's existing exemption of walls from idle rows.

The alternative — an instant no-haul purchase for walls — was rejected because
AO3.4's one-pipeline rule is what keeps per-item conservation provable. A second
way for matter to enter a building is how that invariant dies.

The player's remaining signal for wall damage is the render damage bar plus that
sev-1 row. Owner's call after review: adequate.
