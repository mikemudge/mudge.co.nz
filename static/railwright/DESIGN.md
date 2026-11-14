# Railwright — Design Contract (FROZEN)

> This document is the single source of truth. Multiple agents build different
> modules in parallel against it. **Do not invent alternative names, shapes or
> values.** If something is genuinely missing, choose the smallest option
> consistent with what is written here and add a `// CONTRACT-GAP:` comment.

---

## 1. Vision

**Railwright** is a top-down freight-railway tycoon set in a single hand-drawn
valley. You are a rail contractor. You lay track, build stations at industries
and towns, buy locomotives, and **program schedules** — ordered stop lists that
your trains then run autonomously, forever, while you build somewhere else.

The pitch in one line: *a valley-sized logistics puzzle where the track is a
shared physical resource and every train you add makes the puzzle harder.*

### The three pillars

1. **Delivery** — cargo has a source and a demand. Moving it is the whole job.
2. **Scheduling** — you don't drive trains, you *program* them. The schedule
   editor is a first-class UI, not an afterthought.
3. **Contention** — track is single-line. Two trains on one block collide.
   Signals, passing loops and station platforms are how you solve it. This is
   the source of the difficulty and it must be legible, fair, and never a
   silent soft-lock.

### What "ambitious" means here

Beyond A→B haulage, the valley runs a **supply chain**: Mine → Smelter → Factory
→ Town. Towns that get what they want **grow**, which unlocks richer contracts.
Terrain costs money to cross. Locos have real trade-offs. Idle trains cost you
upkeep every day, so sprawl is punished. Disasters block your line at the worst
moment. There is a genuine bankruptcy fail state.

### Priority order (enforced — earlier beats later, always)

**Tier 1 — must work flawlessly.** Track laying, stations, trains pathfinding
and following schedules, signals/block reservation preventing collisions, cargo
load/unload, contracts, money, buying trains.
**Tier 2 — should work.** Supply chains, town growth, terrain cost,
bridges/tunnels, passengers, upgrades, milestones.
**Tier 3 — nice to have.** Disasters, weather, day/night recolouring, port
exports, deadlock dispatch tooling.

A gorgeous signal simulation that soft-locks is a **failure**. Correctness of
Tier 1 outranks all of Tier 2 and 3 combined.

### Art direction

Warm ink-on-map look. The valley is drawn in soft sage/tan/slate; the rail
network is drawn crisply *over* it in dark steel with a warm highlight, like
lines inked onto a survey map. Trains are small readable articulated shapes
drawn with canvas paths (no image assets exist — everything is procedural).
Steam plumes, coin pops and signal glows are the only "effects". Day/night
recolours the base palette; at night stations and signals are the bright things
on screen. Readability of **signal state (red/green)** outranks prettiness.

---

## 2. Platform contract (non-negotiable, matches this repo)

- Native **ES modules**, plain **canvas 2D**. **No p5, no libraries, no build step.**
- Entry point is `static/railwright/main.js`. It is loaded by
  `static/shared/appinit.js` via `import('/static/railwright/main.js')` when the
  user visits `/games/railwright/main`.
- `main.js` **injects its own stylesheet and canvas** into the page (the served
  HTML shell has an empty `<body>`). Follow the pattern in
  `static/driftworks/main.js`.
- Because the registered path does not start with `p5/`, **p5.js is not
  injected**. Do not reference p5 globals (`fill`, `rect`, `createCanvas`, …).
- All files must pass `npx eslint static/railwright` with zero errors
  (`sourceType: module`, `no-undef` is off, but no unused vars, no undefined
  behaviour).
- Persistence: `localStorage`, key `railwright_save` (and `railwright_seen_intro`).

### Files and ownership (each file has exactly one owning agent in round 1)

| File | Contents |
|---|---|
| `constants.js` | Every shared constant, enum, item def, loco def, wagon def, site def, tech def. No logic. |
| `utils.js` | Pure helpers + `EventBus`. No game state. |
| `world.js` | Terrain generation, tile queries, site placement, day/season state. |
| `network.js` | Track graph, laying/removal, A* pathfinding, blocks, signals, reservations, deadlock detection. |
| `trains.js` | Train objects, movement, schedule execution, cargo load/unload. |
| `economy.js` | Money, contracts, industry production/consumption, town growth, techs, milestones, upkeep. |
| `render.js` | All canvas drawing. Reads state, never mutates it. |
| `particles.js` | Steam, smoke, coin pops, sparks, dust. |
| `input.js` | Camera pan/zoom, screen↔tile maths, active tool, drag state. |
| `ui.js` | DOM overlay: HUD, build bar, schedule editor, contract board, train roster, upgrades, toasts. |
| `main.js` | Bootstrap, game loop, state machine, save/load, wiring. |
| `railwright.css` | Styling for the DOM overlay only. |

**Rule: `render.js` and `ui.js` never mutate simulation state.** They read it and
they emit events / call documented command methods. Everything else is a bug.

---

## 3. Coordinates, grid, time

