import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";

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
