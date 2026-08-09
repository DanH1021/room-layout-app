import { describe, it, expect } from "vitest";
import { snapVertexToNeighbors } from "@/lib/geometry/snapVertex";

describe("snapVertexToNeighbors", () => {
  it("snaps a vertex whose segment to a neighbor is nearly horizontal", () => {
    // Rectangle-ish polygon where the dragged vertex (index 1) is slightly
    // off from being level with its previous neighbor (index 0): dy=3 over
    // dx=200 -> ~0.86 degrees off horizontal, well within the 4deg threshold.
    const points = [
      { x: 0, y: 100 },
      { x: 200, y: 103 },
      { x: 200, y: 300 },
      { x: 0, y: 300 },
    ];
    const result = snapVertexToNeighbors(points, 1);
    // Snapped toward the horizontal neighbor (index 0): y matches neighbor's y.
    expect(result[1].y).toBe(100);
    // x (the non-corrected axis) stays at the user's drop position.
    expect(result[1].x).toBe(200);
    // Other points untouched.
    expect(result[0]).toEqual(points[0]);
    expect(result[2]).toEqual(points[2]);
    expect(result[3]).toEqual(points[3]);
  });

  it("snaps a vertex whose segment to a neighbor is nearly vertical", () => {
    // Dragged vertex (index 2) is slightly off from being vertically aligned
    // with its previous neighbor (index 1): dx=3 over dy=195 -> ~0.88deg off
    // vertical. Its segment to the next neighbor (index 3) is far from axis
    // (~26deg off) so only the x axis should snap.
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 5 },
      { x: 203, y: 200 },
      { x: 0, y: 300 },
    ];
    const result = snapVertexToNeighbors(points, 2);
    expect(result[2].x).toBe(200); // snapped to match neighbor (index 1) x
    expect(result[2].y).toBe(200); // unaffected axis stays put
  });

  it("snaps both axes when both neighbors independently qualify", () => {
    // Dragged vertex (index 1) sits between a near-horizontal neighbor
    // (index 0) and a near-vertical neighbor (index 2).
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 2 }, // ~0.57deg off horizontal from (0,0)
      { x: 198, y: 200 }, // ~0.57deg off vertical from (200,2)
    ];
    const result = snapVertexToNeighbors(points, 1);
    expect(result[1].y).toBe(0); // snapped horizontal to neighbor 0
    expect(result[1].x).toBe(198); // snapped vertical to neighbor 2
  });

  it("does not snap a deliberately angled (diagonal) corner", () => {
    // A 45-degree diagonal wall — well outside the 4deg threshold on both
    // neighbor segments.
    const points = [
      { x: 0, y: 0 },
      { x: 200, y: 200 }, // exactly 45deg from (0,0): far from both axes
      { x: 400, y: 0 },
    ];
    const result = snapVertexToNeighbors(points, 1);
    expect(result[1]).toEqual(points[1]);
    expect(result).toEqual(points);
  });

  it("prefers the neighbor closer to perfectly straight when both would constrain the same axis", () => {
    // Both neighbors are near-horizontal relative to the dragged vertex, so
    // both would want to set y — the closer-to-straight one should win.
    const points = [
      { x: 0, y: 100 }, // ~1.15deg off horizontal to dragged vertex
      { x: 200, y: 102 }, // dragged vertex
      { x: 400, y: 102.3 }, // ~0.086deg off horizontal to dragged vertex (much closer to straight)
    ];
    const result = snapVertexToNeighbors(points, 1);
    // Should snap to the y of whichever neighbor is closer to perfectly straight (index 2).
    expect(result[1].y).toBe(102.3);
  });

  it("returns points unchanged for a degenerate index or too-small polygon", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(snapVertexToNeighbors(points, 0)).toBe(points);
    expect(snapVertexToNeighbors(points, -1)).toBe(points);
  });
});
