// player.js - the player entity: its 3D model, movement, wall collision, and
// facing. Deliberately entity-shaped (position/radius/mesh/update) rather
// than a pile of loose globals, so later iterations can build an Enemy class
// with the same shape (position, radius, mesh, take a movement delta, resolve
// against the dungeon) largely by copying this pattern.

import { isFloorCell } from './dungeon.js';
import { clamp } from './utils.js';

// Collision radius, in world units. CELL_SIZE is 2, so this comfortably
// clears corridors (width 2) while still feeling snug in tight spots.
export const PLAYER_RADIUS = 0.35;

// Movement speed, world units/second.
export const PLAYER_SPEED = 6;

// Visual height only (mesh sizing) - not used for collision, which is purely
// a 2D circle on the XZ plane.
export const PLAYER_HEIGHT = 1.6;

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

export class Player {
  constructor(THREE, startPos) {
    this.position = { x: startPos.x, z: startPos.z };
    this.radius = PLAYER_RADIUS;
    this.speed = PLAYER_SPEED;
    // Facing angle in radians. 0 means facing world +Z; the mesh's "nose" is
    // built pointing +Z at rotation 0, and rotation.y = facingAngle rotates
    // it to (sin(facingAngle), 0, cos(facingAngle)) - i.e. this angle is
    // measured the same way Math.atan2(dirX, dirZ) reports it.
    this.facingAngle = 0;
    this.mesh = buildPlayerMesh(THREE);
    this.mesh.position.set(this.position.x, 0, this.position.z);
  }

  /**
   * Advances the player by one frame.
   * @param {number} dt - seconds since last frame
   * @param {{x:number, z:number}} inputDir - desired movement direction in
   *   world XZ space, NOT necessarily normalized (main.js normalizes it);
   *   {x:0, z:0} means no input this frame.
   * @param {Dungeon} dungeon
   */
  update(dt, inputDir, dungeon) {
    const moving = inputDir.x !== 0 || inputDir.z !== 0;
    if (moving) {
      const dx = inputDir.x * this.speed * dt;
      const dz = inputDir.z * this.speed * dt;
      const resolved = resolveMove(dungeon, this.position, dx, dz, this.radius);
      this.position.x = resolved.x;
      this.position.z = resolved.z;
      this.facingAngle = Math.atan2(inputDir.x, inputDir.z);
    }

    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.rotation.y = this.facingAngle;
  }
}
