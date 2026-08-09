import { describe, it, expect } from "vitest";
import { rectVsRect, circleVsCircle, circleVsRect, RectShape } from "@/lib/geometry/collision";
import { withClearance } from "@/lib/geometry/clearance";
import { pointInRoom, shapeFullyInRoom } from "@/lib/geometry/room";

describe("rectVsRect", () => {
  it("detects overlap between two axis-aligned overlapping rects", () => {
    const a: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 0 };
    const b: RectShape = { cx: 5, cy: 5, width: 10, height: 10, rotation: 0 };
    expect(rectVsRect(a, b)).toBe(true);
  });

  it("returns false for two rects far apart", () => {
    const a: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 0 };
    const b: RectShape = { cx: 100, cy: 100, width: 10, height: 10, rotation: 0 };
    expect(rectVsRect(a, b)).toBe(false);
  });

  it("treats exactly-touching edges as non-colliding", () => {
    const a: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 0 };
    const b: RectShape = { cx: 10, cy: 0, width: 10, height: 10, rotation: 0 };
    expect(rectVsRect(a, b)).toBe(false);
  });

  it("detects overlap of a 45-degree-rotated rect (diamond) whose vertex pokes into a nearby rect", () => {
    // A 10x10 square rotated 45deg becomes a diamond with vertices at
    // distance ~7.07 from center along the axes (e.g. (7.07, 0)). b sits
    // just past that vertex on the x-axis, straddling it.
    const a: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 45 };
    const b: RectShape = { cx: 6, cy: 0, width: 4, height: 4, rotation: 0 };
    expect(rectVsRect(a, b)).toBe(true);
  });

  it("correctly separates two rotated rects that don't actually overlap", () => {
    const a: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 45 };
    const b: RectShape = { cx: 20, cy: 20, width: 4, height: 4, rotation: 30 };
    expect(rectVsRect(a, b)).toBe(false);
  });
});

describe("circleVsCircle", () => {
  it("detects overlapping circles", () => {
    expect(circleVsCircle({ cx: 0, cy: 0, radius: 5 }, { cx: 8, cy: 0, radius: 5 })).toBe(true);
  });
  it("detects non-overlapping circles", () => {
    expect(circleVsCircle({ cx: 0, cy: 0, radius: 5 }, { cx: 20, cy: 0, radius: 5 })).toBe(false);
  });
});

describe("circleVsRect", () => {
  it("detects a circle overlapping an axis-aligned rect", () => {
    const rect: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 0 };
    expect(circleVsRect({ cx: 8, cy: 0, radius: 5 }, rect)).toBe(true);
  });
  it("detects no overlap when circle is well clear of the rect", () => {
    const rect: RectShape = { cx: 0, cy: 0, width: 10, height: 10, rotation: 0 };
    expect(circleVsRect({ cx: 50, cy: 50, radius: 5 }, rect)).toBe(false);
  });
  it("accounts for rotation of the rect", () => {
    // A long, thin rect (half-length 10) rotated 45deg points its far end
    // toward (7.07, 7.07); a circle centered near that tip overlaps it even
    // though the *unrotated* rect wouldn't reach anywhere near there.
    const rect: RectShape = { cx: 0, cy: 0, width: 20, height: 2, rotation: 45 };
    const circle = { cx: 8, cy: 8, radius: 2 };
    expect(circleVsRect(circle, rect)).toBe(true);
    // Sanity check: the same circle does NOT overlap the unrotated rect,
    // proving this test actually exercises the rotation math.
    const unrotated: RectShape = { ...rect, rotation: 0 };
    expect(circleVsRect(circle, unrotated)).toBe(false);
  });
});

describe("withClearance", () => {
  it("inflates a circle's radius", () => {
    const inflated = withClearance({ kind: "circle", cx: 0, cy: 0, radius: 10 }, 5);
    expect(inflated).toMatchObject({ kind: "circle", radius: 15 });
  });
  it("inflates a rect's width/height on both sides", () => {
    const inflated = withClearance(
      { kind: "rect", cx: 0, cy: 0, width: 10, height: 20, rotation: 0 },
      5
    );
    expect(inflated).toMatchObject({ kind: "rect", width: 20, height: 30 });
  });
  it("is a no-op for zero clearance", () => {
    const shape = { kind: "circle" as const, cx: 0, cy: 0, radius: 10 };
    expect(withClearance(shape, 0)).toEqual(shape);
  });
});

describe("room boundary", () => {
  const boundary = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("pointInRoom: inside point returns true", () => {
    expect(pointInRoom({ x: 50, y: 50 }, boundary)).toBe(true);
  });
  it("pointInRoom: outside point returns false", () => {
    expect(pointInRoom({ x: 150, y: 50 }, boundary)).toBe(false);
  });

  it("shapeFullyInRoom: rect fully inside", () => {
    const rect = { kind: "rect" as const, cx: 50, cy: 50, width: 10, height: 10, rotation: 0 };
    expect(shapeFullyInRoom(rect, boundary)).toBe(true);
  });
  it("shapeFullyInRoom: rect poking outside the boundary", () => {
    const rect = { kind: "rect" as const, cx: 98, cy: 50, width: 10, height: 10, rotation: 0 };
    expect(shapeFullyInRoom(rect, boundary)).toBe(false);
  });
  it("shapeFullyInRoom: circle fully inside", () => {
    const circle = { kind: "circle" as const, cx: 50, cy: 50, radius: 10 };
    expect(shapeFullyInRoom(circle, boundary)).toBe(true);
  });
  it("shapeFullyInRoom: circle poking outside the boundary", () => {
    const circle = { kind: "circle" as const, cx: 95, cy: 50, radius: 10 };
    expect(shapeFullyInRoom(circle, boundary)).toBe(false);
  });
});
