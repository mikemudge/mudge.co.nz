// combat.js - shared combat primitives used by both the player and enemies:
// generic hit-flash visuals, a cone-shaped melee hit test + weapon factory,
// and a simple straight-line projectile system. Deliberately generic (no
// Player/Enemy imports) so it stays reusable if a later iteration adds a
// ranged player weapon or a projectile-flinging enemy variant.

import { isSolidWorld } from './dungeon.js';

// ---------------------------------------------------------------------------
// Hit-flash: a brief emissive-white pulse on every material of an entity's
// mesh when it takes damage. Works on any entity object that exposes
// `flashMaterials` (an array of materials with an `.emissive` property,
// gathered once via collectMaterials) and a mutable `hitFlashTimer` field.
// ---------------------------------------------------------------------------

export const HIT_FLASH_DURATION = 0.15;

// Walks a THREE.Object3D (mesh or group) and returns every material that
// supports `.emissive` (MeshStandardMaterial/MeshPhongMaterial etc) - the
// ones we can flash. Materials without emissive (e.g. the player's melee
// swing effect, or wireframe death-burst meshes) are skipped on purpose so
// flashing an entity doesn't also flash its cosmetic effect meshes.
export function collectMaterials(object3D) {
  const materials = [];
  object3D.traverse((child) => {
    if (child.isMesh && child.material && 'emissive' in child.material) {
      materials.push(child.material);
    }
  });
  return materials;
}

// Call when an entity takes damage.
export function triggerHitFlash(entity) {
  entity.hitFlashTimer = HIT_FLASH_DURATION;
}

// Call once per frame from the entity's own update(). Fades the flash back
// to unlit (black emissive) over HIT_FLASH_DURATION.
export function updateHitFlash(entity, dt) {
  if (entity.hitFlashTimer <= 0) return;
  entity.hitFlashTimer = Math.max(0, entity.hitFlashTimer - dt);
  const t = entity.hitFlashTimer / HIT_FLASH_DURATION; // 1 -> 0
  for (const mat of entity.flashMaterials) {
    mat.emissive.setRGB(t, t * 0.35, t * 0.35);
  }
}

// ---------------------------------------------------------------------------
// Melee: a cone-shaped hit test plus a small weapon-descriptor factory. The
// factory shape (an object with .cooldown/.range/.damage/.use(...)) is the
// seam a later loot system could swap for a ranged weapon descriptor without
// Player needing to change - see Player.attack() in player.js.
// ---------------------------------------------------------------------------

export const DEFAULT_MELEE_RANGE = 1.8;
export const DEFAULT_MELEE_ARC_HALF = Math.PI / 4; // total cone = 90 degrees
export const DEFAULT_MELEE_DAMAGE = 20;
export const DEFAULT_MELEE_COOLDOWN = 0.45;

// Returns every entity in `targets` that is within `range` (plus the
// target's own radius) of (originX, originZ) AND within `arcHalf` radians of
// `facingAngle`. `facingAngle` uses the same convention as Player/Enemy
// facingAngle: world direction = (sin(facingAngle), 0, cos(facingAngle)).
// Skips entities with a truthy `.dead`.
export function coneHitTest(originX, originZ, facingAngle, range, arcHalf, targets) {
  const dirX = Math.sin(facingAngle);
  const dirZ = Math.cos(facingAngle);
  const hits = [];
  for (const target of targets) {
    if (target.dead) continue;
    const dx = target.position.x - originX;
    const dz = target.position.z - originZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > range + (target.radius || 0)) continue;
    if (dist > 1e-4) {
      const dot = (dx / dist) * dirX + (dz / dist) * dirZ;
      if (dot < Math.cos(arcHalf)) continue;
    }
    hits.push(target);
  }
  return hits;
}

/**
 * Creates a melee "weapon" descriptor for Player.attack() to delegate to.
 * `use(now, originX, originZ, facingAngle, targets)` is cooldown-gated
 * internally (safe to call every frame while the attack button is held) and
 * returns `{ fired, hits }` - `fired` is false while on cooldown, in which
 * case `hits` is always empty.
 */
export function createMeleeWeapon(options = {}) {
  return {
    type: 'melee',
    range: options.range ?? DEFAULT_MELEE_RANGE,
    arcHalf: options.arcHalf ?? DEFAULT_MELEE_ARC_HALF,
    damage: options.damage ?? DEFAULT_MELEE_DAMAGE,
    cooldown: options.cooldown ?? DEFAULT_MELEE_COOLDOWN,
    lastUsed: -Infinity,
    use(now, originX, originZ, facingAngle, targets) {
      if (now - this.lastUsed < this.cooldown) return { fired: false, hits: [] };
      this.lastUsed = now;
      const hits = coneHitTest(originX, originZ, facingAngle, this.range, this.arcHalf, targets);
      return { fired: true, hits };
    },
  };
}

// ---------------------------------------------------------------------------
// Projectiles: plain data objects (not entities) with a mesh, a straight-line
// velocity, and a lifetime. Currently only spawned by the Spitter enemy (see
// enemies.js) and resolved against the player in updateEnemyProjectiles, but
// kept generic (scene/list passed in rather than assumed) so a later ranged
// player weapon could reuse spawnProjectile + a parallel
// updatePlayerProjectiles(list, dt, dungeon, scene, entities) without changes
// here.
// ---------------------------------------------------------------------------

/**
 * Builds a projectile mesh, adds it to `scene`, and pushes a projectile
 * record onto `list`. `opts`: { x, z, dirX, dirZ (unit direction), speed,
 * damage, radius, lifetime, color }.
 */
export function spawnProjectile(THREE, scene, list, opts) {
  const geo = new THREE.SphereGeometry(opts.radius, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    emissive: opts.color ?? 0x222222,
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(opts.x, 0.9, opts.z);
  mesh.castShadow = false;
  scene.add(mesh);

  const projectile = {
    position: { x: opts.x, z: opts.z },
    velX: opts.dirX * opts.speed,
    velZ: opts.dirZ * opts.speed,
    radius: opts.radius,
    damage: opts.damage,
    lifetime: opts.lifetime ?? 6,
    age: 0,
    mesh,
  };
  list.push(projectile);
  return projectile;
}

/**
 * Advances every projectile in `list` by dt, removing (and detaching from
 * `scene`) any that: exceed their lifetime, hit a dungeon wall, or hit
 * `player` (circle-vs-circle on the XZ plane) - the latter also applies
 * damage via `player.takeDamage`, which itself enforces player invulnerability.
 */
export function updateEnemyProjectiles(list, dt, dungeon, scene, player) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    p.position.x += p.velX * dt;
    p.position.z += p.velZ * dt;
    p.mesh.position.x = p.position.x;
    p.mesh.position.z = p.position.z;

    let remove = false;
    if (p.age > p.lifetime) {
      remove = true;
    } else if (isSolidWorld(dungeon, p.position.x, p.position.z)) {
      remove = true;
    } else {
      const dx = player.position.x - p.position.x;
      const dz = player.position.z - p.position.z;
      const rr = p.radius + player.radius;
      if (dx * dx + dz * dz <= rr * rr) {
        player.takeDamage(p.damage);
        remove = true;
      }
    }

    if (remove) {
      scene.remove(p.mesh);
      list.splice(i, 1);
    }
  }
}
