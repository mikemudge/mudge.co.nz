# Hearthmere — cross-module handoff list

Accumulated as each module reports. The integration agent (`main.js`) must
verify EVERY line here actually happens, because a missed wiring line is not a
crash — it is a feature that silently stays dead code.

Status key: [ ] not yet wired · [x] verified wired

---

## From `buildings.js`

### main.js
- [ ] `createBuildings(game)`, then `buildings.init()` only after ALL modules exist (init subscribes to `day:ended`, seeds RNG from `world.seed`).
- [ ] `buildings.update(dt, game)` runs THIRD in the frozen order.
- [ ] Restore order: `world` -> `paths.rebuild()` -> `buildings.restore()` -> `villagers` -> `economy` -> `military`. `buildings.restore()` rebuilds the whole `world.building` array, so it must run after world and before villagers.
- [ ] Pre-place the Town Centre at `world.start` via `buildings.place('town_centre', x, y)`.

### paths.js
- [ ] `paths.setSolid(idx, bool)` — called per footprint tile for any `def.solid` building on placement and removal. Missing = enemy pathing ignores walls entirely.
- [ ] `paths.isConnected(b)` taking the building INSTANCE (reads `b.x/y/w/h`), internally cached.
- [ ] `paths.roadChanged(idx)` / `paths.invalidate(idx)` — called on every road set/clear. Missing = stale connectivity, not a crash.
- [ ] Villagers path to `b.doorIdx`, never into the footprint.

### world.js
- [ ] Typed arrays `terrain, resource, amount, building, road, fertility, elev` exposed per §5. buildings.js is the sole writer of `world.building` and (for road defs) `world.road`.
- [ ] `world.clock = {day, timeOfDay, season, year}`.
- [ ] `world.harvest(idx, amount) -> got`, `world.clearForest(idx)`, `world.findResourceNear(x, y, res, radius) -> idx|-1` (must EXCLUDE nodes at `amount === 0`).
- [ ] `world.isWalkable(idx)`: a `def.solid` building blocks; a `def.gate` building is walkable for villagers.

### economy.js  *** HIGHEST-RISK SEAM IN THE PROJECT ***
- [ ] Uses `buildings.take/add` ONLY; never touches `b.inv`.
- [ ] `economy.reserved(item)` DELEGATES to `buildings.reservedOf(item)` / `reservedTotals(out)`. A second ledger = double-count.
- [ ] `economy.stock(item)` uses `buildings.stockTotals(out)` and must NOT add site `delivered` — that is already netted out of `reserved`; counting it inflates `available` and lets the player double-spend.
- [ ] `economy.available(item) === stock - reserved`.
- [ ] Exposes `economy.tier` (>=1) and `economy.townHealth` (0..100).
- [ ] `rebuildTasks()` drives off `buildings.wants(b)` / `buildings.outputs(b)` (storages return `[]` — they are sinks) / `buildings.outputFillRatio(b)`.
- [ ] Uses `buildings.nearestStorage(item, x, y)` and `buildings.storages()`.
- [ ] `buildings.upkeepTotal()` for daily coin.
- [ ] Housing uses `buildings.housingCapacity(b)` / `totalHousing()`, NOT `def.houses` — a house mid-upgrade still shelters residents.
- [ ] Tier gates use `buildings.hasBuilt(defId)` (built only, not sites).
- [ ] `buildings.overflow` (last-resort refund pool) is drainable by porters or drained into storage as room appears.

### villagers.js
- [ ] `buildings.assignWorker(b, id)` / `removeWorker(b, id)` / `openJobs(b)` — never push to `b.workers`.
- [ ] `buildings.releaseWorkerEverywhere(id)` on death or job change.
- [ ] `buildings.applyBuilder(b, dt, unemployed)` each tick a builder is at a site (applies rate x healthFactor and completes the building itself).
- [ ] `buildings.gatherTargetFor(b)` for the walk target; `buildings.gatherComplete(b, workerId, idx)` on return — that call does the harvest, Winter halving, byproduct roll and inventory write.
- [ ] Haul pickup/drop via `buildings.take` / `buildings.add`, ALWAYS honouring the return value (add clamps; the remainder must go somewhere, not vanish).
- [ ] `villagers.get(id) -> agent|null` with a `dead` flag must exist, or every restored worker id is discarded.
- [ ] Eating draws food via `buildings.take()`.

