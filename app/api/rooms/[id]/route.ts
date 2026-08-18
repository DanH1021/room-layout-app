import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";

/**
 * DELETE blocks if any Event still references this room — rooms are a
 * shared, reusable resource (one room template can back many events), so
 * deleting one out from under an event would silently orphan it. This
 * mirrors the equipment-delete pattern in app/api/equipment/[id]/route.ts:
 * block on shared/external dependents rather than cascading across them.
 *
 * RoomFeature rows (this room's own traced obstacles) belong exclusively to
 * this room, so they're safe to cascade — deleted here in the same
 * transaction as the room itself. FloorPlanUpload rows are handled at the
 * database level (ON DELETE SET NULL on roomTemplateId, see the
 * floor_plan_upload migration) since they're an audit trail that should
 * outlive the room they originally produced.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) return forbidden("Only administrators and sales managers can manage rooms.");
  const { id } = await params;

  const existing = await prisma.roomTemplate.findFirst({ where: { id, orgId: session.orgId } });
  if (!existing) return Response.json({ error: "Room not found" }, { status: 404 });

  const eventCount = await prisma.event.count({ where: { roomTemplateId: id } });
  if (eventCount > 0) {
    return Response.json(
      { error: `This room is used by ${eventCount} event${eventCount === 1 ? "" : "s"} — delete or reassign those first.` },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.roomFeature.deleteMany({ where: { roomTemplateId: id } }),
    prisma.roomTemplate.delete({ where: { id } }),
  ]);

  return Response.json({ ok: true });
}
