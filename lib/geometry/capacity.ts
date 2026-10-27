import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";

/**
 * Sums seats by counting placed chair objects — both auto-generated ones
 * (children of a table) and standalone chairs a user drags in directly.
 * Mirrors the architecture doc's `computeCapacity(layout)`.
 */
export function computeCapacity(
  objects: LayoutObject[],
  getEquipment: (id: string) => EquipmentItem
): number {
  return objects.reduce((total, obj) => {
    // Ad-hoc objects (text labels) have no equipmentItemId and no library
    // entry — they're never seating, so just skip them rather than letting
    // the lookup throw.
    if (!obj.equipmentItemId) return total;
    let item: EquipmentItem;
    try {
      item = getEquipment(obj.equipmentItemId);
    } catch {
      return total;
    }
    return item.category === "chair" ? total + 1 : total;
  }, 0);
}