### military.js
- [ ] `buildings.damage(id, amount, true)` — third arg sets `byRaid`. Never write `b.hp`.
- [ ] `buildings.blocksEnemies(b)` (`def.solid || def.gate`) is the enemy-obstacle test — `def.solid` alone is wrong, gates are villager-passable but enemy-blocking.
- [ ] Garrisons are ordinary worker slots via `buildings.assignWorker`.
- [ ] Armoury is normal storage (`classes:['arms']`); equip/de-equip with `take`/`add`.

### input.js / ui.js
- [ ] `buildings.canPlace(defId, x, y) -> {ok, reason}` for the preview (safe per frame); `buildings.place(defId, x, y)` on click — returns instance, `{id:-1, road:true}` sentinel, or `null` with the message on `buildings.lastError`.
- [ ] `buildings.placeMany(defId, tileList) -> {placed, failed, reason}` for drag.
- [ ] `setActive(id, bool)`, `setPriority(id, 0..2)`, `setRecipe(id, recipeId)`, `demolish(id)`, `removeRoad(idx)`.
- [ ] `buildings.costFor(defId, x, y)` for the menu tooltip — returns the DIFFERENCE for a housing upgrade, not the full price.
- [ ] Alerts key off `b.idleReason` through `C.alertFor(reason)`.

### render.js
- [ ] Iterate `buildings.list` (live array, do not mutate). Sort key is the SOUTH corner `(b.x+b.w-1) + (b.y+b.h-1)`.
- [ ] `buildings.atTile(idx)` resolves a tile to its instance.

---

## From `world.js` + `paths.js`

### buildings.js
- [ ] `paths.setSolid(idx, true/false)` per footprint tile for `def.solid` buildings (use the paths wrapper, not `world.setSolid` — it also drops region/connectivity caches).
- [ ] `paths.setGate(idx, true/false)` for `wooden_gate`/`stone_gate`. Gates must NOT also be set solid; `solid:false, gate:true` is what makes them villager-passable and enemy-blocking.
- [ ] Occupancy via `world.setBuilding(idx, id)` / `(idx, -1)`.
- [ ] Road defs via `paths.setRoad(idx, def.road, isBridge)` / `paths.removeRoad(idx)`. Never write `world.road[idx]`.
- [ ] `paths.isConnected(b)` (cached) -> `b.connected`; `paths.forgetBuilding(b.id)` on demolish so a recycled id can't read a stale answer.
- [ ] `paths.doorFor(b)` for `doorIdx`, and RECOMPUTE it after any nearby road change — world pushes no event for this.
- [ ] `world.harvest(idx, qty)`, `world.findResourceNear(...)`, `world.clearForest(idx)` — never assign `world.amount`/`world.terrain`.
- [ ] `world.isBuildable` returns false for ROCK/FOREST/road tiles: the bridge def and the mine/quarry rock exemption must be special-cased in buildings.js.

### villagers.js
- [ ] `paths.request(from, to, cb, opts)` not `find`; `paths.cancel(id)` on death/abandon or a callback runs against a dead agent.
- [ ] Movement speed from `world.speedAt(idx)`, never `path.cost`/`moveCost`.
- [ ] Destination auto-adjacency: check `tiles[tiles.length-1]`, don't assume it equals `to`.
- [ ] `{partial:true}` from greedy fallback means "re-path on arrival".

### economy.js
- [ ] `paths.sameRegion(a, b)` — NOT `regionOf(a)===regionOf(b)` (two unwalkable tiles both answer -1).
- [ ] Never cache a region id across ticks.

### military.js
- [ ] `{enemy:true}` on EVERY enemy path call, or raiders walk through gates.
- [ ] `world.passes` = `[{x,y,idx,name,dx,dy}]`, name pre-formatted ('North Pass'), dx/dy inward unit vector for the arrow. >=2 guaranteed, normally 3 — index defensively.

