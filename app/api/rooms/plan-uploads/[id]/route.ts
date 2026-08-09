import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) {
    return forbidden("Only administrators and sales managers can view floor-plan uploads.");
  }
  const { id } = await params;

  const upload = await prisma.floorPlanUpload.findUnique({ where: { id } });

  // Treat "exists but belongs to another org" the same as "doesn't exist" —
  // never confirm to a caller that a resource exists outside their org.
  if (!upload || upload.orgId !== session.orgId) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  return Response.json({ upload });
}
