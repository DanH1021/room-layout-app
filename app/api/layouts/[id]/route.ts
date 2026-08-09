import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { validateLayout } from "@/lib/geometry/validate";
import { EquipmentItem, LayoutObject, RoomBoundaryPoint } from "@/lib/geometry/types";
import { getSession } from "@/lib/auth/getSession";
import { canEdit, forbidden } from "@/lib/auth/roles";

/**
 * GET returns everything the editor needs to bootstrap: the layout's saved
 * objects, its room template (with real-world dimensions and boundary), and
 * the org's equipment library — replacing the hard-coded in-memory seed data
 * the editor used before persistence was wired up.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const layout = await prisma.layout.findUnique({
    where: { id },
    include: { objects: true, event: { include: { roomTemplate: true } } },
  });

  // Treat "exists but belongs to another org" the same as "doesn't exist" —
  // never confirm to a caller that a resource exists outside their org.
  if (!layout || layout.event.roomTemplate.orgId !== session.orgId) {
    return Response.json({ error: "Layout not found" }, { status: 404 });
  }

  const room = layout.event.roomTemplate;
  const equipment = await prisma.equipmentItem.findMany({ where: { orgId: room.orgId } });

  return Response.json({
    layout: { id: layout.id, name: layout.name, status: layout.status },
    room: {
      id: room.id,
      venueName: room.venueName,
      roomName: room.roomName,
      widthFt: room.widthFt,
      lengthFt: room.lengthFt,
      boundary: room.boundaryJson,
    },
    equipment,
    objects: layout.objects.map((o) => ({
      id: o.id,
      equipmentItemId: o.equipmentItemId,
      parentObjectId: o.parentObjectId,
      shape: o.shape,
      x: o.x,
      y: o.y,
      rotation: o.rotation,
      widthIn: o.widthIn,
      lengthIn: o.lengthIn,
      diameterIn: o.diameterIn,
      zIndex: o.zIndex,
      label: (o.metadata as { label?: string } | null)?.label ?? null,
    })),
  });
}

const objectSchema = z.object({
  id: z.string(),
  equipmentItemId: z.string(),
  parentObjectId: z.string().nullable().optional(),
  shape: z.enum(["rect", "circle"]),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  widthIn: z.number().nullable().optional(),
  lengthIn: z.number().nullable().optional(),
  diameterIn: z.number().nullable().optional(),
  zIndex: z.number().optional(),
  label: z.string().nullable().optional(),
});
const putSchema = z.object({ objects: z.array(objectSchema) });

/**
 * PUT replaces the full object set for this layout. The client is never
 * trusted for spatial facts, per the architecture doc's core principle: this
 * route re-runs the same authoritative geometry validation the editor runs
 * live, and persists the resulting LayoutIssue rows alongside the objects.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canEdit(session.role)) return forbidden("Read-only accounts can't save layout changes.");
  const { id } = await params;
  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const layout = await prisma.layout.findUnique({
    where: { id },
    include: { event: { include: { roomTemplate: true } } },
  });
  if (!layout || layout.event.roomTemplate.orgId !== session.orgId) {
    return Response.json({ error: "Layout not found" }, { status: 404 });
  }

  const equipmentItems = await prisma.equipmentItem.findMany({
    where: { orgId: layout.event.roomTemplate.orgId },
  });
  const equipmentById = new Map<string, EquipmentItem>(
    equipmentItems.map((e) => [
      e.id,
      {
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
      },
    ])
  );

  const toLayoutObject = (o: z.infer<typeof objectSchema>): LayoutObject => ({
    id: o.id,
    equipmentItemId: o.equipmentItemId,
    parentObjectId: o.parentObjectId ?? null,
    shape: o.shape,
    x: o.x,
    y: o.y,
    rotation: o.rotation,
    widthIn: o.widthIn ?? undefined,
    lengthIn: o.lengthIn ?? undefined,
    diameterIn: o.diameterIn ?? undefined,
    zIndex: o.zIndex ?? 0,
    label: o.label ?? undefined,
  });

  const allObjects = parsed.data.objects.map(toLayoutObject);
  const parents = allObjects.filter((o) => !o.parentObjectId);
  const childrenByParent = new Map<string, LayoutObject[]>();
  for (const o of allObjects) {
    if (o.parentObjectId) {
      const list = childrenByParent.get(o.parentObjectId) ?? [];
      list.push(o);
      childrenByParent.set(o.parentObjectId, list);
    }
  }

  const units = parents
    .map((p) => {
      const item = equipmentById.get(p.equipmentItemId);
      if (!item) return null;
      const children = (childrenByParent.get(p.id) ?? [])
        .map((c) => {
          const childItem = equipmentById.get(c.equipmentItemId);
          return childItem ? { object: c, item: childItem } : null;
        })
        .filter((c): c is { object: LayoutObject; item: EquipmentItem } => c !== null);
      return { object: p, item, children };
    })
    .filter((u): u is { object: LayoutObject; item: EquipmentItem; children: { object: LayoutObject; item: EquipmentItem }[] } => u !== null);

  const boundary = layout.event.roomTemplate.boundaryJson as unknown as RoomBoundaryPoint[];
  const issues = validateLayout(units, boundary);

  await prisma.$transaction([
    prisma.layoutObject.deleteMany({ where: { layoutId: id } }),
    ...(parsed.data.objects.length
      ? [
          prisma.layoutObject.createMany({
            data: parsed.data.objects.map((o) => ({
              id: o.id,
              layoutId: id,
              equipmentItemId: o.equipmentItemId,
              parentObjectId: o.parentObjectId ?? null,
              shape: o.shape,
              x: o.x,
              y: o.y,
              rotation: o.rotation,
              widthIn: o.widthIn ?? null,
              lengthIn: o.lengthIn ?? null,
              diameterIn: o.diameterIn ?? null,
              zIndex: o.zIndex ?? 0,
              metadata: o.label ? { label: o.label } : undefined,
            })),
          }),
        ]
      : []),
    prisma.layoutIssue.deleteMany({ where: { layoutId: id } }),
    ...(issues.length
      ? [
          prisma.layoutIssue.createMany({
            data: issues.map((i) => ({
              layoutId: id,
              type: i.type,
              severity: i.severity,
              description: i.description,
              objectIds: i.objectIds,
            })),
          }),
        ]
      : []),
  ]);

  return Response.json({ ok: true, issueCount: issues.length, savedAt: new Date().toISOString() });
}
