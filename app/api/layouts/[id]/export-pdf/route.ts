import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { EquipmentItem, LayoutObject, RoomBoundaryPoint } from "@/lib/geometry/types";
import { renderLayoutPdf } from "@/lib/pdf/renderLayoutPdf";
import { getSession } from "@/lib/auth/getSession";

/**
 * GET streams a vector PDF floor plan for this layout — the same structured
 * x/y/rotation data that drives the on-screen editor, re-drawn directly as
 * PDF vector shapes at a stated architectural scale (see renderLayoutPdf.ts
 * for why this is drawn from data rather than screenshotted).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const layout = await prisma.layout.findUnique({
    where: { id },
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

  const objects: LayoutObject[] = layout.objects.map((o) => ({
    id: o.id,
    // Ad-hoc/custom objects (no equipmentItemId) aren't supported by the MVP
    // UI yet; coercing to "" here just makes drawEquipment's lookup miss and
    // silently skip them, same as everywhere else in the app that assumes a
    // real equipment item exists.
    equipmentItemId: o.equipmentItemId ?? "",
    parentObjectId: o.parentObjectId,
    shape: o.shape as LayoutObject["shape"],
    x: o.x,
    y: o.y,
    rotation: o.rotation,
    widthIn: o.widthIn ?? undefined,
    lengthIn: o.lengthIn ?? undefined,
    diameterIn: o.diameterIn ?? undefined,
    zIndex: o.zIndex,
    label: (o.metadata as { label?: string } | null)?.label ?? undefined,
  }));

  const boundary = room.boundaryJson as unknown as RoomBoundaryPoint[];

  const pdfBytes = await renderLayoutPdf({
    room: {
      venueName: room.venueName,
      roomName: room.roomName,
      widthFt: room.widthFt,
      lengthFt: room.lengthFt,
      boundary,
    },
    equipment,
    objects,
    layoutName: layout.name,
    eventName: layout.event.name,
    eventDateLabel: layout.event.eventDate
      ? new Date(layout.event.eventDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : undefined,
    guestCountTarget: layout.event.guestCountTarget ?? undefined,
    generatedAtLabel: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  });

  const safeName = `${room.roomName}-${layout.name}`.replace(/[^a-z0-9\-_. ]/gi, "_");

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
