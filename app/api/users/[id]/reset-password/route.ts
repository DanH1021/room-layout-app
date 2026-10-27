import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageUsers, forbidden } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";

function generateTempPassword(): string {
  // Same scheme as user creation (app/api/users/route.ts) — readable-ish
  // random password, returned once in the response body, never logged or
  // stored in plaintext. There's no email delivery in this build, so the
  // admin relays it to the user out of band.
  return randomBytes(12).toString("base64url");
}

/**
 * Lets an administrator force-reset another user's password to a new random
 * temporary one — the only recovery path when a user never got (or lost) the
 * one-time temp password shown at account creation, since there's no email
 * flow and the self-service /account change-password form requires already
 * knowing the current password.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageUsers(session.role)) return forbidden("Only administrators can reset passwords.");

  const { id } = await params;
  const existing = await prisma.user.findFirst({ where: { id, orgId: session.orgId } });
  if (!existing) return Response.json({ error: "User not found" }, { status: 404 });

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(tempPassword) },
  });

  return Response.json({ email: existing.email, tempPassword });
}
