import { describe, it, expect } from "vitest";
import { pxPerInchFromScaleNote, pxPerInchFromCalibrationLine } from "@/lib/geometry/scaleCalibration";

describe("pxPerInchFromScaleNote", () => {
  it("computes px/inch for a 1/16\" = 1'-0\" scale note at 150 DPI", () => {
    // dpi * drawnInchesPerRealFoot / 12 = 150 * 0.0625 / 12
    const pxPerInch = pxPerInchFromScaleNote(0.0625, 150);
    expect(pxPerInch).toBeCloseTo(0.78125, 6);

    // Sanity check against the sample floor plan's known ~59ft-wide open
    // floor: a boundary that's 59ft (708in) wide should rasterize to a
    // plausible pixel width for a page-sized PDF raster, not something
    // absurd like 10px or 100,000px.
    const plausibleWidthPx = 59 * 12 * pxPerInch;
    expect(plausibleWidthPx).toBeGreaterThan(400);
    expect(plausibleWidthPx).toBeLessThan(700);
  });

  it("computes px/inch for a 1/8\" = 1'-0\" scale note (double scale) at 150 DPI", () => {
    const pxPerInch = pxPerInchFromScaleNote(0.125, 150);
    expect(pxPerInch).toBeCloseTo(1.5625, 6);
    // Doubling drawnInchesPerRealFoot should double pxPerInch.
    expect(pxPerInch).toBeCloseTo(2 * pxPerInchFromScaleNote(0.0625, 150), 6);
  });

  it("defaults dpi to RASTER_DPI when not provided", () => {
    const withDefault = pxPerInchFromScaleNote(0.0625);
    const withExplicit = pxPerInchFromScaleNote(0.0625, 150);
    expect(withDefault).toBeCloseTo(withExplicit, 10);
  });
});

describe("pxPerInchFromCalibrationLine", () => {
  it("computes px/inch from a horizontal calibration line", () => {
    // 300px representing 10ft (120in) -> 2.5 px/inch.
    const pxPerInch = pxPerInchFromCalibrationLine({ x: 0, y: 0 }, { x: 300, y: 0 }, 120);
    expect(pxPerInch).toBeCloseTo(2.5, 6);
  });

  it("computes px/inch from a diagonal calibration line using Euclidean distance", () => {
    // 3-4-5 triangle scaled by 20 -> distance 100px representing 50in.
    const pxPerInch = pxPerInchFromCalibrationLine({ x: 0, y: 0 }, { x: 60, y: 80 }, 50);
    expect(pxPerInch).toBeCloseTo(2, 6);
  });
});
