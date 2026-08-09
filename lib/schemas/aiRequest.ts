import { z } from "zod";

/**
 * The AI never produces measurements or coordinates directly — per the
 * architecture doc's core principle, it produces structured *intent*, and
 * the deterministic geometry engine (lib/geometry/) turns that intent into
 * an actual validated layout via lib/ai/executeRequest.ts. Every field here
 * is either a count, a reference to an existing equipment/object id, or free
 * text — never an x/y/rotation.
 *
 * Scope note: v1 of the command bar supports adding equipment, removing
 * equipment (by id or by type), and clearing the room. Fine-grained
 * repositioning ("move Table 3 closer to the stage") is intentionally out of
 * scope — natural-language coordinate placement is unreliable and the manual
 * editor already does this well; this can be revisited in a later phase.
 */
export const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    equipmentItemId: z.string(),
    count: z.number().int().min(1).max(60),
  }),
  z.object({
    op: z.literal("remove"),
    objectId: z.string(),
  }),
  z.object({
    op: z.literal("removeAllOfType"),
    equipmentItemId: z.string(),
  }),
  z.object({
    op: z.literal("clear"),
  }),
]);

export type Operation = z.infer<typeof operationSchema>;

export const structuredLayoutRequestSchema = z.object({
  /** Plain-language restatement of what the AI understood, shown to the user before anything is applied. */
  intent: z.string().min(1).max(500),
  guestCount: z.number().int().positive().optional(),
  seatingStyle: z
    .enum(["rounds", "family_style", "cocktail", "banquet_rows", "mixed"])
    .optional(),
  operations: z.array(operationSchema).max(20),
  /** Things the AI flagged but didn't act on — e.g. "100 guests at rounds of 8 needs 13 tables, which likely won't fit this room; added 10 as a starting point." */
  warnings: z.array(z.string()).optional(),
});

export type StructuredLayoutRequest = z.infer<typeof structuredLayoutRequestSchema>;
