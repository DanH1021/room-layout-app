import { describe, it, expect } from "vitest";
import { proposedFloorPlanSchema } from "@/lib/schemas/floorPlan";

describe("proposedFloorPlanSchema", () => {
  it("accepts a well-formed proposal with mixed obstacle shapes", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.9, y: 0.9 },
        { x: 0.1, y: 0.9 },
      ],
      obstacles: [
        { type: "column", shape: "circle", x: 0.5, y: 0.5, diameterNorm: 0.02 },
        { type: "permanent_bar", shape: "rect", x: 0.2, y: 0.3, widthNorm: 0.1, lengthNorm: 0.05, rotation: 90 },
        {
          type: "bump_out",
          shape: "polygon",
          polygonPointsNorm: [
            { x: 0.1, y: 0.1 },
            { x: 0.15, y: 0.1 },
            { x: 0.15, y: 0.15 },
          ],
        },
      ],
      scaleNote: { found: true, confidence: "high", rawText: '1/16" = 1\'-0"', drawnInchesPerRealFoot: 0.0625 },
      notes: "Bottom-left corner is slightly illegible.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a proposal with only a bare scaleNote (not found)", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [],
      scaleNote: { found: false, confidence: "none" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a proposal missing scaleNote entirely", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a boundary with fewer than 3 points", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [],
      scaleNote: { found: false, confidence: "none" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a rect obstacle missing widthNorm/lengthNorm", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [{ type: "column", shape: "rect", x: 0.5, y: 0.5 }],
      scaleNote: { found: false, confidence: "none" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a circle obstacle missing diameterNorm", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [{ type: "column", shape: "circle", x: 0.5, y: 0.5 }],
      scaleNote: { found: false, confidence: "none" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a polygon obstacle with fewer than 3 points", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [
        {
          type: "bump_out",
          shape: "polygon",
          polygonPointsNorm: [
            { x: 0.1, y: 0.1 },
            { x: 0.15, y: 0.1 },
          ],
        },
      ],
      scaleNote: { found: false, confidence: "none" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a scaleNote confidence outside the enum", () => {
    const result = proposedFloorPlanSchema.safeParse({
      boundaryPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      obstacles: [],
      scaleNote: { found: true, confidence: "certain" },
    });
    expect(result.success).toBe(false);
  });
});
