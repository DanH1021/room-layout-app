import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST() {
  const res = Response.json({ ok: true });
  // Max-Age=0 deletes the cookie immediately.
  res.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
  return res;
}
