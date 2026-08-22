// loot.js - item definitions, drop tables, world pickup meshes, and
// pickup-radius collision. Ground items (chest placements and enemy drops
// alike) are plain data records - { itemSpec, position, mesh, bobPhase } -
// not full entities, in the same spirit as combat.js's projectile records.
//
// Reuses enemies.js's room-spawn-point picking (pickSpawnPointInRoom) for
// chest placement rather than reimplementing room-bounds/floor-validity
// logic - see spawnLootForDungeon below.

import { pickSpawnPointInRoom } from './enemies.js';
import { createRangedWeapon } from './combat.js';
import { clamp } from './utils.js';

// ---------------------------------------------------------------------------
// Item categories/kinds
// ---------------------------------------------------------------------------

// Drives both the pickup mesh's shape/color (see buildPickupMesh) and how
// applyItemPickup() resolves the pickup effect.
export const ItemCategory = Object.freeze({
  WEAPON: 'weapon',
  ARMOR: 'armor',
  CONSUMABLE: 'consumable',
});

// Weapon kinds a WEAPON-category item spec can carry (see createWeaponForKind
// below). Only one exists this iteration - the ranged bow that replaces the
// player's starting melee weapon - but kept as an enum rather than a bare
// string so a second ranged/alternate-melee weapon later is a one-line add.
export const WeaponKind = Object.freeze({
  BOW: 'bow',
});

// Armor/accessory kinds - each maps to exactly one passive Player stat bonus
// (see applyArmorBonus below).
export const ArmorKind = Object.freeze({
  VITALITY: 'vitality',   // +bonusMaxHp
  SWIFTNESS: 'swiftness', // +bonusSpeed
  MIGHT: 'might',         // +bonusDamage
});

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// Chest placement (loadFloor, via spawnLootForDungeon): rolled independently
// per non-start room, capped at MAX_CHESTS_PER_FLOOR total. Chance scales
// gently with floor number, same spirit as enemies.js's per-room scaling.
export const CHEST_ROOM_CHANCE = 0.3;
export const MAX_CHESTS_PER_FLOOR = 5;

// Enemy death drops (maybeDropLoot, called from main.js's onDeathFinalized
// callback into updateEnemies) - NOT guaranteed, per spec.
export const ENEMY_DROP_CHANCE = 0.22;

// World-space radius within which the player picks up a ground item -
// mirrors STAIRS_TRIGGER_RADIUS's role in main.js.
export const PICKUP_RADIUS = 1.0;

// Pickup mesh visual tunables: float height, bob amplitude/rate, spin rate.
const ITEM_FLOAT_HEIGHT = 0.55;
const ITEM_BOB_HEIGHT = 0.12;
const ITEM_BOB_RATE = 2.0;
const ITEM_SPIN_RATE = 1.4;

// Armor bonus magnitudes - see applyArmorBonus.
export const ARMOR_VITALITY_BONUS = 25; // +max hp (and heals for the same amount)
export const ARMOR_SWIFTNESS_BONUS = 1.4; // +world units/sec move speed
export const ARMOR_MIGHT_BONUS = 6; // +flat damage, added to the equipped weapon's damage

const ARMOR_COLORS = Object.freeze({
  [ArmorKind.VITALITY]: 0x4dff88,
  [ArmorKind.SWIFTNESS]: 0x4dd2ff,
  [ArmorKind.MIGHT]: 0xff7a3d,
});

// ---------------------------------------------------------------------------
// Loot table - shared by both chest placement and enemy drops. Weighted
// random pick; weight is just a relative frequency, not a percentage.
// ---------------------------------------------------------------------------

const LOOT_TABLE = [
  { weight: 2, spec: { category: ItemCategory.WEAPON, kind: WeaponKind.BOW, name: "Hunter's Bow" } },
  { weight: 3, spec: { category: ItemCategory.ARMOR, kind: ArmorKind.VITALITY, name: 'Vitality Charm' } },
  { weight: 3, spec: { category: ItemCategory.ARMOR, kind: ArmorKind.SWIFTNESS, name: 'Swift Boots' } },
  { weight: 3, spec: { category: ItemCategory.ARMOR, kind: ArmorKind.MIGHT, name: 'Might Ring' } },
  { weight: 5, spec: { category: ItemCategory.CONSUMABLE, kind: 'potion', name: 'Healing Potion', amount: 1 } },
];

