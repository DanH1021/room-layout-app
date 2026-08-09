import { getSession } from "@/lib/auth/getSession";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ user: null }, { status: 401 });
  }
  return Response.json({
    user: { id: session.userId, email: session.email, name: session.name, role: session.role },
  });
}
