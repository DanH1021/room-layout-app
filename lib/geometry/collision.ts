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

/**
 * Standard segment-segment intersection test (excluding shared-endpoint
 * touches, which are expected between adjacent polygon edges and must not
 * count as a self-intersection).
 */
function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  function orientation(a: Vec2, b: Vec2, c: Vec2): number {
    const val = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : -1;
  }
  function onSegment(a: Vec2, b: Vec2, c: Vec2): boolean {
    // c is known to be collinear with a-b; check it falls within the segment's bbox.
    return (
      Math.min(a.x, b.x) - 1e-9 <= c.x &&
      c.x <= Math.max(a.x, b.x) + 1e-9 &&
      Math.min(a.y, b.y) - 1e-9 <= c.y &&
      c.y <= Math.max(a.y, b.y) + 1e-9
    );
  }

  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);

  if (o1 !== o2 && o3 !== o4) return true;

  // Collinear special cases: segments overlap along the same line.
  if (o1 === 0 && onSegment(p1, p2, p3)) return true;
  if (o2 === 0 && onSegment(p1, p2, p4)) return true;
  if (o3 === 0 && onSegment(p3, p4, p1)) return true;
  if (o4 === 0 && onSegment(p3, p4, p2)) return true;

  return false;
}

/**
 * Checks whether a closed polygon is "simple" — i.e. none of its edges cross
 * each other. Concave (non-convex) polygons are fine and expected (e.g. an
 * L-shaped traced room); this only rejects self-intersecting shapes like a
 * bowtie/figure-8, where a corner got dragged across another edge while
 * tracing. O(n^2) edge-pair comparison, which is fine for the small vertex
 * counts room boundaries have (capped at 60 points).
 */
export function isSimplePolygon(points: { x: number; y: number }[]): boolean {
  const n = points.length;
  if (n < 3) return false;

  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip the edge itself and edges adjacent to it (they share an
      // endpoint by construction, which isn't a self-intersection).
      // Edges sharing an endpoint (the next edge in the loop, or the
      // wraparound pair edge[0]/edge[n-1]) are adjacent by construction and
      // must not be flagged as an intersection.
      const isAdjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (isAdjacent) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
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
