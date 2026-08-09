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

/** Plain min/max bounding box over a set of polygon points. */
export function polygonBoundingBox(points: { x: number; y: number }[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Checks whether a shape is fully within the room boundary. Samples the
 * shape's corners (rect), 8 perimeter points + center (circle), or every
 * vertex (polygon) — an exact closed-form circle-vs-polygon containment
 * test isn't needed since MVP room boundaries are simple convex rectangles.
 */
export function shapeFullyInRoom(shape: Shape, boundary: RoomBoundaryPoint[]): boolean {
  if (shape.kind === "rect") {
    return rectCorners(shape).every((c) => pointInRoom(c, boundary));
  }
  if (shape.kind === "polygon") {
    return shape.points.every((p) => pointInRoom(p, boundary));
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