```js
GRID_W = 72; GRID_H = 56;      // tiles
TILE   = 32;                    // px at zoom 1
MIN_ZOOM = 0.35; MAX_ZOOM = 2.2;
```

- A tile index is `idx = y * GRID_W + x`. Use `idx` in all hot paths and stored
  structures; `{x,y}` only at API edges. `utils.toIdx(x,y)` / `utils.toXY(idx)`.
- World pixel centre of a tile: `((x + 0.5) * TILE, (y + 0.5) * TILE)`.
- **Directions are 8-way**, indices `0..7` starting East, going clockwise:

```js
// 0:E 1:SE 2:S 3:SW 4:W 5:NW 6:N 7:NE
DIR_DX = [ 1, 1, 0,-1,-1,-1, 0, 1];
DIR_DY = [ 0, 1, 1, 1, 0,-1,-1,-1];
OPPOSITE = [4,5,6,7,0,1,2,3];
```

Diagonal steps cost `Math.SQRT2` tiles of distance; orthogonal cost `1`.

### Clock

- One **in-game day** = `DAY_SECONDS = 100` real seconds at 1× speed.
- Game speeds: `0 (paused), 1, 2, 4`. `dt` passed to `update(dt)` is *game*
  seconds (already multiplied by speed) and is clamped to `0.1` max per frame.
- `world.clock = { day: int (starts 1), timeOfDay: 0..1, season: 0..3 }`.
  Season advances every 30 days: 0 Spring, 1 Summer, 2 Autumn, 3 Winter.
- Day rollover must emit `day:ended {day}` exactly once per day.

---

## 4. Items

```js
ITEMS = {
  coal:      { name:'Coal',       colour:'#3b3a3c', wagon:'hopper',  basePrice: 9 },
  ore:       { name:'Iron Ore',   colour:'#8a5a3b', wagon:'hopper',  basePrice: 11 },
  stone:     { name:'Stone',      colour:'#8d8c88', wagon:'hopper',  basePrice: 7 },
  grain:     { name:'Grain',      colour:'#d7b25e', wagon:'hopper',  basePrice: 10 },
  logs:      { name:'Logs',       colour:'#6b4a2c', wagon:'flatbed', basePrice: 8 },
  oil:       { name:'Oil',        colour:'#2c2a33', wagon:'tanker',  basePrice: 16 },
  steel:     { name:'Steel',      colour:'#7f8c99', wagon:'flatbed', basePrice: 26 },
  lumber:    { name:'Lumber',     colour:'#b98a52', wagon:'flatbed', basePrice: 19 },
  flour:     { name:'Flour',      colour:'#e6ddc4', wagon:'boxcar',  basePrice: 22 },
  fuel:      { name:'Fuel',       colour:'#c46a2a', wagon:'tanker',  basePrice: 31 },
  goods:     { name:'Goods',      colour:'#c9553f', wagon:'boxcar',  basePrice: 44 },
  tools:     { name:'Tools',      colour:'#5f8ca8', wagon:'boxcar',  basePrice: 48 },
  machinery: { name:'Machinery',  colour:'#4c6b7a', wagon:'flatbed', basePrice: 66 },
  passengers:{ name:'Passengers', colour:'#e0c060', wagon:'coach',   basePrice: 14 },
  mail:      { name:'Mail',       colour:'#d0d4dc', wagon:'boxcar',  basePrice: 20 },
}
```

`wagon` is the *preferred* wagon type. A wagon may only carry items whose
preferred wagon matches its own type. This is a real constraint the player must
plan around.

**Delivery revenue** for dropping `qty` of `item` at a site that demands it:

```
revenue = round(qty * ITEMS[item].basePrice * distanceMultiplier * freshness)
distanceMultiplier = 0.6 + min(distTiles, 60) / 50      // 0.6 .. 1.8
freshness          = 1.0, or 0.75 if the cargo has been aboard > 3 in-game days
```

Delivering to a site that does **not** demand the item pays nothing and the
cargo stays aboard (unload is refused; surface a toast).

---

## 5. World

### Tile

```js
tile = {
  x, y,
  type: 'plain'|'forest'|'hill'|'mountain'|'water',
  elevation: 0|1|2|3,     // plain/forest 0-1, hill 2, mountain 3, water 0
  siteId: string|null,    // set for the tiles a site footprint covers
  blocked: false,         // set true by a landslide until repaired
}
```

`world.tiles` is a flat `Array(GRID_W*GRID_H)` indexed by `idx`.

### Terrain generation

Deterministic from a seed (`utils.makeRng(seed)` — a small xorshift/mulberry32,
**never** `Math.random()` inside generation). Requirements:

- A **river** runs across the map (contiguous `water` tiles, 1–2 wide) — it must
  be crossable only by bridges, and it must actually separate meaningful parts
  of the map so bridges matter.
- A **mountain ridge** with `mountain` tiles that need tunnels.
- Rolling `hill` regions (elevation 2) and `forest` patches.
- The map must be **fully connectable**: every site reachable by some legal
  track route (verify at generation time and regenerate/carve if not).

