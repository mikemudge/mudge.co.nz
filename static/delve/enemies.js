// enemies.js - enemy entities (Crawler, Spitter), their AI, and dungeon-aware
// spawning. Enemies are shaped like Player on purpose (position/radius/mesh/
// take a movement delta, resolve against the dungeon via resolveMove) so
// combat/collision code can treat player and enemies uniformly wherever it
// makes sense (e.g. combat.js's coneHitTest takes any array of
// {position, radius, dead}).

import { resolveMove } from './player.js';
import { isFloorWorld } from './dungeon.js';
import { randRange, randInt, clamp } from './utils.js';
import { collectMaterials, triggerHitFlash, updateHitFlash, spawnProjectile } from './combat.js';
import { playSound } from './audio.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

export const CRAWLER_BASE_HP = 25;
export const CRAWLER_RADIUS = 0.4;
export const CRAWLER_SPEED = 3.2;
// Tightened from 8 (iteration 4): a fresh player in the very first rooms
// could get simultaneously noticed by Crawlers in adjacent rooms before ever
// seeing them coming - see the balance-pass note on enemyCountForRoom() below
// for the spawn-density half of this same fix.
export const CRAWLER_AGGRO_RADIUS = 7;
export const CRAWLER_DEAGGRO_RADIUS = 13;
// Cut from 8 (iteration 4) - at 8 damage, 2+ Crawlers converging on a fresh
// 100 hp player could chain-hit (see PLAYER_INVULN_DURATION's comment in
// player.js) for a rate that felt like an unavoidable hp-melt rather than a
// dodgeable threat on floor 1.
export const CRAWLER_BASE_CONTACT_DAMAGE = 6;
// Per-target cooldown before a Crawler can deal contact damage again - so
// standing inside a Crawler doesn't melt hp every single frame. Raised from
// 0.8 to sit just above PLAYER_INVULN_DURATION (0.9, see player.js), so a
// lone Crawler's own cooldown - not just the player's shared invuln window -
// is what caps its sustained damage rate at roughly 1 hit/second.
export const CRAWLER_CONTACT_COOLDOWN = 1.0;

export const SPITTER_BASE_HP = 16;
export const SPITTER_RADIUS = 0.4;
export const SPITTER_SPEED = 2.2;
// Reduced from 11/16 (iteration 4, same ~1.45x aggro/deaggro ratio kept) -
// a Spitter noticing the player from far off let ranged pressure open up a
// second front while a Crawler was already engaging in melee.
export const SPITTER_AGGRO_RADIUS = 9;
export const SPITTER_DEAGGRO_RADIUS = 14;
// Spitter tries to stay within this band of the player: backs away if
// closer than the min, closes in if farther than the max.
export const SPITTER_PREFERRED_MIN = 4.5;
export const SPITTER_PREFERRED_MAX = 8;
export const SPITTER_FIRE_COOLDOWN = 2.2;
export const SPITTER_PROJECTILE_SPEED = 4.5;
// Cut from 10 (iteration 4) to sit at/below Crawler contact damage rather
// than above it, so ranged hits don't spike burst damage higher than melee.
export const SPITTER_BASE_PROJECTILE_DAMAGE = 8;
export const SPITTER_PROJECTILE_RADIUS = 0.22;
export const SPITTER_PROJECTILE_LIFETIME = 6;

// How long the death-burst effect plays before the enemy is actually removed
// from the scene/entities list.
export const DEATH_EFFECT_DURATION = 0.35;

// Spawning: rough per-room cap and how strongly BFS room-depth and floor
// number scale enemy count/stats. Intentionally coarse - meant to be tuned
// later, not to be exact.
const MAX_ENEMIES_PER_ROOM = 4;
// How far from a room's wall to keep spawn points, in world units, so
// enemies don't spawn clipped into a wall corner.
const SPAWN_MARGIN = 1.5;
const SPAWN_ATTEMPTS = 8;

// ---------------------------------------------------------------------------
// Room depth (BFS over dungeon.rooms[].connections from startRoomId) - the
// same technique dungeon.js uses internally to pick the stairs room, just
// not exposed there, so reimplemented here against the public Dungeon shape.
// ---------------------------------------------------------------------------

export function computeRoomDepths(dungeon) {
  const rooms = dungeon.rooms;
  const depth = new Array(rooms.length).fill(Infinity);
  depth[dungeon.startRoomId] = 0;
  const queue = [dungeon.startRoomId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const nbId of rooms[cur].connections) {
      if (depth[nbId] === Infinity) {
        depth[nbId] = depth[cur] + 1;
        queue.push(nbId);
      }
    }
  }
  return depth;
}

