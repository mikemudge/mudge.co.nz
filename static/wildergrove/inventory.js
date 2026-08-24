// Slot-based inventory: a fixed-length array of `{item, qty} | null` slots
// with stacking rules driven by ITEMS[item].maxStack. Used for the player's
// main inventory (30 slots; a placed `chest` building grants +20 via
// `addSlots`, per the design contract).
//
// Every mutation goes through addItem/removeItem so the event bus stays the
// single source of truth for "inventory changed" — nothing should reach
// into `.slots` and mutate it directly from outside this module.
import { ITEMS } from './items.js';

const DEFAULT_SIZE = 30;

export class Inventory {
  // `eventBus` is required per the contract's event-bus rule (passed in
  // explicitly, never a module-level singleton) but is nullable here so
  // this class stays usable in isolation/tests without wiring one up.
  constructor(eventBus = null, size = DEFAULT_SIZE) {
    this.eventBus = eventBus;
    this.slots = new Array(size).fill(null);
  }

  // Adds up to `qty` of `item`, filling existing stacks before empty slots.
  // Returns the leftover amount that didn't fit (0 if it all fit). Unknown
  // item ids are rejected (leftover === qty) rather than thrown, matching
  // the contract's "soft-block, don't crash" philosophy for player actions.
  addItem(item, qty) {
    const def = ITEMS[item];
    if (!def || qty <= 0) return qty;

    let remaining = qty;
    const maxStack = def.maxStack;

    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.item === item && slot.qty < maxStack) {
        const space = maxStack - slot.qty;
        const added = Math.min(space, remaining);
        slot.qty += added;
        remaining -= added;
      }
    }

    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const added = Math.min(maxStack, remaining);
        this.slots[i] = { item, qty: added };
        remaining -= added;
      }
    }

    const added = qty - remaining;
    if (added > 0 && this.eventBus) this.eventBus.emit('item_added', { item, qty: added });
    return remaining;
  }

  // Removes exactly `qty` of `item`, or fails atomically (removes nothing,
  // returns false) if there isn't enough across all slots.
  removeItem(item, qty) {
    if (qty <= 0) return true;
    if (this.countItem(item) < qty) return false;

    let remaining = qty;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.item === item) {
        const taken = Math.min(slot.qty, remaining);
        slot.qty -= taken;
        remaining -= taken;
        if (slot.qty === 0) this.slots[i] = null;
      }
    }

    if (this.eventBus) this.eventBus.emit('item_removed', { item, qty });
    return true;
  }

  // True iff every {item, qty} pair in `list` is satisfiable right now.
  hasItems(list) {
    return list.every(({ item, qty }) => this.countItem(item) >= qty);
  }

  // Single-item convenience wrapper around hasItems, for callers (buildings.js's
  // canAfford) that check one item at a time rather than a recipe-shaped list.
  hasItem(item, qty) {
    return this.hasItems([{ item, qty }]);
  }

  countItem(item) {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.item === item) total += slot.qty;
    }
    return total;
  }

  // First 9 slots, i.e. what keys 1-9 select per input.js.
  getHotbarSlots() {
    return this.slots.slice(0, 9);
  }

  // Grows the inventory by `n` empty slots (chest building: +20).
  addSlots(n) {
    for (let i = 0; i < n; i++) this.slots.push(null);
  }

  // Drag-and-drop relocation (ui.js) - lets a player deliberately arrange
  // which items sit in the first 9 hotbar slots rather than only being able
  // to select whatever landed wherever addItem happened to put it. Three
  // outcomes depending on what's at `to`: empty -> plain move; same item id
  // -> merge stacks (up to maxStack, remainder stays at `from` rather than
  // being silently dropped); different item -> swap the two slots. Returns
  // false for an out-of-range index or a no-op (same slot / empty source)
  // rather than throwing, matching this file's "soft-fail" convention.
  moveSlot(from, to) {
    if (from === to) return false;
    if (from < 0 || from >= this.slots.length || to < 0 || to >= this.slots.length) return false;
    const src = this.slots[from];
    if (!src) return false;
    const dst = this.slots[to];

    if (!dst) {
      this.slots[to] = src;
      this.slots[from] = null;
      return true;
    }
    if (dst.item === src.item) {
      const max = ITEMS[dst.item]?.maxStack ?? Infinity;
      const room = max - dst.qty;
      if (room <= 0) return false; // destination stack is already full - nothing to merge
      const moved = Math.min(room, src.qty);
      dst.qty += moved;
      src.qty -= moved;
      if (src.qty <= 0) this.slots[from] = null;
      return true;
    }
    this.slots[from] = dst;
    this.slots[to] = src;
    return true;
  }

  // Checks a recipe's inputs are all available and, only if so, consumes
  // them all. Used by crafting/cooking so a multi-ingredient recipe never
  // partially consumes inputs when a later ingredient turns out short.
  consumeForRecipe(recipe) {
    if (!this.hasItems(recipe.inputs)) return false;
    for (const { item, qty } of recipe.inputs) this.removeItem(item, qty);
    return true;
  }

  serialize() {
    return {
      size: this.slots.length,
      slots: this.slots.map((slot) => (slot ? { item: slot.item, qty: slot.qty } : null)),
    };
  }

  // Restores from serialize()'s shape. Tolerant of missing/malformed data
  // (private-browsing/corrupt-save cases are handled by main.js wrapping
  // localStorage access, but this stays defensive too) — falls back to
  // leaving the inventory as-is rather than throwing.
  deserialize(data) {
    if (!data || !Array.isArray(data.slots)) return;
    this.slots = data.slots.map((slot) => (
      slot && slot.item ? { item: slot.item, qty: slot.qty } : null
    ));
    const size = data.size || this.slots.length;
    while (this.slots.length < size) this.slots.push(null);
  }
}

// Factory form, mirroring utils.js's createEventBus() naming convention for
// callers that prefer composition over `new`.
export function createInventory(eventBus = null, size = DEFAULT_SIZE) {
  return new Inventory(eventBus, size);
}