### Sites

```js
site = {
  id, kind, name,
  x, y,                        // top-left tile of a 2x2 footprint
  produces: [{ item, perDay }],
  consumes: [{ item, perDay }],// a "recipe" - all inputs required to produce
  stock:  { [item]: qty },     // output waiting to be picked up (cap SITE_STOCK_CAP=240)
  demand: { [item]: qty },     // input wanted; grows over time up to a cap
  stationId: string|null,
  level: 1,                    // towns/cities grow 1..5
  population: 0,               // towns/cities only
  satisfaction: 0..1,          // rolling measure of demand met (towns only)
}
```

Site kinds and their recipes:

| kind | name shown | produces / day | consumes / day |
|---|---|---|---|
| `coal_mine` | Colliery | coal 14 | — |
| `iron_mine` | Iron Mine | ore 12 | — |
| `quarry` | Quarry | stone 12 | — |
| `farm` | Farm | grain 14 | — |
| `logging_camp` | Logging Camp | logs 12 | — |
| `oil_well` | Oil Well | oil 8 | — |
| `smelter` | Smelter | steel 10 | ore 10, coal 6 |
| `sawmill` | Sawmill | lumber 12 | logs 12 |
| `mill` | Flour Mill | flour 11 | grain 12 |
| `refinery` | Refinery | fuel 8 | oil 8 |
| `factory` | Factory | goods 8 | steel 6, lumber 6 |
| `workshop` | Workshop | tools 7 | steel 5, lumber 4 |
| `machine_works` | Machine Works | machinery 5 | steel 6, fuel 4 |
| `town` | (place name) | passengers, mail (scale with pop) | goods, flour, tools |
| `city` | (place name) | passengers, mail (more) | goods, flour, tools, machinery |
| `port` | Harbour | — | **any** item, at 1.25× base price (export sink) |

Production rule (run once per in-game day, or smoothly per tick — either is
fine, but be consistent): a processing site produces its output only if **all**
inputs are available in `stock`; it then consumes them. Raw sites always
produce. Output stops accumulating at `SITE_STOCK_CAP`; a full site emits
`site:backed_up` at most once per day.

Starting valley: **at least 16 sites**, including ≥4 towns, 1 city, and at least
one complete chain (mine+colliery+smelter+factory+town) that is *not* trivially
short — the player should have to think about routing.

Names: use invented English-valley place names (Ashcombe, Wrenford, Kilnbridge,
Marrowdale, Stagwater, Thistlemoor, Coldharbour, Greyfen, Ember Hollow, …).

---

## 6. Track network (`network.js`)

### Track tile

```js
track = {
  idx,
  links: number,        // bitmask of the 8 directions this tile connects along
  kind: 'rail'|'bridge'|'tunnel',
  electrified: false,
  cost: number,         // what it cost to build (for refunds)
}
```

`network.track` is a `Map<idx, track>`.

**Link invariant:** links are always symmetric. If tile A links direction `d` to
B, B links `OPPOSITE[d]` to A. Any operation that breaks this is a bug.

**Diagonal invariant:** two diagonal links may not cross. If tiles (x,y)→(x+1,y+1)
are linked, then (x+1,y)→(x,y+1) must not be. Reject such placements.

### Signals

```js
signal = { id, a: idx, b: idx, dir, green: bool, kind: 'block'|'auto' }
```

A signal sits **on the link between two adjacent track tiles**, not on a tile.
Key `signalKeyFor(a, b)` = `min(a,b) + ':' + max(a,b)`; store in
`network.signals: Map<key, signal>`. Signals are **bidirectional block
boundaries** — trains may traverse in either direction, but crossing one
requires a reservation. This keeps the mental model simple and produces exactly
the classic single-track puzzle.

### Blocks

`network.recomputeBlocks()` runs after **any** track or signal change.

- Union-find (or flood fill) over track tiles, unioning neighbours along a link
  **unless that link carries a signal**.
- Result: `track.blockId` set on every tile, and
  `network.blocks: Map<blockId, { id, tiles:Set<idx>, capacity, occupants:Set<trainId> }>`.
- `capacity` is `1` for ordinary blocks, and `station.platforms` for a block
  whose tiles are all inside one station's footprint.
- Recomputation **must preserve live train reservations**: after recompute,
  re-derive each train's occupied blocks from the tiles it physically sits on
  and re-populate `occupants`. Never leave a phantom reservation behind — a
  phantom reservation is the #1 way this game soft-locks.

### Reservation API (only `network.js` mutates block state)

```js
network.blockAt(idx) -> blockId|null
network.isLinkSignalled(a, b) -> bool
network.canEnterBlock(blockId, trainId) -> bool   // free, or already ours, or capacity spare
network.reserveBlock(blockId, trainId) -> bool
network.releaseBlock(blockId, trainId) -> void
network.syncTrainOccupancy(trainId, tileIdxList) -> void  // preferred: idempotent, releases what's no longer held
```