// ---------------------------------------------------------------------------
// Shared enemy visuals/lifecycle
// ---------------------------------------------------------------------------

// A small wireframe burst, hidden until the enemy dies, then scaled up and
// faded out over DEATH_EFFECT_DURATION - a cheap "poof" rather than a real
// particle system.
function buildDeathBurst(THREE, color) {
  const geo = new THREE.IcosahedronGeometry(0.45, 0);
  const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.5;
  mesh.visible = false;
  return mesh;
}

class EnemyBase {
  constructor(THREE, kind, position, opts) {
    this.kind = kind;
    this.THREE = THREE;
    this.position = { x: position.x, z: position.z };
    this.radius = opts.radius;
    this.hp = opts.hp;
    this.maxHp = opts.hp;
    this.speed = opts.speed;
    this.aggroRadius = opts.aggroRadius;
    this.deaggroRadius = opts.deaggroRadius;

    // Facing angle in radians, same convention as Player: world direction is
    // (sin(facingAngle), 0, cos(facingAngle)).
    this.facingAngle = 0;
    this.aggro = false;
    this.dead = false;
    this.deathTimer = 0;
    this.hitFlashTimer = 0;

    this.mesh = opts.buildMesh(THREE, this.radius);
    this.mesh.position.set(this.position.x, 0, this.position.z);

    this.burst = buildDeathBurst(THREE, opts.burstColor ?? 0xffffff);
    this.mesh.add(this.burst);

    // Excludes the burst mesh (plain unlit material, no `.emissive`).
    this.flashMaterials = collectMaterials(this.mesh);
  }

  // Applies damage from the player's melee attack (or anything else that
  // calls it - matches the same contract Player.takeDamage exposes).
  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    triggerHitFlash(this);
    if (this.hp <= 0) {
      this.hp = 0;
      this.startDeath();
      playSound('enemyDeath');
    } else {
      playSound('hit');
    }
  }

  startDeath() {
    this.dead = true;
    this.deathTimer = DEATH_EFFECT_DURATION;
    for (const child of this.mesh.children) {
      if (child !== this.burst) child.visible = false;
    }
    this.burst.visible = true;
  }

  // Called every frame once dead, instead of the subclass's normal update().
  updateDeathVisual() {
    const t = clamp(1 - this.deathTimer / DEATH_EFFECT_DURATION, 0, 1);
    this.burst.scale.setScalar(1 + t * 2.2);
    this.burst.material.opacity = 1 - t;
  }

  syncMesh() {
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.rotation.y = this.facingAngle;
  }

  // Shared aggro/de-aggro rule: once aggroed, stays aggroed until the player
  // is beyond deaggroRadius (a wider band than aggroRadius, so it doesn't
  // flicker at the boundary).
  updateAggro(dist) {
    if (this.aggro) {
      if (dist > this.deaggroRadius) this.aggro = false;
    } else if (dist <= this.aggroRadius) {
      this.aggro = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Crawler - melee, chases the player once aggroed, deals contact damage.
// ---------------------------------------------------------------------------

function buildCrawlerMesh(THREE, radius) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.DodecahedronGeometry(radius, 0);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a2323, roughness: 0.8, emissive: 0x000000 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.y = 0.6; // squat, low-to-the-ground silhouette
  body.position.y = radius * 0.55;
  body.castShadow = true;
  group.add(body);

  // A small forward-pointing "eye" spike so facing reads at a glance.
  const eyeGeo = new THREE.ConeGeometry(radius * 0.25, radius * 0.7, 5);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4, emissive: 0x000000 });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.rotation.x = Math.PI / 2;
  eye.position.set(0, radius * 0.55, radius * 0.95);
  eye.castShadow = true;
  group.add(eye);

  return group;
}

export class Crawler extends EnemyBase {
  constructor(THREE, position, scale = 1) {
    super(THREE, 'crawler', position, {
      radius: CRAWLER_RADIUS,
      hp: Math.round(CRAWLER_BASE_HP * scale),
      speed: CRAWLER_SPEED,
      aggroRadius: CRAWLER_AGGRO_RADIUS,
      deaggroRadius: CRAWLER_DEAGGRO_RADIUS,
      burstColor: 0xff6a4d,
      buildMesh: buildCrawlerMesh,
    });
    this.contactDamage = Math.round(CRAWLER_BASE_CONTACT_DAMAGE * scale);
    this.contactCooldown = 0;
  }

