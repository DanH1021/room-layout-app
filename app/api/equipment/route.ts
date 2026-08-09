import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const equipment = await prisma.equipmentItem.findMany({
    where: { orgId: session.orgId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return Response.json({ equipment });
}

// Shared with app/api/equipment/[id]/route.ts's PUT — kept here since POST
// (create) and PUT (update) accept the same shape.
export const equipmentSchema = z
  .object({
    name: z.string().min(1).max(200),
    category: z.enum(["table", "chair", "bar", "stage", "dance_floor", "av", "decor", "other"]),
    shape: z.enum(["rect", "circle"]),
    widthIn: z.number().positive().max(2000).optional(),
    lengthIn: z.number().positive().max(2000).optional(),
    diameterIn: z.number().positive().max(2000).optional(),
    defaultChairCount: z.number().int().min(0).max(50).optional(),
    clearanceIn: z.number().min(0).max(200).default(0),
    rotatable: z.boolean().default(true),
    stackable: z.boolean().default(true),
    inventoryQty: z.number().int().min(0).max(100000).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #c8a76b")
      .default("#c8a76b"),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => (v.shape === "circle" ? v.diameterIn !== undefined : v.widthIn !== undefined && v.lengthIn !== undefined), {
    message: "Circle shapes need diameterIn; rect shapes need widthIn and lengthIn",
  });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) return forbidden("Only administrators and sales managers can manage the equipment library.");
  const body = await req.json();
  const parsed = equipmentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item = await prisma.equipmentItem.create({
    data: { ...parsed.data, orgId: session.orgId },
  });
  return Response.json({ item }, { status: 201 });
}