`trains.js` calls these and **never** touches `blocks` directly.

### Pathfinding

```js
network.findPath(fromIdx, toIdx, opts) -> { tiles:[idx...], cost } | null
```

A* over track tiles via `links`. Cost = step distance × terrain factor ×
(1 + gradePenalty). `opts.avoidBlocked` skips `tile.blocked`. Must return `null`
(never throw, never hang) if no route exists. Cap expansions at 20000 nodes.

### Construction

```js
network.planTrack(fromIdx, toIdx) -> { tiles:[{idx, kind, cost}], totalCost, legal, reason }
network.buildTrack(plan) -> bool          // charges money via economy, emits track:built
network.removeTrack(idx) -> refund
network.placeSignal(a, b) / network.removeSignal(a, b)
network.buildStation(siteId, idx, opts)
```

`planTrack` auto-routes an 8-way line between the two tiles (drag to lay). It
must produce a *sensible* line — prefer straight runs, at most one bend, and
follow cheap terrain where it is close to free to do so.

**Build costs:**

```js
TRACK_COST = { plain: 60, forest: 90, hill: 150, mountain: 0 /* tunnel */, water: 0 /* bridge */ };
BRIDGE_COST = 480;   // per water tile
TUNNEL_COST = 900;   // per mountain tile
SIGNAL_COST = 120;
STATION_COST = 900;  // 1 platform; each extra platform +700
DEMOLISH_REFUND = 0.4;
TRACK_UPKEEP_PER_TILE_PER_DAY = 0.35;
```

Bridges are unlocked from the start for 1-tile water; **wide water (2 tiles)
requires the `long_span` tech**. Tunnels require the `tunnelling` tech.

### Stations

```js
station = {
  id, name, siteId, originIdx,     // 2x1 (or 2x2) footprint anchored at originIdx
  tiles: [idx...], platforms: 1..3,
  waiting: { [item]: qty },        // cargo delivered by the site, ready to load
  accepts: Set<item>,              // what the served site demands
  level: 1,
}
```

- A station must be built on track tiles adjacent to (within `STATION_RADIUS = 3`
  tiles of) a site's footprint, and it serves exactly that one site.
- Every in-game day, up to `throughput` of a site's `stock` flows into the
  station's `waiting` (`throughput = 60 * platforms` per day), and everything a
  train unloads that the site `accepts` is credited to the site immediately.

### Deadlock

`network.detectDeadlock(trains)` — if two or more trains have been in state
`waiting_signal` for more than `DEADLOCK_SECONDS = 25` game seconds and their
wait-for graph contains a cycle, emit `train:deadlock {trainIds}` (at most once
per 30s). The UI then offers **Dispatch → Reverse** on those trains for
`DISPATCH_FEE = 250`, which flips the train's schedule direction and lets the
knot untangle. Deadlock must be a *managed problem*, never a silent stall.

---

## 7. Trains (`trains.js`)

### Locomotives

```js
LOCOS = {
  shunter:  { name:'Pug 0-4-0',        cost:1200,  speed:1.4, power:2,  upkeep:6,  maxWagons:2, era:0, colour:'#6b7d55' },
  workhorse:{ name:'Bramble 2-6-0',    cost:3200,  speed:2.0, power:4,  upkeep:14, maxWagons:4, era:0, colour:'#7a4230' },
  hauler:   { name:'Ironback 2-8-2',   cost:7500,  speed:1.8, power:8,  upkeep:26, maxWagons:7, era:0, colour:'#3f4a52' },
  express:  { name:'Kestrel 4-6-2',    cost:9800,  speed:3.6, power:3,  upkeep:30, maxWagons:4, era:1, colour:'#2f5d7c' },
  diesel:   { name:'DL-12 Vanguard',   cost:18000, speed:3.0, power:9,  upkeep:45, maxWagons:8, era:1, colour:'#9a6a20', tech:'diesel_traction' },
  electric: { name:'EM-4 Meridian',    cost:32000, speed:4.2, power:12, upkeep:40, maxWagons:10, era:2, colour:'#365f4a', tech:'electrification', needsWire:true },
}

WAGONS = {
  hopper:  { name:'Hopper',  cost:400, capacity:20, upkeep:2 },
  boxcar:  { name:'Boxcar',  cost:450, capacity:16, upkeep:2 },
  tanker:  { name:'Tanker',  cost:600, capacity:18, upkeep:3 },
  flatbed: { name:'Flatbed', cost:500, capacity:14, upkeep:2 },
  coach:   { name:'Coach',   cost:700, capacity:24, upkeep:3 },
}
```

`speed` is tiles per game-second on flat track at full green.

**Grade rule:** climbing 1 elevation step costs 2 power. A train needs
`power >= 2 * (wagonCount ... )` — concretely: effective speed multiplier when
climbing is `clamp(power / (2 + wagonCount * elevationDelta), 0.25, 1)`. A train
that physically cannot climb (multiplier would be < 0.25) still crawls at 0.25×
rather than stalling — **never** create an unrecoverable stuck state.

