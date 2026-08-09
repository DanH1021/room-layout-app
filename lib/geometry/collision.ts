// Pure, framework-free collision primitives. No React/Konva/DB imports here —
// this module must run identically in the browser (live drag feedback) and
// on the server (authoritative pre-save validation), per the architecture
// doc's Section 2.

export interface RectShape {
  cx: number; // center x, inches
  cy: number; // center y, inches
  width: number; // inches (local x-axis extent before rotation)
  height: number; // inches (local y-axis extent before rotation)
  rotation: number; // degrees
}

export interface CircleShape {
  cx: number;
  cy: number;
  radius: number;
}

export interface PolygonShape {
  points: { x: number; y: number }[]; // absolute inches, must be convex
}

export type Shape =
  | ({ kind: "rect" } & RectShape)
  | ({ kind: "circle" } & CircleShape)
  | ({ kind: "polygon" } & PolygonShape);

interface Vec2 {
  x: number;
  y: number;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** The 4 corners of a rectangle, accounting for rotation about its center. */
export function rectCorners(r: RectShape): Vec2[] {
  const hw = r.width / 2;
  const hh = r.height / 2;
  const rad = degToRad(r.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => ({
    x: r.cx + p.x * cos - p.y * sin,
    y: r.cy + p.x * sin + p.y * cos,
  }));
}

function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function projectOntoAxis(corners: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of corners) {
    const p = dot(c, axis);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

/**
 * Rectangle-vs-rectangle overlap test using the Separating Axis Theorem.
 * Correctly handles arbitrary rotation on either rectangle. Returns true if
 * the two rectangles overlap (touching edges with zero overlap count as no
 * collision).
 */
export function rectVsRect(a: RectShape, b: RectShape): boolean {
  return convexPolygonVsConvexPolygon(rectCorners(a), rectCorners(b));
}

/**
 * General convex-polygon-vs-convex-polygon overlap test using the
 * Separating Axis Theorem. Builds one axis per edge of each polygon (the
 * normalized edge vector itself — equivalent to using the edge normal for
 * SAT purposes since the axis set is the same up to a 90-degree rotation).
 * Returns false as soon as a separating axis is found; true if none exists.
 */
export function convexPolygonVsConvexPolygon(cornersA: Vec2[], cornersB: Vec2[]): boolean {
  const axes: Vec2[] = [];
  for (const corners of [cornersA, cornersB]) {
    for (let i = 0; i < corners.length; i++) {
      const next = corners[(i + 1) % corners.length];
      const cur = corners[i];
      axes.push(normalize({ x: next.x - cur.x, y: next.y - cur.y }));
    }
  }

  for (const axis of axes) {
    const pa = projectOntoAxis(cornersA, axis);
    const pb = projectOntoAxis(cornersB, axis);
    if (pa.max <= pb.min || pb.max <= pa.min) {
      return false; // separating axis found -> no collision
    }
  }
  return true;
}

export function circleVsCircle(a: CircleShape, b: CircleShape): boolean {
  const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  return dist < a.radius + b.radius;
}

/** Closest-point distance test between a circle and a (possibly rotated) rectangle. */
export function circleVsRect(circle: CircleShape, rect: RectShape): boolean {
  const rad = degToRad(-rect.rotation);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Transform circle center into the rectangle's local (unrotated) space.
  const dx = circle.cx - rect.cx;
  const dy = circle.cy - rect.cy;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const clampedX = Math.max(-hw, Math.min(hw, localX));
  const clampedY = Math.max(-hh, Math.min(hh, localY));

  const closestDist = Math.hypot(localX - clampedX, localY - clampedY);
  return closestDist < circle.radius;
}

/**
 * SAT-based circle-vs-convex-polygon overlap test. Axes are each polygon
 * edge's normal, plus the axis from the circle's center to its nearest
 * polygon vertex (needed to correctly separate a circle from a polygon
 * corner that no edge normal alone would catch).
 */
export function circleVsConvexPolygon(circle: CircleShape, points: Vec2[]): boolean {
  const axes: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const edge = { x: next.x - cur.x, y: next.y - cur.y };
    axes.push(normalize({ x: -edge.y, y: edge.x }));
  }

  let nearest = points[0];
  let nearestDist = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - circle.cx, p.y - circle.cy);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = p;
    }
  }
  axes.push(normalize({ x: nearest.x - circle.cx, y: nearest.y - circle.cy }));

  for (const axis of axes) {
    const poly = projectOntoAxis(points, axis);
    const centerProj = dot({ x: circle.cx, y: circle.cy }, axis);
    const circleMin = centerProj - circle.radius;
    const circleMax = centerProj + circle.radius;
    if (poly.max <= circleMin || circleMax <= poly.min) {
      return false; // separating axis found -> no collision
    }
  }
  return true;
}

/**
 * Checks whether a set of points forms a convex polygon by verifying the
 * cross product of consecutive edge vectors keeps a consistent sign all the
 * way around (works for either winding order). Returns false for
 * degenerate (fewer than 3 points) or concave polygons (e.g. an L-shape).
 */
export function isConvexPolygon(points: { x: number; y: number }[]): boolean {
  if (points.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      const curSign = cross > 0 ? 1 : -1;
      if (sign === 0) {
        sign = curSign;
      } else if (curSign !== sign) {
        return false;
      }
    }
  }
  return true;
}

/** Dispatches to the correct pairwise test based on shape kind. */
export function shapesOverlap(a: Shape, b: Shape): boolean {
  if (a.kind === "rect" && b.kind === "rect") return rectVsRect(a, b);
  if (a.kind === "circle" && b.kind === "circle") return circleVsCircle(a, b);
  if (a.kind === "circle" && b.kind === "rect") return circleVsRect(a, b);
  if (a.kind === "rect" && b.kind === "circle") return circleVsRect(b, a);
  if (a.kind === "polygon" && b.kind === "polygon") return convexPolygonVsConvexPolygon(a.points, b.points);
  if (a.kind === "circle" && b.kind === "polygon") return circleVsConvexPolygon(a, b.points);
  if (a.kind === "polygon" && b.kind === "circle") return circleVsConvexPolygon(b, a.points);
  if (a.kind === "rect" && b.kind === "polygon") return convexPolygonVsConvexPolygon(rectCorners(a), b.points);
  if (a.kind === "polygon" && b.kind === "rect") return convexPolygonVsConvexPolygon(rectCorners(b), a.points);
  return false;
}
