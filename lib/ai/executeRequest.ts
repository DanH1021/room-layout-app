import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";
import { StructuredLayoutRequest } from "@/lib/schemas/aiRequest";
import { instantiateEquipment } from "@/lib/geometry/placement";
import { circleVsCircle } from "@/lib/geometry/collision";
import { toShape, farthestPointDistance } from "@/lib/geometry/validate";

export interface ExecuteResult {
  objects: LayoutObject[];
  changeSummary: string[];
}

const GRID_STEP_IN = 12; // 1ft scan resolution
const MARGIN_IN = 18;

interface FootprintCircle {
  cx: number;
  cy: number;
  radius: number;
}

/**
 * The exact same footprint concept lib/geometry/validate.ts uses for its
 * clearance warnings (table/equipment shape + every attached chair + the
 * item's own clearance allowance), computed here by actually instantiating
 * the item at the origin. Reusing the *real* computation — rather than a
 * hand-tuned approximation — guarantees placement and validation never
 * disagree about how much space something needs. (An earlier version
 * approximated this and came in a few inches short, so tables placed
 * edge-to-edge tripped clearance warnings immediately — caught via live
 * browser verification.) Cache per equipment id since it only depends on
 * the item, not where it ends up.
 */
const footprintRadiusCache = new Map<string, number>();
function getFootprintRadius(item: EquipmentItem, getEquipment: (id: string) => EquipmentItem): number {
  const cached = footprintRadiusCache.get(item.id);
  if (cached !== undefined) return cached;

  const instance = instantiateEquipment(item.id, 0, 0, getEquipment);
  const unit = instance.find((o) => !o.parentObjectId)!;
  const children = instance.filter((o) => o.parentObjectId);
  const center = { x: 0, y: 0 };

  const radius = Math.max(
    farthestPointDistance(toShape(unit, item), center),
    ...children.map((c) => farthestPointDistance(toShape(c, getEquipment(c.equipmentItemId)), center)),
    0
  ) + item.clearanceIn;

  footprintRadiusCache.set(item.id, radius);
  return radius;
}

/** Scans a coarse grid for the first open spot whose footprint doesn't overlap anything already placed. */
function findOpenSpot(
  radius: number,
  roomWidthIn: number,
  roomLengthIn: number,
  occupied: FootprintCircle[]
): { x: number; y: number } | null {
  for (let y = MARGIN_IN + radius; y <= roomLengthIn - MARGIN_IN - radius; y += GRID_STEP_IN) {
    for (let x = MARGIN_IN + radius; x <= roomWidthIn - MARGIN_IN - radius; x += GRID_STEP_IN) {
      const candidate: FootprintCircle = { cx: x, cy: y, radius };
      const collides = occupied.some((o) => circleVsCircle(candidate, o));
      if (!collides) return { x, y };
    }
  }
  return null;
}

function safeGetEquipment(getEquipment: (id: string) => EquipmentItem, id: string): EquipmentItem | null {
  try {
    return getEquipment(id);
  } catch {
    return null;
  }
}

/**
 * Turns a validated StructuredLayoutRequest into actual LayoutObjects, using
 * the same instantiateEquipment() the manual "Add Equipment" toolbar uses —
 * so AI-created layouts get identical chair placement and go through
 * identical live collision/clearance validation as hand-built ones, per the
 * architecture doc's core principle. The AI itself never sees or produces
 * coordinates; this function is the only thing that computes positions, and
 * it does so by scanning for open (footprint-aware) space rather than
 * trusting anything spatial from the model.
 */
export function executeStructuredRequest(
  request: StructuredLayoutRequest,
  existingObjects: LayoutObject[],
  getEquipment: (id: string) => EquipmentItem,
  room: { widthFt: number; lengthFt: number }
): ExecuteResult {
  let objects = [...existingObjects];
  const changeSummary: string[] = [];
  const roomWidthIn = room.widthFt * 12;
  const roomLengthIn = room.lengthFt * 12;

  for (const op of request.operations) {
    if (op.op === "clear") {
      const count = objects.filter((o) => !o.parentObjectId).length;
      changeSummary.push(`Removed all ${count} placed item${count === 1 ? "" : "s"}.`);
      objects = [];
    } else if (op.op === "removeAllOfType") {
      const item = safeGetEquipment(getEquipment, op.equipmentItemId);
      const toRemoveIds = new Set(
        objects.filter((o) => o.equipmentItemId === op.equipmentItemId && !o.parentObjectId).map((o) => o.id)
      );
      const removedCount = toRemoveIds.size;
      objects = objects.filter((o) => !toRemoveIds.has(o.id) && !(o.parentObjectId && toRemoveIds.has(o.parentObjectId)));
      changeSummary.push(`Removed ${removedCount} ${item?.name ?? op.equipmentItemId}.`);
    } else if (op.op === "remove") {
      const target = objects.find((o) => o.id === op.objectId && !o.parentObjectId);
      if (target) {
        objects = objects.filter((o) => o.id !== op.objectId && o.parentObjectId !== op.objectId);
        changeSummary.push(`Removed 1 ${target.label ?? target.equipmentItemId}.`);
      } else {
        changeSummary.push(`Couldn't find an object with id "${op.objectId}" to remove — skipped.`);
      }
    } else if (op.op === "add") {
      const item = safeGetEquipment(getEquipment, op.equipmentItemId);
      if (!item) {
        changeSummary.push(`Unknown equipment id "${op.equipmentItemId}" — skipped.`);
        continue;
      }
      let placedCount = 0;
      for (let i = 0; i < op.count; i++) {
        const occupied: FootprintCircle[] = objects
          .filter((o) => !o.parentObjectId)
          .map((o) => {
            const equip = getEquipment(o.equipmentItemId);
            return { cx: o.x, cy: o.y, radius: getFootprintRadius(equip, getEquipment) };
          });
        const spot = findOpenSpot(getFootprintRadius(item, getEquipment), roomWidthIn, roomLengthIn, occupied);
        if (!spot) {
          changeSummary.push(`Ran out of open space for more ${item.name} — placed ${placedCount} of ${op.count} requested.`);
          break;
        }
        const newObjects = instantiateEquipment(item.id, spot.x, spot.y, getEquipment);
        objects = [...objects, ...newObjects];
        placedCount++;
      }
      if (placedCount === op.count) {
        changeSummary.push(`Added ${placedCount} ${item.name}.`);
      }
    }
  }

  return { objects, changeSummary };
}
