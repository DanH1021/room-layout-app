import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageUsers, forbidden } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageUsers(session.role)) return forbidden("Only administrators can view the user list.");
  const users = await prisma.user.findMany({
    where: { orgId: session.orgId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ users });
}

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(["administrator", "sales_manager", "salesperson", "operations", "read_only"]),
});

function generateTempPassword(): string {
  // Readable-ish random password (base64url of 12 random bytes, ~16 chars)
  // handed back once in the API response — there's no email delivery in
  // this build, so whoever ran the create form has to relay it themselves.
  return randomBytes(12).toString("base64url");
}

/**
 * Creates a teammate account with a random temporary password, returned
 * once in the response body (never stored in plaintext, never logged). This
 * exists because before this route the only way to add a user was inserting
 * a row directly in the database — not something anyone but this session
 * could do. There's still no self-serve signup or "email me a reset link"
 * flow; the admin is expected to relay the temp password out of band and
 * the new user has no in-app way to change it except via /account.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageUsers(session.role)) return forbidden("Only administrators can create users.");

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) {
    return Response.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      orgId: session.orgId,
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: hashPassword(tempPassword),
    },
    select: { id: true, email: true, name: true, role: true },
  });

  return Response.json({ user, tempPassword }, { status: 201 });
}
