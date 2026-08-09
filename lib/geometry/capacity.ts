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
    const item = getEquipment(obj.equipmentItemId);
    return item.category === "chair" ? total + 1 : total;
  }, 0);
}
