import { z } from "zod";

/**
 * What the AI proposes when parsing an uploaded floor-plan file — never
 * trusted as final. Every coordinate/size here is normalized (0..1, a
 * fraction of the background image's pixel width/height) rather than in
 * inches, because at parse time we don't yet know the real-world scale of
 * the drawing — that gets resolved separately (scale note or a manually
 * drawn calibration line) once the human reviews this proposal, per the
 * FloorPlanUpload wizard flow. Downstream code multiplies these fractions
 * by the actual backgroundImageWidthPx/HeightPx to get pixels, then by
 * pxPerInch to get inches.
 *
 * Convexity of polygon obstacles is deliberately NOT enforced here (unlike
 * lib/geometry/collision.ts's isConvexPolygon, used elsewhere) — these
 * points are still normalized/unitless at this stage, and convexity is a
 * property of the denormalized, real-world shape. That check happens later,
 * at commit time, after the polygon has been resolved to actual inches.
 */
const rectFields = {
  widthNorm: z.number().min(0).max(1),
  lengthNorm: z.number().min(0).max(1),
};

const circleFields = {
  diameterNorm: z.number().min(0).max(1),
};

const polygonFields = {
  polygonPointsNorm: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .min(3),
};

const obstacleTypeEnum = z.enum([
  "wall",
  "door",
  "window",
  "column",
  "stairs",
  "permanent_bar",
  "kitchen_entrance",
  "restroom",
  "emergency_exit",
  "electrical",
  "av_connection",
  "screen",
  "permanent_staging",
  "bump_out",
  "other",
]);

const baseObstacleFields = {
  type: obstacleTypeEnum,
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  widthNorm: z.number().min(0).max(1).optional(),
  lengthNorm: z.number().min(0).max(1).optional(),
  diameterNorm: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
  polygonPointsNorm: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .optional(),
  label: z.string().optional(),
};

/**
 * Mirrors the equipment schema's .refine() pattern: the shape determines
 * which fields are actually required, even though the base object type
 * keeps them all optional so a single flat shape can be described to the
 * AI's tool-use schema.
 */
export const proposedObstacleSchema = z
  .object({
    ...baseObstacleFields,
    shape: z.enum(["rect", "circle", "polygon"]),
  })
  .refine(
    (o) => {
      if (o.shape === "rect") {
        return (
          rectFields.widthNorm.safeParse(o.widthNorm).success &&
          rectFields.lengthNorm.safeParse(o.lengthNorm).success &&
          o.x !== undefined &&
          o.y !== undefined
        );
      }
      if (o.shape === "circle") {
        return (
          circleFields.diameterNorm.safeParse(o.diameterNorm).success &&
          o.x !== undefined &&
          o.y !== undefined
        );
      }
      // polygon
      return polygonFields.polygonPointsNorm.safeParse(o.polygonPointsNorm).success;
    },
    {
      message:
        "Obstacle is missing the fields required for its shape: rect needs x/y/widthNorm/lengthNorm, circle needs x/y/diameterNorm, polygon needs polygonPointsNorm with >= 3 points.",
    }
  );

export type ProposedObstacle = z.infer<typeof proposedObstacleSchema>;

export const proposedFloorPlanSchema = z.object({
  /** Closed polygon tracing the room's boundary, normalized 0..1 image-fraction coordinates. */
  boundaryPoints: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .min(3)
    .max(60),
  obstacles: z.array(proposedObstacleSchema).max(200),
  scaleNote: z.object({
    found: z.boolean(),
    confidence: z.enum(["high", "medium", "low", "none"]),
    /** Raw printed text, e.g. `1/16" = 1'-0"`. */
    rawText: z.string().optional(),
    /** Parsed multiplier: drawn inches per real-world foot, e.g. 1/16 = 0.0625. */
    drawnInchesPerRealFoot: z.number().positive().optional(),
  }),
  /** Anything the AI wants to flag — illegible areas, ambiguous obstacles, etc. */
  notes: z.string().optional(),
});

export type ProposedFloorPlan = z.infer<typeof proposedFloorPlanSchema>;
