import { EquipmentItem, LayoutObject, Obstacle, RoomBoundaryPoint } from "@/lib/geometry/types";
import { CircleShape, Shape, circleVsCircle, rectCorners, shapesOverlap } from "@/lib/geometry/collision";
import { shapeFullyInRoom } from "@/lib/geometry/room";

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
  /**
   * A bounding circle around the whole unit — the table plus every chair
   * attached to it, plus its equipment clearance allowance — used for the
   * softer "too close for guest access" warning. A hard-collision check on
   * the bare table alone would miss two tables' *chairs* overlapping while
   * the tables themselves stay apart, which is the case that actually
   * matters to a floor planner.
   */
  footprint: CircleShape;
}

/**
 * Authoritative layout validation: runs identically client-side (live drag
 * feedback) and server-side (pre-save gate).
 */
export function validateLayout(
  units: { object: LayoutObject; item: EquipmentItem; children?: { object: LayoutObject; item: EquipmentItem }[] }[],
  boundary: RoomBoundaryPoint[],
  obstacles: Obstacle[] = []
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  const resolved: Unit[] = units.map((u) => {
    const bareShape = toShape(u.object, u.item);
    const center = { x: u.object.x, y: u.object.y };

    // Child chairs store (x, y, rotation) RELATIVE to their parent table's
    // own local origin (see lib/geometry/placement.ts) — that's what lets
    // Konva's Group transform move/rotate them together with the table for
    // free. Convert each child into absolute room coordinates (applying the
    // parent's own rotation) before measuring its distance from the unit
    // center, or this wildly overestimates the footprint.
    const parentRotRad = (u.object.rotation * Math.PI) / 180;
    const cos = Math.cos(parentRotRad);
    const sin = Math.sin(parentRotRad);
    const childShapes = (u.children ?? []).map((c) => {
      const absoluteChild: LayoutObject = {
        ...c.object,
        x: u.object.x + c.object.x * cos - c.object.y * sin,
        y: u.object.y + c.object.x * sin + c.object.y * cos,
        rotation: c.object.rotation + u.object.rotation,
      };
      return toShape(absoluteChild, c.item);
    });
    const footprintRadius = Math.max(
      farthestPointDistance(bareShape, center),
      ...childShapes.map((s) => farthestPointDistance(s, center)),
      0
    );
    return {
      object: u.object,
      item: u.item,
      bareShape,
      footprint: { kind: "circle", cx: center.x, cy: center.y, radius: footprintRadius + u.item.clearanceIn },
    };
  });

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
        continue; // a hard collision supersedes a clearance warning for this pair
      }

      if (circleVsCircle(a.footprint, b.footprint)) {
        issues.push({
          id: `clearance-${a.object.id}-${b.object.id}`,
          type: "clearance_conflict",
          severity: "warning",
          description: `${a.item.name} is too close to ${b.item.name} — chairs or aisle clearance may overlap.`,
          objectIds: [a.object.id, b.object.id],
        });
      }
    }
  }

  return issues;
}
