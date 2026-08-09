import { describe, it, expect } from "vitest";
import { structuredLayoutRequestSchema } from "@/lib/schemas/aiRequest";

describe("structuredLayoutRequestSchema", () => {
  it("accepts a well-formed add request", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Set up 10 rounds of 8 for an 80-guest reception.",
      guestCount: 80,
      seatingStyle: "rounds",
      operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 10 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a clear operation with no other fields", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Clear the room.",
      operations: [{ op: "clear" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a request missing the required 'intent' field", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      operations: [{ op: "clear" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an 'add' operation with a count of 0", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Add zero tables?",
      operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an 'add' operation with an absurdly large count", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Add way too many tables.",
      operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 9999 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an operation with an unknown 'op' discriminator", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Move table 3 to the corner.",
      operations: [{ op: "move", objectId: "abc", x: 100, y: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an 'add' operation missing equipmentItemId", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Add some tables.",
      operations: [{ op: "add", count: 5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a seatingStyle outside the enum", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Set up something unusual.",
      seatingStyle: "campfire",
      operations: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 operations (guards against runaway responses)", () => {
    const result = structuredLayoutRequestSchema.safeParse({
      intent: "Do a lot of things.",
      operations: Array.from({ length: 21 }, () => ({ op: "clear" as const })),
    });
    expect(result.success).toBe(false);
  });
});
