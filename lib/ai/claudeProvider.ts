import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, LayoutContext } from "@/lib/ai/provider";
import { structuredLayoutRequestSchema, StructuredLayoutRequest } from "@/lib/schemas/aiRequest";

// Model id is configurable via env since it will drift over time — check
// https://docs.claude.com for the current recommended model before deploying.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

const INTERPRET_TOOL_NAME = "propose_layout_changes";

// Hand-written JSON Schema mirroring lib/schemas/aiRequest.ts's zod schema,
// used only to constrain Claude's tool-use output. The zod schema remains
// the single source of truth for validation — this is never trusted on its
// own; every response is re-parsed with .safeParse before use.
const INTERPRET_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    intent: {
      type: "string",
      description: "One sentence in plain language restating what you understood the user to want, for their confirmation before anything is applied.",
    },
    guestCount: { type: "integer", minimum: 1 },
    seatingStyle: {
      type: "string",
      enum: ["rounds", "family_style", "cocktail", "banquet_rows", "mixed"],
    },
    operations: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "remove", "removeAllOfType", "clear"] },
          equipmentItemId: { type: "string", description: "Required for 'add' and 'removeAllOfType'. Must be one of the ids from the equipment library provided in context." },
          count: { type: "integer", minimum: 1, maximum: 60, description: "Required for 'add'." },
          objectId: { type: "string", description: "Required for 'remove'. Must be one of the ids from the currently-placed objects provided in context." },
        },
        required: ["op"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Anything you flagged but didn't act on — e.g. a requested guest count that won't physically fit this room.",
    },
  },
  required: ["intent", "operations"],
};

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async interpretLayoutRequest(prompt: string, context: LayoutContext): Promise<StructuredLayoutRequest> {
    const equipmentSummary = context.equipment
      .map((e) => {
        const placed = context.currentObjectCounts[e.id] ?? 0;
        const seats = e.defaultChairCount ? `, seats ${e.defaultChairCount}` : "";
        return `- ${e.id}: "${e.name}" (${e.category}${seats}) — currently ${placed} placed`;
      })
      .join("\n");

    const systemPrompt = `You help a catering sales team turn natural-language room-setup requests into a structured plan. You never compute measurements, positions, or collision checks yourself — a deterministic geometry engine handles all of that after you respond. Your only job is to propose which equipment to add or remove, using the "${INTERPRET_TOOL_NAME}" tool.

Room: ${context.room.roomName}, ${context.room.widthFt}ft x ${context.room.lengthFt}ft.
${context.guestCountTarget ? `Target guest count: ${context.guestCountTarget}.` : ""}

Equipment library (use these exact ids in "equipmentItemId"):
${equipmentSummary}

Rules:
- Every "add" operation must use an equipmentItemId from the list above.
- If the user's request is ambiguous about table size or count, make a reasonable choice and say so in "intent" — don't ask a clarifying question, since your response is applied non-interactively.
- If a guest count would need more tables than could plausibly fit a room this size, add a reasonable starting subset and explain the shortfall in "warnings" rather than silently adding an unrealistic number.
- Only use "remove" for an objectId you were explicitly given as currently placed; use "removeAllOfType" to clear every instance of one equipment type; use "clear" only if the user clearly wants the whole room emptied.`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: INTERPRET_TOOL_NAME,
          description: "Propose structured layout changes based on the user's request.",
          input_schema: INTERPRET_TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: INTERPRET_TOOL_NAME },
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude did not return a structured tool-use response.");
    }

    // Never trust AI output for spatial facts, or at all — validate against
    // the zod schema exactly like server-side input from a client would be.
    const parsed = structuredLayoutRequestSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(`Claude's response didn't match the expected schema: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
