import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getInterpretProvider } from "@/lib/ai/router";
import { EquipmentItem } from "@/lib/geometry/types";
import { getSession } from "@/lib/auth/getSession";
import { canEdit, forbidden } from "@/lib/auth/roles";

const bodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  layoutId: z.string(),
});

/**
 * POST { prompt, layoutId } -> asks Claude to interpret a natural-language
 * layout request into structured intent (see lib/schemas/aiRequest.ts),
 * given the room and equipment library as context. Returns the structured
 * request for the client to preview and apply via lib/ai/executeRequest.ts —
 * this route never touches LayoutObject rows itself, matching the
 * architecture doc's principle that the AI proposes and the deterministic
 * geometry engine (running client-side, same as manual edits) is what
 * actually executes and validates.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canEdit(session.role)) return forbidden("Read-only accounts can't use the AI command bar.");
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { prompt, layoutId } = parsed.data;

  const layout = await prisma.layout.findUnique({
    where: { id: layoutId },
    include: { objects: true, event: { include: { roomTemplate: true } } },
  });
  if (!layout || layout.event.roomTemplate.orgId !== session.orgId) {
    return Response.json({ error: "Layout not found" }, { status: 404 });
  }

  const room = layout.event.roomTemplate;
  const equipmentRows = await prisma.equipmentItem.findMany({ where: { orgId: room.orgId } });
  const equipment: EquipmentItem[] = equipmentRows.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category as EquipmentItem["category"],
    shape: e.shape as EquipmentItem["shape"],
    widthIn: e.widthIn ?? undefined,
    lengthIn: e.lengthIn ?? undefined,
    diameterIn: e.diameterIn ?? undefined,
    defaultChairCount: e.defaultChairCount ?? undefined,
    clearanceIn: e.clearanceIn,
    rotatable: e.rotatable,
    color: e.color,
  }));

  const currentObjectCounts: Record<string, number> = {};
  for (const o of layout.objects) {
    if (!o.parentObjectId && o.equipmentItemId) {
      currentObjectCounts[o.equipmentItemId] = (currentObjectCounts[o.equipmentItemId] ?? 0) + 1;
    }
  }

  try {
    const provider = getInterpretProvider();
    const structuredRequest = await provider.interpretLayoutRequest(prompt, {
      room: { roomName: room.roomName, widthFt: room.widthFt, lengthFt: room.lengthFt },
      equipment,
      currentObjectCounts,
      guestCountTarget: undefined,
    });

    await prisma.aIInteractionLog.create({
      data: {
        layoutId,
        prompt,
        structuredResponseJson: structuredRequest,
        provider: "claude",
      },
    });

    return Response.json({ request: structuredRequest });
  } catch (err) {
    console.error("AI interpret failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const isAuthError = message.toLowerCase().includes("api key") || message.toLowerCase().includes("x-api-key");
    return Response.json(
      {
        error: isAuthError
          ? "The AI command bar needs an ANTHROPIC_API_KEY set in the server environment — it isn't configured yet."
          : `AI request failed: ${message}`,
      },
      { status: 502 }
    );
  }
}
