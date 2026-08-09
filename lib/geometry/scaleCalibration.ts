import { RASTER_DPI } from "@/lib/pdf/rasterizePlan";

/**
 * Only valid for PDF uploads rasterized at RASTER_DPI — a scale note gives
 * drawn-inches-per-real-foot (e.g. 1/16"=1'-0" -> 0.0625); px/inch of the
 * RASTERIZED image follows directly since we control the rasterization DPI.
 * Never call this for plain image uploads (photos/screenshots) — they carry
 * no reliable page-to-pixel ratio even if a scale note is visible in the
 * image content.
 */
export function pxPerInchFromScaleNote(
  drawnInchesPerRealFoot: number,
  dpi: number = RASTER_DPI
): number {
  // px per drawn inch = dpi. drawn inches per real inch = drawnInchesPerRealFoot / 12.
  return (dpi * drawnInchesPerRealFoot) / 12;
}

/** Manual calibration: user clicks two points (in background-image pixel space) a known real-world distance apart. */
export function pxPerInchFromCalibrationLine(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  realWorldInches: number
): number {
  const pixelDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return pixelDistance / realWorldInches;
}