### Train object

```js
train = {
  id, name, locoId,
  wagons: [{ type, capacity, item:null, qty:0 }],
  // Position: head is at path[pathIndex], moving toward path[pathIndex+1], t in [0,1)
  path: [idx...], pathIndex: 0, t: 0,
  headIdx,                       // convenience: path[pathIndex]
  occupied: [idx...],            // tiles under the whole consist, head-first
  speed: 0, targetSpeed: 0,
  state: 'idle'|'running'|'waiting_signal'|'loading'|'unloading'|'no_route'|'broken',
  schedule: { stops: [...], index: 0, loop: true },
  destStationId: null,
  reserved: [blockId...],
  loadTimer: 0, brokenTimer: 0,
  daysAboard: 0,                 // for freshness
  stats: { delivered: 0, revenue: 0, kmRun: 0 },
}
```

`consistLength = 1 + wagons.length` tiles. `occupied` is derived by walking
backwards along the already-travelled path.

### Schedule

```js
stop = {
  stationId,
  action: 'load' | 'load_full' | 'unload' | 'unload_all' | 'wait',
  item: string|null,     // required for load/load_full/unload
  waitSeconds: 0,        // for 'wait'
}
```

Execution rules:

- On arriving at `stops[index].stationId`, set state `loading`/`unloading` and
  run the action. `load` takes what's available now and departs. `load_full`
  waits until every compatible wagon is full **or** `LOAD_FULL_TIMEOUT = 120`
  game seconds pass (then departs with whatever it has — **no infinite wait**).
- Loading rate: `LOAD_RATE = 8` units per game second, per train.
- After the action, `index = (index + 1) % stops.length` (if `loop`), then
  request a path to the next stop. If no path → state `no_route`, emit
  `train:no_route`, and retry every 5 game seconds (do **not** spin).
- A schedule with 0 or 1 stops is legal; a train with 0 stops sits `idle`.
- Editing a schedule while a train is en route is legal and must not corrupt
  position or reservations.

### Movement per tick

1. If `broken`, tick `brokenTimer`, return.
2. If `loading`/`unloading`, run the action, return.
3. Determine the next tile `path[pathIndex+1]`. If the link into it is
   signalled, ask `network.canEnterBlock`. If refused → `speed = 0`,
   state `waiting_signal`, return.
4. Accelerate toward `targetSpeed` (`ACCEL = 0.8` tiles/s², `BRAKE = 1.6`).
   Advance `t` by `speed * dt / stepDistance`. On `t >= 1`, advance
   `pathIndex`, recompute `occupied`, call `network.syncTrainOccupancy`.
5. At the end of the path, arrive at the destination station.

**Collision invariant (the thing QA will hammer):** two trains must never
occupy the same tile. If the sim ever produces that, it is a Tier-1 bug.

---

## 8. Economy (`economy.js`)

```js
STARTING_MONEY = 12000;
BANKRUPTCY_FLOOR = -5000;   // game over
```

### Contracts

```js
contract = {
  id, tier: 'bronze'|'silver'|'gold',
  fromSiteId, toSiteId, item, qty, delivered: 0,
  reward, penalty, issuedDay, deadlineDay,
  standing: bool,           // standing orders repeat and never expire
  state: 'offered'|'active'|'complete'|'failed'|'expired',
}
```

- The board offers `3 + floor(era * 1.5)` contracts at a time; a new one appears
  when one leaves the board. Offered contracts expire `6` days after issue.
- Accepting is free. **Failing an accepted contract costs `penalty`.**
- Reward ≈ `qty * basePrice * (1.6 bronze | 2.1 silver | 2.9 gold)`;
  penalty = 35% of reward. Deadline scales with route distance so contracts are
  always physically achievable at the player's current best speed — **never
  generate an impossible contract.**
- Delivering to the contract's `toSiteId` credits both the ordinary delivery
  revenue **and** progresses the contract.

### Town growth

Towns accumulate `satisfaction` from demand met. At `satisfaction > 0.7`
sustained for 3 days, level up (max 5): population ×1.4, demand up, passengers
up, and it emits `city:grew`. Starved towns (`satisfaction < 0.2` for 5 days)
lose a level (min 1). Growth is what makes a good network compound.

### Techs (bought with money, from the Upgrades panel)

```js
TECHS = {
  tunnelling:       { name:'Tunnelling',        cost: 4000,  era:0 },
  long_span:        { name:'Long-Span Bridges', cost: 6500,  era:1 },
  auto_signals:     { name:'Automatic Signals', cost: 5000,  era:1 },  // cheaper signals, auto-place on long runs
  telegraph:        { name:'Telegraph Office',  cost: 3500,  era:0 },  // +1 contract slot, longer deadlines
  heavy_freight:    { name:'Heavy Freight',     cost: 8000,  era:1 },  // +1 maxWagons on every loco
  diesel_traction:  { name:'Diesel Traction',   cost: 14000, era:1 },
  electrification:  { name:'Electrification',   cost: 26000, era:2 },  // enables wiring track (+40/tile) and EM-4
  centralised_ctc:  { name:'Centralised CTC',   cost: 12000, era:2 },  // auto-reverse on deadlock, free dispatch
}
```

