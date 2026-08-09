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

export type Shape =
  | ({ kind: "rect" } & RectShape)
  | ({ kind: "circle" } & CircleShape);

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
  const cornersA = rectCorners(a);
  const cornersB = rectCorners(b);

  // SAT normally tests axes perpendicular to each edge. For a rectangle the
  // two adjacent edge directions are already mutually perpendicular, so
  // using the edge vectors themselves as axes is equivalent and simpler.
  const axes: Vec2[] = [
    normalize({ x: cornersA[1].x - cornersA[0].x, y: cornersA[1].y - cornersA[0].y }),
    normalize({ x: cornersA[3].x - cornersA[0].x, y: cornersA[3].y - cornersA[0].y }),
    normalize({ x: cornersB[1].x - cornersB[0].x, y: cornersB[1].y - cornersB[0].y }),
    normalize({ x: cornersB[3].x - cornersB[0].x, y: cornersB[3].y - cornersB[0].y }),
  ];

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

/** Dispatches to the correct pairwise test based on shape kind. */
export function shapesOverlap(a: Shape, b: Shape): boolean {
  if (a.kind === "rect" && b.kind === "rect") return rectVsRect(a, b);
  if (a.kind === "circle" && b.kind === "circle") return circleVsCircle(a, b);
  if (a.kind === "circle" && b.kind === "rect") return circleVsRect(a, b);
  if (a.kind === "rect" && b.kind === "circle") return circleVsRect(b, a);
  return false;
}
