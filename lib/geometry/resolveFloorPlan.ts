import { RoomBoundaryPoint } from "@/lib/geometry/types";

/** Normalized (0..1) -> background-image pixel space. */
export function normToPx(
  pointNorm: { x: number; y: number },
  widthPx: number,
  heightPx: number
): { x: number; y: number } {
  return { x: pointNorm.x * widthPx, y: pointNorm.y * heightPx };
}

/** Background-image pixel space -> real-world inches, given resolved pxPerInch. */
export function pxToInchPoint(pointPx: { x: number; y: number }, pxPerInch: number): RoomBoundaryPoint {
  return { x: pointPx.x / pxPerInch, y: pointPx.y / pxPerInch };
}

/**
 * Composite convenience: normalized (0..1) proposal coordinates straight to
 * real-world inches, given the background image's pixel dimensions and the
 * resolved pxPerInch. Just normToPx followed by pxToInchPoint, but the
 * review wizard does this so often (every boundary vertex, every obstacle
 * corner) that spelling out both calls at every call site adds noise
 * without adding clarity.
 */
export function normToInchPoint(
  pointNorm: { x: number; y: number },
  widthPx: number,
  heightPx: number,
  pxPerInch: number
): RoomBoundaryPoint {
  return pxToInchPoint(normToPx(pointNorm, widthPx, heightPx), pxPerInch);
}

/**
 * A single (non-negative) length, normalized 0..1 as a fraction of some
 * reference pixel axis, to inches. Per lib/ai/parseFloorPlan.ts's tool
 * schema: widthNorm and diameterNorm are fractions of image WIDTH,
 * lengthNorm is a fraction of image HEIGHT — pass the matching axis's px
 * value (widthPx or heightPx) as `axisPx`.
 */
export function normLengthToInches(lengthNorm: number, axisPx: number, pxPerInch: number): number {
  return (lengthNorm * axisPx) / pxPerInch;
}