// Returns a fresh item spec ({category, kind, name, [amount]}) rolled from
// LOOT_TABLE via `rng` (a zero-arg function yielding [0, 1), e.g. Math.random
// - see the callers below for why this isn't the dungeon's seeded RNG).
function rollItemSpec(rng) {
  const totalWeight = LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * totalWeight;
  for (const entry of LOOT_TABLE) {
    if (roll < entry.weight) return entry.spec;
    roll -= entry.weight;
  }
  return LOOT_TABLE[LOOT_TABLE.length - 1].spec;
}

// ---------------------------------------------------------------------------
// Pickup effects
// ---------------------------------------------------------------------------

function createWeaponForKind(kind) {
  if (kind === WeaponKind.BOW) {
    return createRangedWeapon({ name: "Hunter's Bow" });
  }
  // Shouldn't happen with the current LOOT_TABLE, but fall back to a bow
  // rather than throwing if a future table entry forgets to add a case here.
  return createRangedWeapon();
}

function applyArmorBonus(player, kind) {
  if (kind === ArmorKind.VITALITY) player.addBonusMaxHp(ARMOR_VITALITY_BONUS);
  else if (kind === ArmorKind.SWIFTNESS) player.addBonusSpeed(ARMOR_SWIFTNESS_BONUS);
  else if (kind === ArmorKind.MIGHT) player.addBonusDamage(ARMOR_MIGHT_BONUS);
}

/**
 * Applies a picked-up item's effect to `player`:
 * - WEAPON: replaces player.weapon outright (see WeaponKind/createWeaponForKind).
 *   Known simplification: this is a straight swap, not a real inventory -
 *   there's no way to carry/switch between multiple owned weapons yet.
 * - ARMOR: applies a permanent-for-the-run passive stat bonus (see
 *   ArmorKind/applyArmorBonus) - these stack (picking up two Might Rings adds
 *   both bonuses).
 * - CONSUMABLE: adds to player.potionCount (see itemSpec.amount) rather than
 *   healing instantly - consumed later via player.usePotion().
 */
export function applyItemPickup(player, itemSpec) {
  if (itemSpec.category === ItemCategory.WEAPON) {
    player.weapon = createWeaponForKind(itemSpec.kind);
  } else if (itemSpec.category === ItemCategory.ARMOR) {
    applyArmorBonus(player, itemSpec.kind);
  } else if (itemSpec.category === ItemCategory.CONSUMABLE) {
    player.addPotions(itemSpec.amount ?? 1);
  }
}

// ---------------------------------------------------------------------------
// Pickup mesh + lifecycle
// ---------------------------------------------------------------------------

// A small, category-distinct mesh: a gold cone for weapons, a colored
// octahedron (color keyed to ArmorKind) for armor/accessories, and a pink
// sphere for consumables - deliberately simple shapes, just readable and
// distinct at a glance from the fixed follow-camera's distance. A point
// light matching the mesh color makes ground items visible against the
// dungeon's dim palette, similar in spirit to the stairs beacon in main.js.
function buildPickupMesh(THREE, category, kind) {
  const group = new THREE.Group();

  let color;
  let geo;
  if (category === ItemCategory.WEAPON) {
    color = 0xffd23f;
    geo = new THREE.ConeGeometry(0.22, 0.6, 6);
  } else if (category === ItemCategory.ARMOR) {
    color = ARMOR_COLORS[kind] ?? 0x5ad1ff;
    geo = new THREE.OctahedronGeometry(0.3, 0);
  } else {
    color = 0xff5a8c;
    geo = new THREE.SphereGeometry(0.24, 8, 6);
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.position.y = ITEM_FLOAT_HEIGHT;
  group.add(mesh);

  const light = new THREE.PointLight(color, 0.6, 4);
  light.position.y = ITEM_FLOAT_HEIGHT;
  group.add(light);

  // Referenced each frame in updateGroundItems to spin - see below.
  group.userData.spinMesh = mesh;
  return group;
}

// Frees GPU resources for a ground item's mesh subtree before dropping it -
// same pattern as main.js's disposeObject3D, duplicated here (rather than
// imported) to keep loot.js from depending on main.js, which would create an
// import cycle (main.js already imports this module).
function disposeGroundItemMesh(object3D) {
  object3D.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) mat.dispose();
    }
  });
}

