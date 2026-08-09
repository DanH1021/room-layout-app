import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const clients = await prisma.client.findMany({
    where: { orgId: session.orgId },
    orderBy: { name: "asc" },
  });
  return Response.json({ clients });
}

const createClientSchema = z.object({ name: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const body = await req.json();
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const client = await prisma.client.create({
    data: { orgId: session.orgId, name: parsed.data.name },
  });
  return Response.json({ client }, { status: 201 });
}