### main.js
- [ ] `world.generate(seedFromQuery)` BEFORE `world.init()`; `paths.init()` after world exists.
- [ ] Restore: `world.restore()` -> `paths.rebuild()` (mandatory, no args) -> buildings -> villagers -> economy -> military.
- [ ] `world.restore()` returning `false` = unusable save: discard with a toast, start fresh. Never throws, never half-applies.
- [ ] Pre-place Town Centre at `(world.start.x-1, world.start.y-1)` — `world.start` is the CENTRE tile of the 8x8 `world.startArea`.
- [ ] Pre-lay the 3-tile dirt path stub (ADDENDUM E3).
- [ ] `paths.update()` must run or every queued path request is stranded.
- [ ] `world.seed` (the successful seed) goes in the save's top-level `seed`; `world.baseSeed` is the originally requested one.

### render.js / ui.js
- [ ] `world.elev * 4px` diamond lift; mountains always elev 4.
- [ ] `world.weather` snow lingers/melts after Winter by design.
- [ ] Spent stone/iron/clay keep `resource` with `amount === 0` — draw as spent outcrops; non-zero resource != has stock.
- [ ] Debug overlay data: `paths.stats`, `paths.pendingCount()`, `paths.budgetLeft()`, `world.lastValidation.detail`.

---

## From `input.js` + `particles.js`

### main.js
- [ ] `game.canvas` set BEFORE `input.init()` or no listeners attach (degrades silently to headless).
- [ ] `input.resize()` on every window resize AND once after the canvas has layout — `viewW/viewH` come from `clientWidth/clientHeight`, and 0 locks the camera to map centre.
- [ ] `particles.update(dt, game)` before `render`. `input.update()` may go anywhere (ignores passed dt).
- [ ] Optional but preferred: expose `game.setSpeed(n)` / `game.togglePause()`; input falls back to writing `game.speed`/`game.state`.
- [ ] `input.serialize()` -> `{cam, tool, selected}`; `cam` goes in the save's top-level `cam`. Restore the camera AFTER `init()` (init only auto-centres when cam is still at 0,0).
- [ ] On restart call `input.destroy()`/`particles.destroy()` first, or re-call `init()` (idempotent, self-destroys).

### render.js
- [ ] `particles.drawGroundWorld(g, this)` BEFORE entities, `particles.drawOverheadWorld(g, this)` AFTER (world transform already applied).
- [ ] Keep `renderer.vx0/vx1/vy0/vy1` populated each frame — particles cull against them.
- [ ] `this.cam = game.input.cam` — one shared camera object, never a copy.
- [ ] Don't draw a ghost when `input.hover === -1` (off-map OR over a DOM overlay).
- [ ] `input.dragTiles` is live and reused — read, never retain.

### ui.js
- [ ] Owns §13 hotkeys; input yields while `ui.onKey` is a function.
- [ ] Set `ui.modalOpen = true` when a modal is open so input leaves Escape alone.
- [ ] `input.setTool(kind, defId)` and `setTool(defId)` both work; `input.tool` is always a string.

### villagers.js
- [ ] Provide `villagers.pickAt(fx, fy, radiusTiles) -> id|-1` (preferred) OR a `villagers.list` of agents with `vx, vy, id, dead` — without one, clicking a villager selects the building under them.

### military.js
- [ ] Call `particles.arrow(fx, fy, tx, ty)` on every tower/crossbow shot (no frozen event exists for a shot).

### Cleanup before ship
- [ ] Delete `static/hearthmere/_harness/` entirely.

---

## From `ui.js` + `hearthmere.css`

### main.js
- [ ] Inject `<link rel="stylesheet" href="/static/hearthmere/hearthmere.css">`. **REQUIRED**
- [ ] `createUI(game)` -> `ui.init()` after all modules -> `ui.update(dt, game)` LAST in the tick.
- [ ] Expose `game.setSpeed(n)` for n in 0..3 (fallback: ui writes `game.speed`/`game.state`).
- [ ] `game.bus` with `on(name, fn) -> unsubscribe` and `emit`. **REQUIRED**
- [ ] Optionally persist `ui.serialize()` / `ui.restore(obj)` (build tab, collapse, overlays). `ui.destroy()` exists.