  update(dt, dungeon, player /* , scene, enemyProjectiles - unused by Crawler */) {
    if (this.contactCooldown > 0) this.contactCooldown = Math.max(0, this.contactCooldown - dt);

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this.updateAggro(dist);

    if (this.aggro && dist > 1e-4) {
      this.facingAngle = Math.atan2(dx, dz);
      const nx = dx / dist;
      const nz = dz / dist;
      const resolved = resolveMove(dungeon, this.position, nx * this.speed * dt, nz * this.speed * dt, this.radius);
      this.position.x = resolved.x;
      this.position.z = resolved.z;

      const touchDist = this.radius + player.radius;
      if (this.contactCooldown <= 0 && dist <= touchDist) {
        player.takeDamage(this.contactDamage);
        this.contactCooldown = CRAWLER_CONTACT_COOLDOWN;
      }
    }

    this.syncMesh();
  }
}

// ---------------------------------------------------------------------------
// Spitter - ranged, keeps its distance, fires slow projectiles.
// ---------------------------------------------------------------------------

function buildSpitterMesh(THREE, radius) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(radius, 8, 6);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5b2f8f, roughness: 0.5, emissive: 0x000000 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = radius + 0.35; // hovers, unlike the ground-hugging Crawler
  body.castShadow = true;
  group.add(body);

  // Forward-facing "barrel" - also doubles as a facing/aim indicator.
  const barrelGeo = new THREE.ConeGeometry(radius * 0.3, radius * 1.0, 6);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8fe3c8, roughness: 0.4, emissive: 0x000000 });
  const barrel = new THREE.Mesh(barrelGeo, barrelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, radius + 0.35, radius * 0.95);
  barrel.castShadow = true;
  group.add(barrel);

  return group;
}

export class Spitter extends EnemyBase {
  constructor(THREE, position, scale = 1) {
    super(THREE, 'spitter', position, {
      radius: SPITTER_RADIUS,
      hp: Math.round(SPITTER_BASE_HP * scale),
      speed: SPITTER_SPEED,
      aggroRadius: SPITTER_AGGRO_RADIUS,
      deaggroRadius: SPITTER_DEAGGRO_RADIUS,
      burstColor: 0x8fe3c8,
      buildMesh: buildSpitterMesh,
    });
    this.projectileDamage = Math.round(SPITTER_BASE_PROJECTILE_DAMAGE * scale);
    this.fireTimer = randRange(Math.random, 0, SPITTER_FIRE_COOLDOWN); // stagger initial volleys
  }

  update(dt, dungeon, player, scene, enemyProjectiles) {
    this.fireTimer = Math.max(0, this.fireTimer - dt);

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this.updateAggro(dist);

    if (this.aggro && dist > 1e-4) {
      this.facingAngle = Math.atan2(dx, dz);
      const nx = dx / dist;
      const nz = dz / dist;

      let moveX = 0;
      let moveZ = 0;
      if (dist < SPITTER_PREFERRED_MIN) {
        moveX = -nx;
        moveZ = -nz;
      } else if (dist > SPITTER_PREFERRED_MAX) {
        moveX = nx;
        moveZ = nz;
      }
      if (moveX !== 0 || moveZ !== 0) {
        const resolved = resolveMove(
          dungeon, this.position, moveX * this.speed * dt, moveZ * this.speed * dt, this.radius
        );
        this.position.x = resolved.x;
        this.position.z = resolved.z;
      }

      if (this.fireTimer <= 0) {
        this.fireTimer = SPITTER_FIRE_COOLDOWN;
        spawnProjectile(this.THREE, scene, enemyProjectiles, {
          x: this.position.x,
          z: this.position.z,
          dirX: nx,
          dirZ: nz,
          speed: SPITTER_PROJECTILE_SPEED,
          damage: this.projectileDamage,
          radius: SPITTER_PROJECTILE_RADIUS,
          lifetime: SPITTER_PROJECTILE_LIFETIME,
          color: 0x8fe3c8,
        });
      }
    }

    this.syncMesh();
  }
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

// Picks a random world-space point inside `room`, inset from its walls by
// SPAWN_MARGIN and verified to actually be a floor cell (rooms can be
// L-shaped-adjacent to corridors in ways that make naive corner picks land
// on a wall) - falls back to the room's center, and to null if even that
// isn't floor (shouldn't happen for a room from generateDungeon, but cheap
// to guard). Exported so loot.js can reuse the exact same rule for chest
// placement rather than reimplementing it.
export function pickSpawnPointInRoom(dungeon, room) {
  const { minX, minZ, maxX, maxZ } = room.worldBounds;
  const loX = minX + SPAWN_MARGIN;
  const hiX = maxX - SPAWN_MARGIN;
  const loZ = minZ + SPAWN_MARGIN;
  const hiZ = maxZ - SPAWN_MARGIN;

  if (loX < hiX && loZ < hiZ) {
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const x = randRange(Math.random, loX, hiX);
      const z = randRange(Math.random, loZ, hiZ);
      if (isFloorWorld(dungeon, x, z)) return { x, z };
    }
  }
  if (isFloorWorld(dungeon, room.center.x, room.center.z)) {
    return { x: room.center.x, z: room.center.z };
  }
  return null;
}

