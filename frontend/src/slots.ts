/**
 * Slot system for the plugin API. Slots are named extension points in the UI
 * that plugins can claim to replace default content with custom rendering.
 * Each slot can only be claimed once.
 */

const claimedSlots: Set<string> = new Set();

export function claimSlot(slotName: string): boolean {
  if (claimedSlots.has(slotName)) {
    return false;
  }
  claimedSlots.add(slotName);
  return true;
}

export function isSlotClaimed(slotName: string): boolean {
  return claimedSlots.has(slotName);
}
