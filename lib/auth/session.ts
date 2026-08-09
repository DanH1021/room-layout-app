import { SignJWT, jwtVerify } from "jose";

// jose (not a hand-rolled JWT) because it's edge-runtime compatible — this
// same module is imported from middleware.ts, which runs in Next's Edge
// runtime and can't use Node's `crypto` module the way lib/auth/password.ts
// does.
export const SESSION_COOKIE_NAME = "rlp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    // Fail loudly rather than silently signing tokens with a weak/missing
    // secret — an auth system that degrades quietly is worse than one that
    // refuses to start.
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a random 32+ character value in .env (see .env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId === "string" &&
      typeof payload.orgId === "string" &&
      typeof payload.email === "string" &&
      typeof payload.name === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        userId: payload.userId,
        orgId: payload.orgId,
        email: payload.email,
        name: payload.name,
        role: payload.role,
      };
    }
    return null;
  } catch {
    return null; // expired, malformed, or wrong signature — all just "not logged in"
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
