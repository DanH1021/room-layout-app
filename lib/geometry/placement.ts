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
    if (tableItem.chairArrangement === "crescent") {
      // Half-moon: chairs fill a 180° arc on one side only, leaving the
      // other half open so every seated guest faces the same direction
      // (typical banquet "crescent round"). The open side defaults to the
      // top (north) of the table in its own un-rotated frame — rotate the
      // placed table afterward, same as any other item, to aim the open
      // side at the stage/focal point. Evenly spaced including both arc
      // endpoints, so e.g. 6 chairs span the full half-circle edge to edge.
      const startAngle = Math.PI / 2; // 90° — arc runs 90°..270° (the bottom half)
      const arcSpan = Math.PI; // 180°
      for (let i = 0; i < count; i++) {
        const angle = count > 1 ? startAngle + (i / (count - 1)) * arcSpan : startAngle + arcSpan / 2;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        const rotation = (angle * 180) / Math.PI + 90;
        chairs.push(makeChair(chairItem, parentId, x, y, rotation));
      }
    } else {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);
        // Rotate chair so it faces the table center.
        const rotation = (angle * 180) / Math.PI + 90;
        chairs.push(makeChair(chairItem, parentId, x, y, rotation));
      }
    }
  } else if (tableItem.shape === "rect" && tableItem.widthIn && tableItem.lengthIn) {
    // A rect table renders with widthIn along its own local X axis and
    // lengthIn along local Y (RoomCanvas draws width -> Rect width, length
    // -> Rect height) — so for a typical banquet table (30" wide, 72-96"
    // long) the two LONG sides are on the left and right, running
    // top-to-bottom, not the top and bottom running left-to-right. Chairs
    // used to be distributed the other way around, which put them on the
    // short ends instead of along the table's length. Distribute along the
    // two long (left/right) sides first, then the short (top/bottom) ends
    // if there are more chairs than the long sides can hold.
    const halfLen = tableItem.lengthIn / 2;
    const halfWid = tableItem.widthIn / 2;
    const chairLengthIn = chairItem.lengthIn ?? 20;
    // The short ends keep the standard table-edge-to-chair clearance...
    const chairDepth = gap + chairLengthIn / 2;
    // ...but the two long sides are placed to hit a specific overall
    // footprint instead: 62in from the back of one chair, across the
    // table, to the back of the opposite chair — per Dan's spec, since the
    // flat `gap` clearance made a 30in-wide table with 20in-deep chairs on
    // both sides come out to 78in overall, wider than Great Plains actually
    // plans these. That means the chair sits with its seat a few inches
    // under the table edge (62in leaves less than a table-width-plus-two-
    // chair-depths), which matches how these are drawn in practice — chairs
    // tucked in, not pulled out. Math.max guards against a hypothetical
    // rect table wider than the 62in target itself, which would otherwise
    // place the chair center inside the table.
    const ACROSS_CHAIR_SPAN_IN = 62;
    const longSideChairCenterOffset = Math.max(halfWid, ACROSS_CHAIR_SPAN_IN / 2 - chairLengthIn / 2);
    const chairSpan = (chairItem.widthIn ?? 18) + 2;
    const perLongSide = Math.max(1, Math.floor(tableItem.lengthIn / chairSpan));
    const positions: { x: number; y: number; rotation: number }[] = [];

    const addLongSide = (n: number, side: "left" | "right") => {
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1); // 0..1 along the table's length
        const y = -halfLen + t * tableItem.lengthIn!;
        if (side === "left") {
          positions.push({ x: -longSideChairCenterOffset, y, rotation: 270 });
        } else {
          positions.push({ x: longSideChairCenterOffset, y, rotation: 90 });
        }
      }
    };

    let remaining = count;
    const leftCount = Math.min(perLongSide, Math.ceil(remaining / 2));
    addLongSide(leftCount, "left");
    remaining -= leftCount;
    const rightCount = Math.min(perLongSide, remaining);
    addLongSide(rightCount, "right");
    remaining -= rightCount;

    // Any leftover chairs (e.g. a 10-top on an 8ft table) go on the short ends.
    if (remaining > 0) {
      positions.push({ x: 0, y: -halfLen - chairDepth, rotation: 180 });
      remaining--;
    }
    if (remaining > 0) {
      positions.push({ x: 0, y: halfLen + chairDepth, rotation: 0 });
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
