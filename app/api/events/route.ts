import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canEdit, forbidden } from "@/lib/auth/roles";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const events = await prisma.event.findMany({
    where: { orgId: session.orgId },
    include: { client: true, roomTemplate: true, layouts: { select: { id: true } } },
    orderBy: { eventDate: "desc" },
  });
  return Response.json({ events });
}

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  eventDate: z.string().min(1), // ISO date string from a <input type="date">
  roomTemplateId: z.string().min(1),
  guestCountTarget: z.number().int().positive().max(100000).optional(),
  // Either pick an existing client or create one inline by name — the sales
  // team's normal flow is "new client, one-off event," so forcing a
  // separate client-creation step first would just add friction.
  clientId: z.string().min(1).optional(),
  newClientName: z.string().min(1).max(200).optional(),
}).refine((v) => v.clientId || v.newClientName, {
  message: "Either clientId or newClientName is required",
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canEdit(session.role)) return forbidden("Read-only accounts can't create events.");
  const body = await req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, eventDate, roomTemplateId, guestCountTarget, clientId, newClientName } = parsed.data;

  const room = await prisma.roomTemplate.findFirst({ where: { id: roomTemplateId, orgId: session.orgId } });
  if (!room) {
    return Response.json({ error: "Unknown room" }, { status: 400 });
  }

  const resolvedClientId = clientId
    ? (await prisma.client.findFirst({ where: { id: clientId, orgId: session.orgId } }))?.id
    : (await prisma.client.create({ data: { orgId: session.orgId, name: newClientName! } })).id;

  if (!resolvedClientId) {
    return Response.json({ error: "Unknown client" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      orgId: session.orgId,
      clientId: resolvedClientId,
      name,
      eventDate: new Date(eventDate),
      roomTemplateId,
      guestCountTarget,
    },
  });

  return Response.json({ event }, { status: 201 });
}
