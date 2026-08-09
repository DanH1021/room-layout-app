import { v4 as uuid } from "uuid";
import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";

/**
 * Creates a new placed instance of an equipment item at (x, y), plus — if the
 * item is a table with a default chair count — child chair LayoutObjects
 * linked via parentObjectId, arranged evenly around the table perimeter.
 * Mirrors the LayoutObject/parentObjectId relationship in the Prisma schema.
 *
 * Takes a `getEquipment` lookup rather than importing a static library
 * directly, so it works identically whether the equipment list came from the
 * static MVP fixtures or from a real database query.
 */
export function instantiateEquipment(
  equipmentItemId: string,
  x: number,
  y: number,
  getEquipment: (id: string) => EquipmentItem
): LayoutObject[] {
  const item = getEquipment(equipmentItemId);
  const tableId = uuid();

  const table: LayoutObject = {
    id: tableId,
    equipmentItemId: item.id,
    parentObjectId: null,
    shape: item.shape,
    x,
    y,
    rotation: 0,
    widthIn: item.widthIn,
    lengthIn: item.lengthIn,
    diameterIn: item.diameterIn,
    zIndex: 1,
    label: item.name,
  };

  const objects: LayoutObject[] = [table];

  if (item.category === "table" && item.defaultChairCount && item.defaultChairCount > 0) {
    const chairItem = getEquipment("eq-chair");
    const chairs = generateChairsAround(item, tableId, item.defaultChairCount, chairItem);
    objects.push(...chairs);
  }

  return objects;
}

function generateChairsAround(
  tableItem: EquipmentItem,
  parentId: string,
  count: number,
  chairItem: EquipmentItem
): LayoutObject[] {
  const chairs: LayoutObject[] = [];
  const gap = 4; // inches between table edge and chair

  // NOTE: positions below are computed RELATIVE to the table's own center
  // (i.e. as if the table sat at the origin with 0 rotation). Chair objects
  // store (x, y, rotation) as this relative offset when parentObjectId is
  // set; the parent table's own transform (position + rotation) is applied
  // on top when rendering, and Konva's Group handles the combined transform
  // so dragging/rotating the table moves and turns its chairs for free.
  if (tableItem.shape === "circle" && tableItem.diameterIn) {
    const radius = tableItem.diameterIn / 2 + gap + (chairItem.lengthIn ?? 20) / 2;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      // Rotate chair so it faces the table center.
      const rotation = (angle * 180) / Math.PI + 90;
      chairs.push(makeChair(chairItem, parentId, x, y, rotation));
    }
  } else if (tableItem.shape === "rect" && tableItem.widthIn && tableItem.lengthIn) {
    // Distribute chairs along the two long sides first, then short sides if needed.
    const halfLen = tableItem.lengthIn / 2;
    const halfWid = tableItem.widthIn / 2;
    const chairSpan = (chairItem.widthIn ?? 18) + 2;
    const perLongSide = Math.max(1, Math.floor(tableItem.lengthIn / chairSpan));
    const positions: { x: number; y: number; rotation: number }[] = [];

    const addSide = (n: number, side: "top" | "bottom" | "left" | "right") => {
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1); // 0..1 along the side
        if (side === "top") {
          positions.push({
            x: -halfLen + t * tableItem.lengthIn!,
            y: -halfWid - gap - (chairItem.lengthIn ?? 20) / 2,
            rotation: 180,
          });
        } else if (side === "bottom") {
          positions.push({
            x: -halfLen + t * tableItem.lengthIn!,
            y: halfWid + gap + (chairItem.lengthIn ?? 20) / 2,
            rotation: 0,
          });
        }
      }
    };

    let remaining = count;
    const topCount = Math.min(perLongSide, Math.ceil(remaining / 2));
    addSide(topCount, "top");
    remaining -= topCount;
    const bottomCount = Math.min(perLongSide, remaining);
    addSide(bottomCount, "bottom");
    remaining -= bottomCount;

    // Any leftover chairs (e.g. 10-top on an 8ft table) go on the short ends.
    if (remaining > 0) {
      positions.push({ x: -halfLen - gap - (chairItem.lengthIn ?? 20) / 2, y: 0, rotation: 90 });
      remaining--;
    }
    if (remaining > 0) {
      positions.push({ x: halfLen + gap + (chairItem.lengthIn ?? 20) / 2, y: 0, rotation: -90 });
      remaining--;
    }

    for (const p of positions) {
      chairs.push(makeChair(chairItem, parentId, p.x, p.y, p.rotation));
    }
  }

  return chairs;
}

function makeChair(
  chairItem: EquipmentItem,
  parentId: string,
  x: number,
  y: number,
  rotation: number
): LayoutObject {
  return {
    id: uuid(),
    equipmentItemId: chairItem.id,
    parentObjectId: parentId,
    shape: chairItem.shape,
    x,
    y,
    rotation,
    widthIn: chairItem.widthIn,
    lengthIn: chairItem.lengthIn,
    zIndex: 2,
    label: chairItem.name,
  };
}

/** Rotates a point (px, py) around a center (cx, cy) by `degrees`. */
export function rotatePoint(px: number, py: number, cx: number, cy: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}
