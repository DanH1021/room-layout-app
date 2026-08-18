import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canEdit, forbidden } from "@/lib/auth/roles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      client: true,
      roomTemplate: true,
      layouts: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }
  return Response.json({ event });
}

/**
 * DELETE blocks if this event still has any layouts. Layouts belong
 * exclusively to their event (unlike a room, which many events can share),
 * but a layout represents real work — placed objects, saved issues, AI
 * history — so losing it is still a deliberate, one-at-a-time decision, not
 * something a single "delete event" click should cascade through silently.
 * Delete the layouts first (DELETE /api/layouts/[id]), then the event.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canEdit(session.role)) return forbidden("Read-only accounts can't delete events.");
  const { id } = await params;

  const existing = await prisma.event.findFirst({ where: { id, orgId: session.orgId } });
  if (!existing) return Response.json({ error: "Event not found" }, { status: 404 });

  const layoutCount = await prisma.layout.count({ where: { eventId: id } });
  if (layoutCount > 0) {
    return Response.json(
      { error: `This event has ${layoutCount} layout${layoutCount === 1 ? "" : "s"} — delete those first.` },
      { status: 409 }
    );
  }

  await prisma.event.delete({ where: { id } });
  return Response.json({ ok: true });
}
