import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SessionPayload, verifySessionToken } from "@/lib/auth/session";

/**
 * Reads and verifies the current request's session cookie. Use in Route
 * Handlers and Server Components. Returns null if there's no session or it's
 * invalid/expired — callers decide whether that's a redirect, a 401, etc.
 * (middleware.ts already blocks unauthenticated requests from reaching most
 * routes at all, but routes still check this themselves so they're correct
 * in isolation, not just because middleware happened to run first.)
 */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Same as getSession(), but throws a 401 Response if there's no session — for API routes that require auth. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError();
  }
  return session;
}

export class AuthError extends Error {
  status = 401;
  constructor() {
    super("Not authenticated");
  }
}