// Rough, intentionally coarse scaling - tune later. More enemies in rooms
// farther (by room-graph BFS depth) from the start room, and more again on
// later floors.
function enemyCountForRoom(depth, floor) {
  const base = Math.floor(depth / 2) + Math.floor((floor - 1) / 2);
  const roll = randInt(Math.random, 0, 1);
  const count = clamp(base + roll, 0, MAX_ENEMIES_PER_ROOM);

  // Balance pass: playtesting found a fresh, un-perked player could already
  // face 2 enemies (able to converge and chain-hit - see
  // PLAYER_INVULN_DURATION in player.js) in a room just one or two steps
  // from the start, before finding any loot or perks. Floor 1's first couple
  // of rooms specifically are capped at 1 enemy so the earliest encounters
  // stay a fair introduction rather than an immediate pile-on; depth 3+ rooms
  // (and every room on floor 2+) are untouched.
  if (floor === 1 && depth <= 2) return Math.min(count, 1);
  return count;
}

function statScaleForRoom(depth, floor) {
  return 1 + depth * 0.08 + (floor - 1) * 0.15;
}

function pickEnemyKind(depth, floor) {
  const spitterChance = clamp(0.15 + depth * 0.04 + (floor - 1) * 0.05, 0, 0.55);
  return Math.random() < spitterChance ? 'spitter' : 'crawler';
}

/**
 * Spawns a fresh set of enemies for `dungeon`, scaled loosely by each room's
 * BFS depth from the start room and by `floor` (both make rooms tougher/
 * busier). Never spawns into the start room. Returns a flat array of
 * Crawler/Spitter instances (meshes already built, NOT yet added to the
 * scene - the caller, main.js, does that and pushes the result into
 * state.entities).
 */
export function spawnEnemiesForDungeon(THREE, dungeon, floor) {
  const depths = computeRoomDepths(dungeon);
  const enemies = [];

  for (const room of dungeon.rooms) {
    if (room.id === dungeon.startRoomId) continue;
    const depth = depths[room.id];
    if (!Number.isFinite(depth)) continue; // unreachable room, shouldn't happen

    const count = enemyCountForRoom(depth, floor);
    for (let i = 0; i < count; i++) {
      const pos = pickSpawnPointInRoom(dungeon, room);
      if (!pos) continue;
      const scale = statScaleForRoom(depth, floor);
      const enemy = pickEnemyKind(depth, floor) === 'spitter'
        ? new Spitter(THREE, pos, scale)
        : new Crawler(THREE, pos, scale);
      enemies.push(enemy);
    }
  }

  return enemies;
}

// ---------------------------------------------------------------------------
// Per-frame update for the whole entities list
// ---------------------------------------------------------------------------

/**
 * Advances every enemy in `entities` by dt: live enemies run their AI
 * (movement/aggro/attack, possibly spawning into `enemyProjectiles`), dead
 * ones age out their death-burst visual and are then spliced out of
 * `entities` and removed from `scene`. Mutates `entities` and
 * `enemyProjectiles` in place.
 *
 * `onDeathFinalized(enemy)`, if given, is called exactly once per enemy at
 * the moment its death is finalized (deathTimer reaching 0, right before it's
 * removed) - this module intentionally knows nothing about kill counters or
 * loot (no `state` import here), so main.js passes a callback that bumps
 * state.kills and rolls a loot.js drop, keeping that state-aware wiring out
 * of this otherwise state-agnostic module.
 */
export function updateEnemies(entities, dt, dungeon, player, scene, enemyProjectiles, onDeathFinalized) {
  for (let i = entities.length - 1; i >= 0; i--) {
    const enemy = entities[i];
    if (enemy.dead) {
      enemy.deathTimer -= dt;
      enemy.updateDeathVisual();
      if (enemy.deathTimer <= 0) {
        if (onDeathFinalized) onDeathFinalized(enemy);
        scene.remove(enemy.mesh);
        entities.splice(i, 1);
      }
      continue;
    }
    updateHitFlash(enemy, dt);
    enemy.update(dt, dungeon, player, scene, enemyProjectiles);
  }
}