function spawnGroundItem(THREE, scene, list, itemSpec, x, z) {
  const mesh = buildPickupMesh(THREE, itemSpec.category, itemSpec.kind);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const record = {
    itemSpec,
    position: { x, z },
    mesh,
    // Desyncs identical items' bob/spin animations from each other.
    bobPhase: Math.random() * Math.PI * 2,
  };
  list.push(record);
  return record;
}

/**
 * Rolls a chance for a dying enemy to drop an item at (x, z) - NOT guaranteed
 * (see ENEMY_DROP_CHANCE). `rng` is a zero-arg [0,1) function (main.js passes
 * Math.random, matching enemies.js's own use of Math.random for spawn rolls
 * rather than the dungeon's seeded generator - drops are meant to vary run to
 * run even on a fixed dungeon seed). Returns the new ground item record, or
 * null if nothing dropped.
 */
export function maybeDropLoot(rng, THREE, scene, list, x, z) {
  if (rng() > ENEMY_DROP_CHANCE) return null;
  const itemSpec = rollItemSpec(rng);
  return spawnGroundItem(THREE, scene, list, itemSpec, x, z);
}

/**
 * Places a handful of loot chests (visually indistinguishable from an enemy
 * drop of the same category - see buildPickupMesh) into `dungeon`'s rooms
 * when a floor loads. Never places into the start room. Returns a flat array
 * of ground item records (meshes already added to `scene`), ready to store
 * as state.groundItems.
 */
export function spawnLootForDungeon(THREE, scene, dungeon, floor) {
  const list = [];
  const chestChance = clamp(CHEST_ROOM_CHANCE + (floor - 1) * 0.02, 0, 0.6);
  let chestCount = 0;

  for (const room of dungeon.rooms) {
    if (chestCount >= MAX_CHESTS_PER_FLOOR) break;
    if (room.id === dungeon.startRoomId) continue;
    if (Math.random() > chestChance) continue;

    const pos = pickSpawnPointInRoom(dungeon, room);
    if (!pos) continue;

    const itemSpec = rollItemSpec(Math.random);
    spawnGroundItem(THREE, scene, list, itemSpec, pos.x, pos.z);
    chestCount++;
  }

  return list;
}

/**
 * Advances every ground item's bob/spin animation (phase-based on `elapsed`,
 * same style as main.js's updateStairsMarker - no per-frame integration
 * needed), then checks proximity against `player` (circle-vs-circle on the
 * XZ plane, mirroring the stairs-beacon trigger check in main.js) - a
 * picked-up item applies its effect immediately (see applyItemPickup) and is
 * removed from `list` and `scene`. Mutates `list` in place.
 */
export function updateGroundItems(list, elapsed, player, scene) {
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];

    const spinMesh = item.mesh.userData.spinMesh;
    if (spinMesh) spinMesh.rotation.y = elapsed * ITEM_SPIN_RATE + item.bobPhase;
    item.mesh.position.y = ITEM_BOB_HEIGHT * Math.sin(elapsed * ITEM_BOB_RATE + item.bobPhase);

    const dx = player.position.x - item.position.x;
    const dz = player.position.z - item.position.z;
    const rr = PICKUP_RADIUS + player.radius;
    if (dx * dx + dz * dz <= rr * rr) {
      applyItemPickup(player, item.itemSpec);
      disposeGroundItemMesh(item.mesh);
      scene.remove(item.mesh);
      list.splice(i, 1);
    }
  }
}