### Eras

`era` is derived from **lifetime revenue**: `0` at start, `1` at `$60,000`,
`2` at `$250,000`. Era gates what may be *bought*, not what already exists.

### Milestones (lump-sum payouts, give the game direction)

Examples — implement at least eight: connect 3 towns ($3,000); run 5 trains
simultaneously ($5,000); deliver 500 steel ($8,000); reach a $2,000/day net
profit ($10,000); grow a town to level 3 ($6,000); complete 10 contracts
($7,500); bridge the river ($2,500); electrify 50 tiles ($15,000).

### Daily settlement (on `day:ended`)

Charge loco + wagon upkeep and `TRACK_UPKEEP_PER_TILE_PER_DAY` per track tile.
Emit `day:settled {revenue, costs, net}`. If money < `BANKRUPTCY_FLOOR`, game
over. A visible **daily ledger** in the UI is required — the player must be able
to see why they are losing money.

---

## 9. Events (`utils.js` `EventBus`, names FROZEN)

```
day:ended {day}                     day:settled {revenue, costs, net}
money:changed {money, delta, reason} toast {text, kind}   // kind: info|good|bad|warn
track:built {tiles, cost}           station:built {stationId}
train:arrived {trainId, stationId}  train:departed {trainId, stationId}
cargo:loaded {trainId, item, qty}   cargo:delivered {siteId, item, qty, revenue}
train:no_route {trainId}            train:deadlock {trainIds}
train:broken {trainId}              train:bought {trainId}
contract:offered {contractId}       contract:accepted {contractId}
contract:completed {contractId, reward}  contract:failed {contractId, penalty}
city:grew {siteId, level}           site:backed_up {siteId, item}
tech:bought {techId}                milestone:reached {milestoneId, reward}
era:changed {era}                   disaster {kind, tiles}
game:over {reason}                  selection:changed {kind, id}
```

`EventBus` API: `bus.on(name, fn) -> unsubscribe`, `bus.off(name, fn)`,
`bus.emit(name, payload)`. A throwing listener must be caught and logged, never
allowed to break the game loop.

---

## 10. Game state object

`main.js` owns a single `game` object and passes it everywhere:

```js
game = {
  bus, rng, world, network, economy,
  trains: [],  stations: Map<id, station>,
  camera: { x, y, zoom },
  tool: 'inspect'|'track'|'signal'|'station'|'bulldoze'|'wire',
  speed: 1, paused: false, state: 'start'|'playing'|'paused'|'gameover',
  selection: { kind: 'train'|'station'|'site'|null, id },
  elapsed: 0,  // total game seconds
}
```

Save/load serialises everything needed to resume (`localStorage`, versioned with
`saveVersion: 1`; a mismatched version is discarded, not crashed on).

---

## 11. UI requirements (`ui.js` + `railwright.css`)

DOM overlay above the canvas. Must include:

