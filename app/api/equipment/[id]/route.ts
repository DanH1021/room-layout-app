import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { equipmentSchema } from "@/app/api/equipment/route";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) return forbidden("Only administrators and sales managers can manage the equipment library.");
  const { id } = await params;

  const existing = await prisma.equipmentItem.findFirst({ where: { id, orgId: session.orgId } });
  if (!existing) return Response.json({ error: "Equipment item not found" }, { status: 404 });

  const body = await req.json();
  const parsed = equipmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item = await prisma.equipmentItem.update({ where: { id }, data: parsed.data });
  return Response.json({ item });
}

/**
 * DELETE refuses if any LayoutObject still references this item. There's no
 * database-level foreign key from LayoutObject.equipmentItemId to
 * EquipmentItem (it's a loose string — see prisma/schema.prisma), so nothing
 * would stop the delete at the DB layer; it would instead silently degrade
 * every layout using it (the editor/PDF renderer already tolerate an unknown
 * equipmentItemId by skipping the object, per lib/ai/executeRequest.ts's
 * safeGetEquipment and renderLayoutPdf.ts's drawEquipment). Blocking here is
 * safer than relying on that graceful-degradation path by accident.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) return forbidden("Only administrators and sales managers can manage the equipment library.");
  const { id } = await params;

  const existing = await prisma.equipmentItem.findFirst({ where: { id, orgId: session.orgId } });
  if (!existing) return Response.json({ error: "Equipment item not found" }, { status: 404 });

  const inUseCount = await prisma.layoutObject.count({ where: { equipmentItemId: id } });
  if (inUseCount > 0) {
    return Response.json(
      { error: `This item is used by ${inUseCount} placed object${inUseCount === 1 ? "" : "s"} across your layouts — remove it from those layouts first.` },
      { status: 409 }
    );
  }

  await prisma.equipmentItem.delete({ where: { id } });
  return Response.json({ ok: true });
}
