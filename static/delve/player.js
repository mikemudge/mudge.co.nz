// player.js - the player entity: its 3D model, movement, wall collision,
// mouse-aim facing, melee combat, and health. Deliberately entity-shaped
// (position/radius/mesh/update) rather than a pile of loose globals, so
// later iterations can build an Enemy class with the same shape (position,
// radius, mesh, take a movement delta, resolve against the dungeon) largely
// by copying this pattern - see enemies.js, which does exactly that.

import { isFloorCell } from './dungeon.js';
import { clamp } from './utils.js';
import { createMeleeWeapon, collectMaterials, triggerHitFlash, updateHitFlash } from './combat.js';

// Collision radius, in world units. CELL_SIZE is 2, so this comfortably
// clears corridors (width 2) while still feeling snug in tight spots.
export const PLAYER_RADIUS = 0.35;

// Movement speed, world units/second.
export const PLAYER_SPEED = 6;

// Visual height only (mesh sizing) - not used for collision, which is purely
// a 2D circle on the XZ plane.
export const PLAYER_HEIGHT = 1.6;

export const PLAYER_MAX_HP = 100;

// Brief window after being hit during which further damage is ignored -
// otherwise standing in a crowd (or in a projectile's path) could melt the
// player's HP within a single frame.
export const PLAYER_INVULN_DURATION = 0.6;

// How long the melee swing effect mesh stays visible/fading after an attack
// actually fires (not the attack cooldown itself - see combat.js).
export const SWING_VISUAL_DURATION = 0.18;
export const SWING_MAX_OPACITY = 0.55;
// Segments across the swing arc's visual mesh (cosmetic only, has no effect
// on the actual hit test in combat.js).
const SWING_VISUAL_SEGMENTS = 10;

// Circle-vs-grid collision test: true if a circle of the given radius
// centered at world (x, z) overlaps any non-floor (wall/void) cell.
function circleBlocked(dungeon, x, z, radius) {
  const cellSize = dungeon.cellSize;
  const minCx = Math.floor((x - radius) / cellSize);
  const maxCx = Math.floor((x + radius) / cellSize);
  const minCy = Math.floor((z - radius) / cellSize);
  const maxCy = Math.floor((z + radius) / cellSize);

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      if (isFloorCell(dungeon, cx, cy)) continue;
      const cellMinX = cx * cellSize;
      const cellMaxX = cellMinX + cellSize;
      const cellMinZ = cy * cellSize;
      const cellMaxZ = cellMinZ + cellSize;
      const closestX = clamp(x, cellMinX, cellMaxX);
      const closestZ = clamp(z, cellMinZ, cellMaxZ);
      const dx = x - closestX;
      const dz = z - closestZ;
      if (dx * dx + dz * dz < radius * radius) {
        return true;
      }
    }
  }
  return false;
}

// Resolves a proposed (dx, dz) movement from `pos` against the dungeon,
// axis-by-axis, so the player slides along a wall instead of stopping dead
// or clipping through it. Exported standalone (not just as a Player method)
// so any future entity (enemies, etc) can reuse the exact same collision
// rule without depending on the Player class.
export function resolveMove(dungeon, pos, dx, dz, radius) {
  let x = pos.x;
  let z = pos.z;

  if (dx !== 0) {
    const tryX = x + dx;
    if (!circleBlocked(dungeon, tryX, z, radius)) {
      x = tryX;
    }
  }
  if (dz !== 0) {
    const tryZ = z + dz;
    if (!circleBlocked(dungeon, x, tryZ, radius)) {
      z = tryZ;
    }
  }
  return { x, z };
}

// A small, clearly-directional low-poly blob: a rounded body with a nose
// cone poking out the front (+Z in local space) so facing reads clearly from
// the fixed overhead-ish camera angle.
function buildPlayerMesh(THREE) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.CylinderGeometry(
    PLAYER_RADIUS * 0.8, PLAYER_RADIUS, PLAYER_HEIGHT * 0.7, 8
  );
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff6a3d, roughness: 0.6 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = (PLAYER_HEIGHT * 0.7) / 2;
  body.castShadow = true;
  group.add(body);

  const noseGeo = new THREE.ConeGeometry(PLAYER_RADIUS * 0.4, PLAYER_RADIUS * 1.2, 6);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, roughness: 0.5 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  // Lay the cone on its side pointing along local +Z ("forward").
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, PLAYER_HEIGHT * 0.45, PLAYER_RADIUS * 0.9);
  nose.castShadow = true;
  group.add(nose);

  return group;
}

// Builds the (initially invisible) melee swing effect mesh: a flat triangle
// fan spanning [-arcHalf, +arcHalf] around local +Z (the same "forward" the
// nose points along), out to `range`. Since it's parented to the player's
// own mesh group, it automatically inherits the player's position and
// rotation.y = facingAngle - no separate world-space transform bookkeeping
// needed. Kept as a single reusable mesh (toggling visible/opacity) rather
// than creating/destroying geometry per swing.
function buildSwingMesh(THREE, range, arcHalf) {
  const geo = new THREE.Geometry();
  geo.vertices.push(new THREE.Vector3(0, 0, 0));
  for (let i = 0; i <= SWING_VISUAL_SEGMENTS; i++) {
    const t = -arcHalf + (2 * arcHalf * i) / SWING_VISUAL_SEGMENTS;
    geo.vertices.push(new THREE.Vector3(range * Math.sin(t), 0, range * Math.cos(t)));
  }
  for (let i = 1; i <= SWING_VISUAL_SEGMENTS; i++) {
    geo.faces.push(new THREE.Face3(0, i, i + 1));
  }
  geo.computeFaceNormals();

  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = PLAYER_HEIGHT * 0.5;
  mesh.visible = false;
  mesh.renderOrder = 10;
  return mesh;
}

