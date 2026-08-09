import { describe, it, expect } from "vitest";
import {
  rectVsRect,
  circleVsCircle,
  circleVsRect,
  RectShape,
  convexPolygonVsConvexPolygon,
  circleVsConvexPolygon,
  isConvexPolygon,
  shapesOverlap,
} from "@/lib/geometry/collision";
import { withClearance } from "@/lib/geometry/clearance";
import { pointInRoom, shapeFullyInRoom, polygonBoundingBox } from "@/lib/geometry/room";

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

  it("shapeFullyInRoom: polygon fully inside", () => {
    const polygon = {
      kind: "polygon" as const,
      points: [
        { x: 40, y: 40 },
        { x: 60, y: 40 },
        { x: 50, y: 60 },
      ],
    };
    expect(shapeFullyInRoom(polygon, boundary)).toBe(true);
  });

  it("shapeFullyInRoom: polygon poking outside the boundary", () => {
    const polygon = {
      kind: "polygon" as const,
      points: [
        { x: 90, y: 40 },
        { x: 110, y: 40 },
        { x: 100, y: 60 },
      ],
    };
    expect(shapeFullyInRoom(polygon, boundary)).toBe(false);
  });
});

describe("convexPolygonVsConvexPolygon", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("detects overlap between a square and an overlapping triangle", () => {
    const triangle = [
      { x: 5, y: 5 },
      { x: 20, y: 5 },
      { x: 12, y: 20 },
    ];
    expect(convexPolygonVsConvexPolygon(square, triangle)).toBe(true);
  });

  it("detects no overlap between a square and a far-away triangle", () => {
    const triangle = [
      { x: 100, y: 100 },
      { x: 120, y: 100 },
      { x: 110, y: 120 },
    ];
    expect(convexPolygonVsConvexPolygon(square, triangle)).toBe(false);
  });
});

describe("circleVsConvexPolygon", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("detects a circle overlapping the polygon", () => {
    expect(circleVsConvexPolygon({ cx: 8, cy: 5, radius: 5 }, square)).toBe(true);
  });

  it("detects no overlap when the circle is well clear of the polygon", () => {
    expect(circleVsConvexPolygon({ cx: 100, cy: 100, radius: 5 }, square)).toBe(false);
  });

  it("detects no overlap near a corner when the circle is outside the diagonal reach", () => {
    // Circle sits diagonally near the (10,10) corner but far enough that
    // neither an edge-normal axis nor the corner axis reports overlap.
    expect(circleVsConvexPolygon({ cx: 20, cy: 20, radius: 3 }, square)).toBe(false);
  });
});

describe("rect vs polygon (via shapesOverlap)", () => {
  it("detects a rect overlapping a polygon", () => {
    const rect = { kind: "rect" as const, cx: 5, cy: 5, width: 10, height: 10, rotation: 0 };
    const polygon = {
      kind: "polygon" as const,
      points: [
        { x: 8, y: 8 },
        { x: 20, y: 8 },
        { x: 14, y: 20 },
      ],
    };
    expect(shapesOverlap(rect, polygon)).toBe(true);
    expect(shapesOverlap(polygon, rect)).toBe(true);
  });

  it("detects no overlap between a rect and a far-away polygon", () => {
    const rect = { kind: "rect" as const, cx: 0, cy: 0, width: 10, height: 10, rotation: 0 };
    const polygon = {
      kind: "polygon" as const,
      points: [
        { x: 100, y: 100 },
        { x: 120, y: 100 },
        { x: 110, y: 120 },
      ],
    };
    expect(shapesOverlap(rect, polygon)).toBe(false);
  });
});

describe("isConvexPolygon", () => {
  it("returns true for a square", () => {
    expect(
      isConvexPolygon([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
    ).toBe(true);
  });

  it("returns true for a triangle", () => {
    expect(
      isConvexPolygon([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ])
    ).toBe(true);
  });

  it("returns true for a regular pentagon", () => {
    const points = Array.from({ length: 5 }, (_, i) => {
      const angle = (i / 5) * Math.PI * 2;
      return { x: 10 * Math.cos(angle), y: 10 * Math.sin(angle) };
    });
    expect(isConvexPolygon(points)).toBe(true);
  });

  it("returns false for an L-shape", () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(isConvexPolygon(lShape)).toBe(false);
  });
});

describe("polygonBoundingBox", () => {
  it("computes the min/max bounding box", () => {
    const box = polygonBoundingBox([
      { x: 5, y: 10 },
      { x: -3, y: 20 },
      { x: 8, y: -4 },
    ]);
    expect(box).toEqual({ minX: -3, minY: -4, maxX: 8, maxY: 20, width: 11, height: 24 });
  });
});