### economy.js  (number property OR zero-arg method)
- [ ] **REQUIRED**: `tier`, `daysOfFood`, `stock(itemId)`, `stored(itemId)`
- [ ] Expected: `population`, `housingCapacity`, `employed`, `unemployed`, `homeless`, `townHealth`, `happiness`, `coin`, `foodUnits`, `starvingDays`
- [ ] `stored()` must be the real per-item STORED count (storage buildings only) — the UI recomputes the variety breakdown from `stored(id) >= 4` and will visibly disagree with `townHealth` otherwise.

### buildings.js
- [ ] `list` **REQUIRED**, `byId(id)`, `capacityFor(b, item)`, `setPriority(id,0..2)`, `setActive(id,bool)`, `demolish(id)`, `setRecipe(id, recipeId)`.
- [ ] NOTE: ui expects `cancel(id)`; buildings.js has no such method — `demolish(id)` covers both. Fallback already handles it.
- [ ] `b.idleReason` must be exactly a frozen §7 string (`'no materials: <item>'` is parsed on the colon).

### villagers.js
- [ ] `list` **REQUIRED**, `byId(id)`, `get(id)` with `dead`, `pickAt(fx, fy, r) -> id|-1`.
- [ ] **Export `villagers.VS`** — ui maps `v.state` to English by assuming §8's declaration order; a different order silently mis-describes villagers.
- [ ] `v.task.fromId` / `v.task.toId` must be BUILDING IDS so the inspector can name the destination.
- [ ] Fields: `id, name, vx, vy, homeId, jobId, role, state, carry{item,qty}, task{...}, age, hunger, health`.

### military.js
- [ ] `warning -> {wave, daysUntil, passes}|null`, `raidActive`, `enemies[]`, `soldiers[]`.
- [ ] `game:over {reason, stats:{days, peakPop, raidsHeld, tier}}` — ui renders exactly these four.

### input.js
- [ ] `panTo(tileX, tileY)` **REQUIRED**, `setTool(kind, defId)` **REQUIRED**, `select(kind, id)` **REQUIRED**, `selected -> {kind,id}` polled every frame **REQUIRED**, `clearSelection()`, `tool`.

### render.js
- [ ] `render.setOverlay(id, on)` for `'roads'|'happiness'|'food'|'raid'`.
- [ ] `render.cam === input.cam` (same object, not a copy).
- [ ] Keep `vx0/vx1/vy0/vy1` populated for particle culling.
- [ ] `particles.drawGroundWorld` before entities, `drawOverheadWorld` after.

---

## From `villagers.js`

### main.js
- [ ] `villagers.init()` after all modules (reads `game.world`, seeds `nameSalt` from `world.seed`, subscribes to `day:ended`/`building:completed`/`building:destroyed`).
- [ ] Runs FOURTH, after `paths.update()` has flushed the queue.
- [ ] **`villagers.postRestore()` must be called AFTER `economy.restore()`** — it re-links claimed tasks and clears watchdogs. Without it, in-flight tasks are dropped rather than re-linked.
- [ ] Call `villagers.assignJobs()` once after initial town setup (idempotent; otherwise self-wired to events).

### economy.js  *** TASK-QUEUE SEAM ***
- [ ] Expose `claimTask(v)->task|null` (porters-first ordering lives here), `onPickedUp(t, actualQty)` (called even with 0; may cancel re-entrantly), `completeTask(t, deliveredQty)` (qty ACCEPTED by `add`, not the villager), `cancelTask(t, reason)`, `releaseTask(t)`.
- [ ] Task fields: `id, item, qty, fromId, toId, claimedBy, kind, picked, cancelled, done`. `fromId`/`toId` are BUILDING IDS.
- [ ] economy owns housing: call `villagers.setHome(v, buildingId)`.
- [ ] **economy must NOT emit `villager:died`** — villagers.js emits it from `kill()`. Double emission double-counts raid grief in §9.6.
- [ ] **economy must NOT deduct food globally** — villagers are the only consumers, eating via `buildings.take()`. `foodNeededPerDay` stays a HUD/starvation metric. Optional hook: `economy.onVillagerAte(v, item, qty, building)`.
- [ ] `economy.stock(item)` must include `villagers.carriedTotals(out)` — goods in hands are real (pillar 3).

