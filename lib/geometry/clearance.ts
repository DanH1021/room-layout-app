import { CircleShape, RectShape, Shape } from "@/lib/geometry/collision";

/**
 * Returns an inflated copy of a shape's boundary, padded outward by
 * `inches` on every side. Used to check "does this object's required
 * clearance zone overlap something else" as a *softer* signal than a hard
 * physical collision — callers should treat clearance overlaps as warnings,
 * not errors, per the architecture doc's Section 2.
 */
export function withClearance(shape: Shape, inches: number): Shape {
  if (inches <= 0) return shape;
  if (shape.kind === "circle") {
    const c = shape as { kind: "circle" } & CircleShape;
    return { ...c, radius: c.radius + inches };
  }
  const r = shape as { kind: "rect" } & RectShape;
  return { ...r, width: r.width + inches * 2, height: r.height + inches * 2 };
}
