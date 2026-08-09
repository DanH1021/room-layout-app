import Anthropic from "@anthropic-ai/sdk";
import { proposedFloorPlanSchema, ProposedFloorPlan } from "@/lib/schemas/floorPlan";

// Same model-selection convention as lib/ai/claudeProvider.ts.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

const PARSE_TOOL_NAME = "propose_floor_plan";

// Hand-written JSON Schema mirroring lib/schemas/floorPlan.ts's zod schema,
// used only to constrain Claude's tool-use output. The zod schema remains
// the single source of truth for validation — this is never trusted on its
// own; the response is re-parsed with .safeParse before use, exactly like
// claudeProvider.ts does for layout requests.
const PARSE_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    boundaryPoints: {
      type: "array",
      minItems: 3,
      maxItems: 60,
      description:
        "The room's boundary as a closed polygon, traced in reading order (clockwise or counter-clockwise, either is fine — just be consistent), in normalized image-fraction coordinates: x is 0 at the image's left edge and 1 at its right edge, y is 0 at the top and 1 at the bottom. Do not repeat the first point at the end.",
      items: {
        type: "object",
        properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
        required: ["x", "y"],
      },
    },
    obstacles: {
      type: "array",
      maxItems: 200,
      description:
        "Fixed architectural features and obstructions inside or on the boundary of the room — columns, doors, windows, stairs, permanent bars, permanent staging, kitchen entrances, restrooms, emergency exits, electrical/AV connections, screens, bump-outs, and interior walls. Do not include furniture or anything movable.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
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
            ],
          },
          shape: { type: "string", enum: ["rect", "circle", "polygon"] },
          x: { type: "number", minimum: 0, maximum: 1, description: "Center x, normalized. Required for rect/circle." },
          y: { type: "number", minimum: 0, maximum: 1, description: "Center y, normalized. Required for rect/circle." },
          widthNorm: { type: "number", minimum: 0, maximum: 1, description: "Rect width as a fraction of image width. Required for rect." },
          lengthNorm: { type: "number", minimum: 0, maximum: 1, description: "Rect length as a fraction of image height. Required for rect." },
          diameterNorm: { type: "number", minimum: 0, maximum: 1, description: "Circle diameter as a fraction of image width. Required for circle." },
          rotation: { type: "number", description: "Degrees, for rect obstacles only." },
          polygonPointsNorm: {
            type: "array",
            minItems: 3,
            description: "Vertex list, normalized coordinates. Required for polygon.",
            items: {
              type: "object",
              properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
              required: ["x", "y"],
            },
          },
          label: { type: "string" },
        },
        required: ["type", "shape"],
      },
    },
    scaleNote: {
      type: "object",
      description:
        "A printed architectural scale note (e.g. 'SCALE: 1/16\" = 1'-0\"'), if present and legible on the drawing.",
      properties: {
        found: { type: "boolean" },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low", "none"],
          description:
            "Be honest — a confident wrong guess here is worse than an honest low/none, since this feeds a downstream manual-calibration fallback that only kicks in if you say so. Use 'high' only if you can clearly read a printed scale ratio. Use 'low' if you can see something that might be a scale note but can't read it precisely. Use 'none' if there's no scale note at all.",
        },
        rawText: { type: "string", description: "The scale note's text exactly as printed, e.g. 1/16\" = 1'-0\"." },
        drawnInchesPerRealFoot: {
          type: "number",
          description: "The parsed multiplier: how many inches on the drawing equal one real-world foot. E.g. 1/16\" = 1'-0\" means 0.0625.",
        },
      },
      required: ["found", "confidence"],
    },
    notes: {
      type: "string",
      description: "Anything worth flagging for human review: illegible areas, ambiguous obstacles, uncertainty about the boundary, etc.",
    },
  },
  required: ["boundaryPoints", "obstacles", "scaleNote"],
};

const SYSTEM_PROMPT = `You are analyzing an uploaded catering/event-venue floor plan (a PDF page rasterized to an image, or a photographed/scanned floor plan image). You never compute real-world measurements yourself — a deterministic geometry engine resolves your normalized coordinates into real inches later, once a human confirms the drawing's scale. Your only job is to propose a structured trace of the drawing using the "${PARSE_TOOL_NAME}" tool.

Do this:
1. Trace the usable room's outer boundary as a closed polygon, in normalized 0..1 image-fraction coordinates (top-left origin: x increases right, y increases down — standard image coordinates, not architectural/CAD coordinates). Follow the walls of the specific room being set up for an event, not the whole building.
2. Identify fixed obstacles inside or on that boundary: columns, doors, windows, stairs, permanent bars, permanent staging, kitchen entrances, restrooms, emergency exits, electrical/AV connections, screens, bump-outs, interior walls. Skip furniture, tables, chairs, or anything that would move for a different event setup — those are not part of the room's fixed shell.
3. Look for a printed architectural scale note (e.g. "SCALE: 1/16\" = 1'-0\"", "1\" = 20'-0\"", or a graphic scale bar). Report exactly what you found and how confident you are, per the scaleNote field's instructions. If you're not sure, say so honestly with "low" or "none" confidence rather than guessing — a human will calibrate the scale manually if you report low confidence, so an honest "I don't know" is strictly better than a wrong confident answer.
4. Use "notes" to flag anything else worth a human's attention: illegible regions, an ambiguous or partially-obscured boundary, multiple rooms in the same image, etc.`;

/**
 * Sends an uploaded floor-plan file to Claude for structured extraction —
 * boundary polygon, obstacles, and scale-note confidence — all in
 * normalized 0..1 image-fraction coordinates. Never trusted directly: the
 * tool-use input is re-validated against proposedFloorPlanSchema before
 * being returned.
 */
export async function parseFloorPlan(
  fileBuffer: Buffer,
  mimeType: "application/pdf" | "image/png" | "image/jpeg"
): Promise<ProposedFloorPlan> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64Data = fileBuffer.toString("base64");

  const fileBlock: Anthropic.ContentBlockParam =
    mimeType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64Data },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64Data },
        };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: "Trace this floor plan's boundary and obstacles, and report the scale note, using the tool." },
        ],
      },
    ],
    tools: [
      {
        name: PARSE_TOOL_NAME,
        description: "Propose a structured trace of the floor plan's boundary, obstacles, and scale note.",
        input_schema: PARSE_TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: PARSE_TOOL_NAME },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured tool-use response.");
  }

  // Never trust AI output for spatial facts, or at all — validate against
  // the zod schema exactly like server-side input from a client would be.
  const parsed = proposedFloorPlanSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error(`Claude's floor-plan response didn't match the expected schema: ${parsed.error.message}`);
  }

  return parsed.data;
}