### military.js
- [ ] Expose `military.intentFor(villagerId)` — a soldier stays in `VS.FIGHT` only while an intent exists. Missing = soldiers never fight.
- [ ] `military.raidActive`, `military.enemies[]` with `x/y` (or `vx/vy`) and `dead`/`hp`.
- [ ] Use `villagers.orderCombat(id, x, y, enemyId)` (safe every tick, 0.6s re-path cooldown).
- [ ] `forcedConscript(n)` returns an ARRAY of ids; identify drafted men by `v.conscript`, not a `'militia'` role.

### render.js / ui.js
- [ ] **`v.path` is a reused buffer — read only `v.pathLen` entries from `v.pathStep`.** `v.path.length` is NOT the path length.
- [ ] Available: `villagers.VS` / `PH` / `VS_NAMES`, `activityText(v)`, `roleName(v)`, `workersPresent(b)`, `employedCount`/`unemployedCount`/`homelessCount`, `carriedTotals(out)`, `villagers.debug`.
- [ ] Gatherers have no intermediate `v.carry` (buildings.gatherComplete does the write at the door). Draw a sack when `v.phase === PH.TO_DOOR` so "nothing teleports" still reads visually.

---

## From `military.js`

- [ ] **buildings.js: `paths.setGate(idx, bool)` on gate completion/destruction.** CONFIRMED BUG — `world.gate[]` is 0 for a built gate, so enemy pathing walks through it. (ADDENDUM H1)
- [ ] buildings.js: destroying a Guard Tower/Barracks/Keep must kill or evict its garrison.
- [ ] villagers.js: must call `military.intentFor(villagerId)` and hold `VS.FIGHT` while non-null (`{mode:'intercept', tx, ty, enemyId}` during a raid, null otherwise). Both push (`orderCombat`) and pull (`intentFor`) are supported.
- [ ] villagers.js: `kill(id, 'raid')` must clear the id from `b.workers` and emit `villager:died`.
- [ ] villagers.js: soldiers must not be reassigned to non-military jobs while `military.raidActive`.
- [ ] villagers.js owns §10.1 peacetime patrol; military drives no peacetime movement.
- [ ] economy.js must NOT emit `game:over` — military owns §10.7.
- [ ] paths.js: `find` must tolerate a `from` inside a footprint (lax corner rule lets a unit floor into a blocked tile for a tick) and must never throw.
- [ ] UI/render: `military.kitOf(id)`, `strengthFor(wave)`, `townValue()`, `daysUntilRaid()`, `defencePower()`, `finalStats()`, `military.debug` all available. `'no soldiers'` alert keys off `military.soldierCount === 0`.
- [ ] `raid:ended` now also carries `wallsLost`; held/ravaged is decided on NON-WALL losses.

## From `render.js`

### main.js
- [ ] Set `game.canvas` and `game.ctx` BEFORE `render.init()`.
- [ ] Give the canvas a CSS size only. **Render owns `canvas.width/height` and `setTransform(dpr,...)`** — main.js must not set the backing store, add a CSS transform, or add a border, or picking breaks.
- [ ] `render.resize()` on window resize (render self-checks every 32 frames as a backstop).
- [ ] `render.update(dt, game)` second-to-last; `render.dispose()` on teardown.
- [ ] `render.serialize()` -> `{overlays, minimap}` (view prefs only; camera belongs to input).

### villagers.js
- [ ] **`v.pathLen` must be maintained** — render uses it, not `v.path.length` (buffer capacity), to decide if a villager is walking.
- [ ] **Do not renumber `PH`** — render mirrors `PH.TO_DOOR = 5` to draw a gatherer's sack.
- [ ] `v.role` must be a key of `ROLE_COLOURS`.

### world.js
- [ ] `world.rev` must bump on EVERY terrain/road/solid/gate mutation — it is render's sole ground-cache invalidation signal.