1. **HUD bar** — money (with the day's net delta), day + season, clock, era,
   speed controls (⏸ 1× 2× 4×), and a lifetime-revenue/era progress bar.
2. **Build bar** — tool buttons with live cost preview and keyboard shortcuts
   (`1`–`6` tools, `Esc` cancel, `Space` pause, `+/-` speed, `M` map).
3. **Schedule editor** — *the centrepiece*. Per-train ordered stop list, drag or
   arrow-button reorder, add stop by picking a station from a list or by
   clicking it on the map, per-stop action + item dropdown, delete stop, a live
   "next: Ashcombe (load coal)" line, and a per-train ETA/utilisation readout.
   It must be genuinely pleasant to use.
4. **Contract board** — offered/active contracts, tier colours, deadline
   countdown, progress bars, accept button, and a clear "route hint"
   (from → to, item, qty).
5. **Train roster** — every train, its state, cargo, income/day, and a jump-to
   button that centres the camera on it.
6. **Site/station inspector** — click a site: what it makes, what it wants, its
   stock, its station's waiting cargo.
7. **Upgrades panel** — techs with cost, prerequisites, era gating.
8. **Toasts** — for `toast`, contract, milestone and disaster events.
9. **Intro/help overlay** on first play (`railwright_seen_intro`), and an
   always-available `?` help panel listing controls.
10. **Game-over screen** with final stats and a restart.

Panels must be closeable, must not trap keyboard input, and must never cover the
whole map. Everything must work at 1280×720 and degrade gracefully narrower.

---

## 12. Testing contract

Because there is no browser test harness in this repo, **every logic module must
be importable and runnable under plain Node with no DOM.** That means:

- `world.js`, `network.js`, `trains.js`, `economy.js`, `utils.js`,
  `constants.js` must **not** touch `document`, `window`, `localStorage` or
  `canvas` at import time or in their simulation paths.
- DOM access is confined to `main.js`, `render.js`, `ui.js`, `input.js`,
  `particles.js`.

A headless harness will `import()` the sim modules, build a world, lay track,
run trains for thousands of ticks, and assert the invariants:

- no two trains ever share a tile
- no train is stuck in `waiting_signal` forever with a free path
- no phantom block reservations after track edits
- money and stock never go NaN or silently negative
- `findPath` never hangs

Write the sim modules so this is possible. It is not optional.

---

# ADDENDUM A — Engagement, Anti-Soft-Lock, and Replayability (FROZEN)

This addendum has the same authority as the sections above. It exists because
the genre has two well-known failure modes, and *Railwright* must be designed
against both by construction, not patched afterwards.

## A1. The lull problem (the #1 design risk)

Once routes are running, trains drive themselves and the player has nothing to
do but watch money tick up. **A lull longer than ~20 seconds of real time is a
bug.** The player must essentially always have a meaningful decision available.
Implement all of the following:

1. **Always affordable next action.** The player should nearly always be able to
   afford *something* — a signal, a few tiles of track, a wagon. If money is
   above `SIGNAL_COST` there is always a move. Surface "what can I afford right
   now?" in the build bar by dimming what is out of reach rather than hiding it.
2. **Rush contracts.** A high-value, short-fuse contract appears roughly every
   2–4 in-game days with a visible countdown (`rush: true`, 1.8× reward, tight
   deadline). It expires from the board in 90 game seconds. This creates a
   recurring "drop what you're doing and decide" beat.
3. **Event cadence.** Something notable must happen at least every ~45 game
   seconds: a contract offer, a delivery payout, a town growth, a disaster, a
   milestone, a demand boom. Track `game.lastBeatAt`; if nothing has fired,
   nudge an offer or a small event. This is a real scheduler, not a vibe.
4. **Active dispatch.** Deadlocks, breakdowns and blocked track require a player
   decision (reverse, repair, reroute) rather than resolving silently.
5. **Fast-forward.** Beyond 4×, provide a **"skip to next event"** control that
   runs the sim at high speed until the next notable beat or 1 in-game day,
   whichever is sooner. Never let the player sit and wait for a clock.
6. **Idle nudge.** If the player has taken no action for 30 real seconds, surface
   a non-modal hint pointing at the highest-value thing available ("Wrenford is
   backing up 240 ore — no station serves it").

## A2. Anti-soft-lock (no dead ends, ever)

Every one of these must be reachable-out-of:

- **Broke.** Add a **loan** system: up to 3 loans of `$8,000` at 6%/day interest
  against future revenue, available whenever `money < 2000`. Also allow
  **selling assets** — trains refund 50%, track refunds `DEMOLISH_REFUND`.
  Bankruptcy must only trigger after loans are exhausted *and* assets are gone.
- **All trains `no_route`.** The HUD must show a persistent, clickable warning
  listing every stalled train and why. Never let a train fail silently.
- **Deadlock.** Dispatch → Reverse (already specified). With `centralised_ctc`
  it resolves automatically and free.
- **Nothing to deliver.** Base delivery revenue is always available even with no
  contracts, so a working route always earns.
- **Impossible contract.** Never generate one (already specified). Additionally,
  the player may **abandon** an accepted contract for half the penalty.
- **Blocked track (landslide).** Always repairable for a fee; if the player
  cannot afford it, the fee decays 10%/day until they can.
- **Unwinnable map.** Generation already guarantees connectivity.

**Rule: no player action may ever produce a state with zero legal moves.** QA
must actively hunt for violations of this.

## A3. Replayability — every run should feel different

1. **Seeded maps.** A new game rolls a random seed; the player may enter a seed
   to replay or share a map. Show the seed on the game-over screen.
2. **Scenario modifiers.** Each new game rolls **one** of these, shown on the
   start screen with a name and description:
   - `Highlands` — more hills and mountains, tunnelling starts unlocked, track costs +25%.
   - `Braided River` — several rivers, bridges cost −40%, more ports.
   - `Boomtown` — one huge city with double demand; fewer, richer contracts.
   - `Coal Country` — abundant raw sites, weak processing; export via port pays more.
   - `Lean Years` — start with `$8,000` and 20% lower upkeep; tighter but cheaper.
   - `Fair Weather` — no disasters, but contract rewards −15%. (the gentle option)
3. **Varied starting position.** The starting loco and the location of the first
   pre-built station vary by seed.
4. **Contract variety.** Mix short haulage, long-distance express, multi-drop
   ("deliver to any two towns"), passenger runs, and standing orders.
5. **Site layout variance.** Which processing chains exist, and how far apart the
   chain members sit, must vary meaningfully by seed — not just cosmetic
   reshuffling of the same layout.

## A4. Fun checklist (QA must assess these, not just correctness)

- Is there a decision to make within the first 30 seconds of a new game?
- Can a new player get their first delivery paid within ~2 minutes?
- Does the difficulty come from *interesting* constraints (contention, routing,
  cash flow) rather than from fiddly UI or unclear rules?
- Is there a visible "next thing to work toward" at all times?
- Does a good network visibly compound — does the player feel their earlier
  decisions paying off?
- Would two runs on different seeds actually play differently?

---

# ADDENDUM B — Balance Targets (FROZEN)

Round-1 harness results showed the economy is far too generous: three routes
repaid a second locomotive inside one in-game day, while a fully idle player
took 198 days to go bankrupt. Both ends are wrong. **If money is abundant, the
contention puzzle stops mattering and there are no interesting decisions left.**
Scarcity is what makes routing, signalling and loco choice meaningful.

Tune to these targets (verify them in a headless harness, don't eyeball):

| Situation | Target |
|---|---|
| First delivery paid | within ~2 minutes of a new game |
| One good short route | roughly **breaks even** — covers its own upkeep, little more |
| Two or three good routes | fund the next locomotive in **8–12 in-game days**, not 1 |
| Fully idle player (3 trains, some track) | bankrupt in **25–40 days**, not 198 |
| A well-run network at era 1 | comfortably profitable — competence must be *rewarded* |
| Reaching era 1 ($60k lifetime) | roughly **45–70 in-game days** of good play |

Levers, in preferred order: cut the `distanceMultiplier` floor so short hops pay
much less than long hauls (short-hop spam should never be optimal); raise loco
and track upkeep; make processing sites consume more per unit produced; slow
station throughput so a single train cannot drain a site instantly.

**Design intent:** the player should feel money is *tight but fair* through era
0, and should feel genuinely clever — not merely patient — when they first turn
a sustained profit. Long hauls and dense, well-signalled networks are the
rewarded strategies. Short-hop shuttling between two adjacent sites must never
be the dominant play.

---

# ADDENDUM C — Insolvency and Forced Liquidation (FROZEN)

Adversarial QA found that Addendum A2 and Addendum B contradict each other.
A2 says bankruptcy fires only once loans are exhausted **and** assets are gone.
B says an idle player goes bankrupt in 25–40 days. An idle player never sells
anything, so `hasEscapeRoute` stays true forever and `game:over` can never fire
— money just falls without limit (measured: **-$180,400 by day 401**, still not
bankrupt). The "genuine bankruptcy fail state" the Vision promises is therefore
currently false for anyone not actively trying to lose.

This addendum resolves the contradiction and supersedes A2 where they differ.

## C1. The principle

A2's real intent was **"never end the game while the player still has a move
they could make"** — not "never end the game while any asset exists". The player
must never be trapped, but they must also not be able to avoid consequences by
simply doing nothing. Doing nothing is a choice, and it must have an ending.

## C2. Forced liquidation (the fix)

Insolvency proceeds in stages. The player can escape at any stage by acting.

1. **Warning** — money below `0` but above `BANKRUPTCY_FLOOR`: escalating
   `severity: 'warning'` distress, with the available actions named explicitly.
2. **Grace** — money below `BANKRUPTCY_FLOOR` while an escape route remains:
   `severity: 'critical'`, and a **3 in-game day grace period**, counted from
   when the floor was first crossed. The UI must state plainly what happens when
   it expires. This is the player's window to take a loan, sell something, or
   land a delivery.
3. **Receivership** — grace expired and still below the floor: the game begins
   **forced liquidation**. Once per day it automatically sells the single most
   valuable remaining train to service the debt, announcing it in plain language
   ("The receivers have sold your Ironback 2-8-2 for $4,150"). This is the
   mechanic that guarantees termination. The player may still recover if a sale
   lifts them clear.
4. **Bankruptcy** — below the floor, loans exhausted, and **nothing of non-zero
   value left to sell**: `game:over {reason:'bankrupt'}`.

This preserves genuine agency, keeps every escape route real, and guarantees an
idle player reaches a definite end. **Verify against Addendum B's target: an
idle player with 3 trains must reach `game:over` within 25–40 days.**

## C3. Correctness rules this exposed

- **An asset with zero value is not an escape route.** `hasSellableAssets` must
  count only trains where `valueOfTrain(train) > 0`. A train whose `locoId` is no
  longer in `LOCOS` (e.g. from an older save) values at `$0` and currently makes
  the game claim an escape that does not exist — a silent zombie state.
- **Selling must be idempotent and ownership-checked.** `sellTrain(train)` must
  verify the train is still owned before crediting. It currently double-credits
  if called twice with the same object (not reachable through today's UI, but
  the API has no defence at all).
- **Money must always be finite.** Uncapped 6%/day compounding drives money to
  literal `-Infinity` (measured: day 12,027), after which no `earn()` can ever
  move it again — a permanently unrecoverable state and a direct violation of
  the no-NaN/Infinity invariant. Cap total accrued interest per loan (suggested:
  interest stops accruing once it reaches **2× principal**) and clamp `money` to
  a finite floor. With C2 in force this should be unreachable anyway, but the
  invariant must hold regardless.
