import { RoomBoundaryPoint } from "@/lib/geometry/types";
import { Shape } from "@/lib/geometry/collision";
import { rectCorners } from "@/lib/geometry/collision";

/** Standard ray-casting point-in-polygon test. Boundary must be a closed (or implicitly-closed) polygon. */
export function pointInRoom(point: { x: number; y: number }, boundary: RoomBoundaryPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const xi = boundary[i].x;
    const yi = boundary[i].y;
    const xj = boundary[j].x;
    const yj = boundary[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks whether a shape is fully within the room boundary. Samples the
 * shape's corners (rect) or 8 perimeter points + center (circle) — an exact
 * closed-form circle-vs-polygon containment test isn't needed since MVP room
 * boundaries are simple convex rectangles.
 */
export function shapeFullyInRoom(shape: Shape, boundary: RoomBoundaryPoint[]): boolean {
  if (shape.kind === "rect") {
    return rectCorners(shape).every((c) => pointInRoom(c, boundary));
  }
  const samples: { x: number; y: number }[] = [{ x: shape.cx, y: shape.cy }];
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    samples.push({
      x: shape.cx + shape.radius * Math.cos(angle),
      y: shape.cy + shape.radius * Math.sin(angle),
    });
  }
  return samples.every((p) => pointInRoom(p, boundary));
}