export class Player {
  constructor(THREE, startPos) {
    this.position = { x: startPos.x, z: startPos.z };
    this.radius = PLAYER_RADIUS;
    this.speed = PLAYER_SPEED;
    // Facing angle in radians. 0 means facing world +Z; the mesh's "nose" is
    // built pointing +Z at rotation 0, and rotation.y = facingAngle rotates
    // it to (sin(facingAngle), 0, cos(facingAngle)) - i.e. this angle is
    // measured the same way Math.atan2(dirX, dirZ) reports it. Driven by the
    // mouse-aim world point each frame (see update()) rather than by
    // movement direction, so the player can strafe/back away while still
    // facing (and attacking toward) the cursor.
    this.facingAngle = 0;

    this.maxHp = PLAYER_MAX_HP;
    this.hp = PLAYER_MAX_HP;
    this.invulnTimer = 0;
    this.hitFlashTimer = 0;
    this.dead = false;

    // The current weapon descriptor (see combat.js createMeleeWeapon). A
    // later loot system can swap this out for a different descriptor shape
    // (e.g. a ranged weapon) without Player.attack() needing to change, as
    // long as it exposes the same `use(now, x, z, facingAngle, targets)`
    // contract.
    this.weapon = createMeleeWeapon();
    this.swingTimer = 0;

    this.mesh = buildPlayerMesh(THREE);
    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.swingMesh = buildSwingMesh(THREE, this.weapon.range, this.weapon.arcHalf);
    this.mesh.add(this.swingMesh);

    // Materials eligible for the damage hit-flash (excludes swingMesh, which
    // uses a plain unlit material with no `.emissive`).
    this.flashMaterials = collectMaterials(this.mesh);
  }

  /**
   * Advances the player by one frame.
   * @param {number} dt - seconds since last frame
   * @param {{x:number, z:number}} inputDir - desired movement direction in
   *   world XZ space, NOT necessarily normalized (main.js normalizes it);
   *   {x:0, z:0} means no input this frame.
   * @param {Dungeon} dungeon
   * @param {{x:number, z:number}} [aimPoint] - world-space point the mouse is
   *   currently aimed at (ground-plane raycast, see main.js); when given and
   *   not coincident with the player's own position, sets facingAngle to
   *   face it. Movement is independent of facing either way.
   */
  update(dt, inputDir, dungeon, aimPoint) {
    const moving = inputDir.x !== 0 || inputDir.z !== 0;
    if (moving) {
      const dx = inputDir.x * this.speed * dt;
      const dz = inputDir.z * this.speed * dt;
      const resolved = resolveMove(dungeon, this.position, dx, dz, this.radius);
      this.position.x = resolved.x;
      this.position.z = resolved.z;
    }

    if (aimPoint) {
      const ax = aimPoint.x - this.position.x;
      const az = aimPoint.z - this.position.z;
      if (ax !== 0 || az !== 0) {
        this.facingAngle = Math.atan2(ax, az);
      }
    }

    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.rotation.y = this.facingAngle;

    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }
    updateHitFlash(this, dt);

    if (this.swingTimer > 0) {
      this.swingTimer = Math.max(0, this.swingTimer - dt);
      this.swingMesh.visible = this.swingTimer > 0;
      if (this.swingMesh.visible) {
        this.swingMesh.material.opacity = (this.swingTimer / SWING_VISUAL_DURATION) * SWING_MAX_OPACITY;
      }
    }
  }

  /**
   * Attempts a melee attack toward the current facing direction against
   * `targets` (any array of {position, radius, dead, takeDamage(amount)} -
   * state.entities in practice). Safe to call every frame (e.g. while the
   * mouse button is held) - internally cooldown-gated by this.weapon, so it
   * only actually fires (and only then plays the swing visual and applies
   * damage) once the cooldown has elapsed. Returns true if it fired.
   */
  attack(now, targets) {
    const result = this.weapon.use(now, this.position.x, this.position.z, this.facingAngle, targets);
    if (result.fired) {
      this.swingTimer = SWING_VISUAL_DURATION;
      this.swingMesh.visible = true;
      this.swingMesh.material.opacity = SWING_MAX_OPACITY;
      for (const target of result.hits) {
        target.takeDamage(this.weapon.damage);
      }
    }
    return result.fired;
  }

  /**
   * Applies incoming damage, subject to the post-hit invulnerability window.
   * Returns true if the damage was actually applied. Never drops hp below 0;
   * callers (main.js) are responsible for reacting to hp reaching 0 (setting
   * state.status = 'dead').
   */
  takeDamage(amount) {
    if (this.dead || this.invulnTimer > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = PLAYER_INVULN_DURATION;
    triggerHitFlash(this);
    if (this.hp <= 0) {
      this.dead = true;
    }
    return true;
  }
}
