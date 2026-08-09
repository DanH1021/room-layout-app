import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canEdit, forbidden } from "@/lib/auth/roles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const event = await prisma.event.findFirst({ where: { id, orgId: session.orgId } });
  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }
  const layouts = await prisma.layout.findMany({ where: { eventId: id }, orderBy: { updatedAt: "desc" } });
  return Response.json({ layouts });
}

const createLayoutSchema = z.object({
  name: z.string().min(1).max(200),
  // Optional: start this layout as a copy of another layout in the same
  // event (e.g. "FINAL" starting from "Draft 2"), instead of always blank —
  // the sales team's real workflow is iterating on a few named variants per
  // event, per architecture doc Section 5's Layout.status field.
  copyFromLayoutId: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canEdit(session.role)) return forbidden("Read-only accounts can't create layouts.");
  const { id } = await params;
  const event = await prisma.event.findFirst({ where: { id, orgId: session.orgId } });
  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }
  const body = await req.json();
  const parsed = createLayoutSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const layout = await prisma.layout.create({
    data: {
      eventId: id,
      name: parsed.data.name,
      status: "draft",
      createdBy: session.userId,
    },
  });

  if (parsed.data.copyFromLayoutId) {
    const sourceObjects = await prisma.layoutObject.findMany({
      where: { layoutId: parsed.data.copyFromLayoutId, layout: { eventId: id } },
    });
    if (sourceObjects.length) {
      // Remap ids (old id -> new id) so parent/child chair relationships
      // still point at the right *copied* table, not the original one.
      const idMap = new Map(sourceObjects.map((o) => [o.id, crypto.randomUUID()]));
      await prisma.layoutObject.createMany({
        data: sourceObjects.map((o) => ({
          id: idMap.get(o.id)!,
          layoutId: layout.id,
          equipmentItemId: o.equipmentItemId,
          parentObjectId: o.parentObjectId ? idMap.get(o.parentObjectId) ?? null : null,
          shape: o.shape,
          x: o.x,
          y: o.y,
          rotation: o.rotation,
          widthIn: o.widthIn,
          lengthIn: o.lengthIn,
          diameterIn: o.diameterIn,
          zIndex: o.zIndex,
          metadata: o.metadata ?? undefined,
        })),
      });
    }
  }

  return Response.json({ layout }, { status: 201 });
}
