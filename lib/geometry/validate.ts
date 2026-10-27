import { EquipmentItem, LayoutObject, Obstacle, RoomBoundaryPoint } from "@/lib/geometry/types";
import { Shape, rectCorners, shapesOverlap } from "@/lib/geometry/collision";
import { shapeFullyInRoom } from "@/lib/geometry/room";

// "clearance_conflict" is no longer produced (see validateLayout below, per
// Dan's request to drop the "too close for guest access" warning entirely)
// but stays in the union so any already-persisted LayoutIssue rows of that
// type still type-check wherever this type is read back from the DB.
export type IssueType = "collision" | "clearance_conflict" | "room_boundary" | "obstacle_collision";
export type IssueSeverity = "error" | "warning";

export interface LayoutIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  description: string;
  objectIds: string[];
}

/**
 * Converts a placed LayoutObject into the geometry module's Shape
 * representation, using the object's own stored dimensions and falling back
 * to its equipment definition.
 */
export function toShape(object: LayoutObject, item: EquipmentItem): Shape {
  if (object.shape === "circle") {
    return {
      kind: "circle",
      cx: object.x,
      cy: object.y,
      radius: (object.diameterIn ?? item.diameterIn ?? 24) / 2,
    };
  }
  return {
    kind: "rect",
    cx: object.x,
    cy: object.y,
    width: object.widthIn ?? item.widthIn ?? 18,
    height: object.lengthIn ?? item.lengthIn ?? 18,
    rotation: object.rotation,
  };
}

export function farthestPointDistance(shape: Shape, from: { x: number; y: number }): number {
  if (shape.kind === "circle") {
    return Math.hypot(shape.cx - from.x, shape.cy - from.y) + shape.radius;
  }
  const points = shape.kind === "polygon" ? shape.points : rectCorners(shape);
  return Math.max(...points.map((c) => Math.hypot(c.x - from.x, c.y - from.y)));
}

interface Unit {
  object: LayoutObject;
  item: EquipmentItem;
  /** The bare table/equipment shape — used for hard collisions and room-boundary checks. */
  bareShape: Shape;
}

/**
 * Authoritative layout validation: runs identically client-side (live drag
 * feedback) and server-side (pre-save gate).
 *
 * This intentionally does NOT flag tables/chairs that are merely close
 * together (no "clearance warning") — only real physical overlaps (hard
 * collisions), objects extending past the room boundary, and obstacle
 * collisions are reported. Per Dan's request, the softer "too close for
 * guest access" footprint-clearance check this used to run was removed
 * entirely rather than just hidden, since sales staff intentionally pack
 * tables tighter than the clearance allowance in real layouts and the
 * warning was just noise.
 */
export function validateLayout(
  units: { object: LayoutObject; item: EquipmentItem; children?: { object: LayoutObject; item: EquipmentItem }[] }[],
  boundary: RoomBoundaryPoint[],
  obstacles: Obstacle[] = []
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  const resolved: Unit[] = units.map((u) => ({
    object: u.object,
    item: u.item,
    bareShape: toShape(u.object, u.item),
  }));

  for (let i = 0; i < resolved.length; i++) {
    const a = resolved[i];
    if (!shapeFullyInRoom(a.bareShape, boundary)) {
      issues.push({
        id: `room-${a.object.id}`,
        type: "room_boundary",
        severity: "error",
        description: `${a.item.name} extends outside the room boundary.`,
        objectIds: [a.object.id],
      });
    }

    for (const obstacle of obstacles) {
      if (obstacle.blocksPlacement === false) continue;
      if (shapesOverlap(a.bareShape, obstacle.shape)) {
        issues.push({
          id: `obstacle-${a.object.id}-${obstacle.id}`,
          type: "obstacle_collision",
          severity: "error",
          description: `${a.item.name} overlaps ${obstacle.name}.`,
          objectIds: [a.object.id],
        });
      }
    }

    for (let j = i + 1; j < resolved.length; j++) {
      const b = resolved[j];

      if (shapesOverlap(a.bareShape, b.bareShape)) {
        issues.push({
          id: `collision-${a.object.id}-${b.object.id}`,
          type: "collision",
          severity: "error",
          description: `${a.item.name} overlaps ${b.item.name}.`,
          objectIds: [a.object.id, b.object.id],
        });
      }
    }
  }

  return issues;
}
