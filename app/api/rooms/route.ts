import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const rooms = await prisma.roomTemplate.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ rooms });
}

const createRoomSchema = z.object({
  venueName: z.string().min(1).max(200),
  roomName: z.string().min(1).max(200),
  widthFt: z.number().positive().max(1000),
  lengthFt: z.number().positive().max(1000),
  ceilingHeightFt: z.number().positive().max(200).optional(),
});

/**
 * MVP room creation only supports a rectangular boundary, generated
 * automatically from width/length — matching the architecture doc's "one
 * accurately measured test room" scope. Tracing an arbitrary polygon
 * boundary (from a blueprint upload or manual point-editing) is future
 * scope, not built here.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) return forbidden("Only administrators and sales managers can manage rooms.");
  const body = await req.json();
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { venueName, roomName, widthFt, lengthFt, ceilingHeightFt } = parsed.data;
  const widthIn = widthFt * 12;
  const lengthIn = lengthFt * 12;

  const room = await prisma.roomTemplate.create({
    data: {
      orgId: session.orgId,
      venueName,
      roomName,
      widthFt,
      lengthFt,
      ceilingHeightFt,
      boundaryJson: [
        { x: 0, y: 0 },
        { x: widthIn, y: 0 },
        { x: widthIn, y: lengthIn },
        { x: 0, y: lengthIn },
      ],
    },
  });

  return Response.json({ room }, { status: 201 });
}