### buildings.js
- [ ] `b.progress`/`b.delivered` stay populated on sites (scaffolding + material pile); `b.connected` stays current (road overlay + red X).
- [ ] Defs with `instance:false` (path/road/bridge) must not appear in `buildings.list`.

### particles.js
- [ ] Both particle layers are drawn BEFORE the ambient day/night multiply, so overhead particles are tinted at night. For anything that must stay bright, call `render.addGlow(worldX, worldY, radiusPx, intensity)` during the overhead call.

### ui.js
- [ ] `render.setOverlay(id, on)` — `render.overlay` (string) is now `render.overlays` (map), independently toggleable.
- [ ] Prefer `input.panTo(tx, ty)` over `render.centreOnTile` (the latter writes input's camera object).
- [ ] `render.toggleMinimap()` — minimap sits at `viewW-146, viewH-146`, 132px square; turn it off if ui chrome collides.

---

## From the fix round (constants.js + buildings.js)

- [x] **GATE BUG FIXED** — `paths.setGate()` wired on completion/destruction; proved against the real stack (sealed ring -> enemy path null, villager path through gate, gate destroyed -> enemy route opens through that tile). Gates never get `setSolid`.
- [x] `buildings.takeOverflow(item, qty)` exists — economy's `drainOverflow()` guard will now pass for the first time (it was silently a no-op).
- [x] Per-class storage caps via `b.clsCount`; `'no storage: <class>'` live.
- [x] Garrison eviction/kill on destruction.
- [ ] **villagers.js**: use `buildings.siteNeedsAnyBuilder(b)` (already guessed correctly at villagers.js:1639 — the fallback is now dead code). Pass `unemployed = true` to `applyBuilder`.
- [ ] **economy.js**: `buildings.capacityFor()` is the ONLY correct source of storage room now — `st.cap - invCount` is wrong for Town Centre/Warehouse/Trading Post.
- [ ] **military.js**: do NOT kill garrisons yourself; `buildings.damage(id,n,true)` does it. Doubling double-counts raid grief.
- [ ] **ui.js**: append the class from `'no storage: <cls>'` to the alert label.

---

## From the economy + villagers fix round

- [x] `arriveAt` seam fixed (economy was calling it with the wrong signature); the spawn fallback is deleted.
- [x] Winter hunger is real — measured 1.2631x Autumn vs a nominal 1.25. The deeper bug was `eatAt()` converting surplus nutrition to satiety at a hard-coded constant that was the *inverse of the hunger rate*, so a Winter meal banked 25% more seconds and total intake stayed flat. Satiety is now rate-linked.
- [x] `buildings.takeOverflow` now actually called — economy's `drainOverflow()` guard had been silently failing. 743 stranded units -> 84 (the 84 is real: every good-class store is full).
- [x] G2.3 deadlock proved gone: real start conditions, all 10 villagers employed, cottage built in 68.0s. Under the old unemployed-only rule the same town never built it at all (0.0 progress in 360s).
- [x] Peacetime patrol costs zero A* budget (380 path calls without soldiers, 376 with six) and yields within 2 game-seconds of a raid starting.

### THREE MORE MISSING-EMIT SEAMS (same shape as the gate bug)
- [x] `task:completed`, `villager:arrived`, `villager:left` were emitted by **nobody**. Both modules' comments each said the other owned it. `particles.js` had a live listener for the coin/food pop on every completed haul that had never fired once. All three now emit from `villagers.js` per G6.
- [ ] **particles.js**: `task:completed` now fires for real with `{id, villagerId, item, qty, toId, x, y}` — throttle on your side if it is too noisy at 220 villagers.
- [ ] **military.js**: `military.js:1153` emits `villager:died` directly. G6 gives that to `villagers.kill()`, and `buildings.clearGarrison` already routes through it. Audit every death path or raid grief double-counts.
- [ ] **ui.js**: `villagers.activityText()` returns `'patrolling'` for peacetime soldiers; deriving text from `VS` alone loses that.

### Open, assigned to the J round
- [ ] **J2 eat-at-home** — measured: foresters spend 44.7% of the day eating and 0.2% working, output 0.20 wood/day.
- [ ] **J3 storage monopoly** — one item can still fill 100% of a class permanently and wedge the timber chain.

---

## From the J3 round (storage monopoly + discard)

- [x] **The wedge is broken.** `C.ITEM_CLASS_SHARE = 0.40` with floor `C.ITEM_CLASS_FLOOR = 12`, enforced inside `buildings.capacityFor()`. Effective cap = `max(floor(classCap * 0.40), min(classCap, 12))`. Composes with G3's per-class caps so both bind.
- [x] Houses have a `foodCap: 6` larder — ONE shared food buffer, not 6 per item. `wants(house)` returns `[]` so `'feed'` tasks don't collide with `'supply'`.
- [x] `buildings.discard(b, item, qty) -> number`, emits `items:discarded {id, item, qty}`. Refuses sites, floors fractions, clamps to held.
- [x] Knock-on caught: `classHasRoom(cls)` was no longer proof *this item* could be hauled, so a Woodcutter at the store's 40% wood cap reported `'output full'` forever instead of `'no storage: good'` — the wedge would have become SILENT rather than visible. New `haulRoomFor(item)` fixes it.

### Open
- [ ] **main.js**: `START_STOCK.wood = 40` no longer fits the Town Centre (per-item cap 30). Boot must use `buildings.deposit()` not `add()` for the start stock, or 10 wood is silently dropped. `economy.drainOverflow()` re-homes it.
- [ ] **ui.js**: wire a confirm-guarded inventory-row button to `buildings.discard()`. Must NOT be named in any alert or `idleInfo` text.
- [ ] **ui.js (K6)**: kits may now be PARTIAL — `kit.name` comes from the weapon and `kit.maxHp` no longer tracks `kit.power`. Show `buildingsLost - wallsLost` as the headline, walls separately.
- [ ] **ui.js**: append the class from `'no storage: <cls>'`; `idleInfo()` still prints all three remedies for every class.
- [ ] **ui.js**: `villagers.activityText()` returns `'patrolling'` — deriving from `VS` alone loses it.
- [ ] **particles.js**: `task:completed` now fires for real; throttle if noisy at 220 villagers.

---

## From the UI rewiring round (L2 / K6 / G3 / J3)

- [x] **The variety meter agreed with nothing.** `updateVariety()` re-derived the set from `stored(id) >= 4` while `economy` counted L2's eaten-in-3-days rule. Now reads `economy.nutrition.{byGroup, items, distinctItems, distinctGroups, varietyScore, missing}` and `economy.healthTarget` directly. Verified live: chips identical to `nutrition.byGroup`, meter 58, tooltip "settling toward 55", `healthTarget` 55. Under the old rule two of the four foods vanished from the display while health stayed 55.
- [x] Variety signature now includes WHICH foods qualify (with a `*` for eaten-qualified), so chips redraw when the set changes, not just its size.
- [x] Raid report: headline is `buildingsLost - wallsLost`, walls get their own clause. Verified: `{buildingsLost:1, wallsLost:1}` -> "1 wall section fell holding them out", zero buildings claimed.
- [x] Partial kits render weapon and armour separately; hit points from `kit.maxHp`, never from power.
- [x] `'no storage: <cls>'` names the one remedy the player needs, not all three.
- [x] Discard wired: confirm dialog + quantity slider -> `buildings.discard()`. Grep-confirmed it is named in no alert or fix text.
- [x] `ui.modalOpen` is finally written (it never was, so every branch on it was dead).
- [x] `military.js` raid toast reduced to the kill count (ui owns the after-action report) — fixed directly.
- [x] `economy.js` storage toasts use display names, not raw class ids — fixed directly.

### Open
- [ ] **villagers.js**: `activityText()` builds haul strings from the raw item id (`'fetching 6 plank'`) instead of `ITEMS[id].name`. Fix there and ui can defer to it unconditionally.
- [ ] **economy.js** (minor): `nutrition.missing` is only filled by the daily recount, so it is `[]` on day 1 while `distinctGroups` is 0; ui falls back to `byGroup` for one day.
