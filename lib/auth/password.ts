import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// scrypt is built into Node — no extra dependency (like bcrypt's native
// binding) that could fail to compile in an arbitrary deploy environment.
// Format: "<saltHex>:<hashHex>", stored as-is in User.passwordHash.
const KEY_LENGTH = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(plain, salt, KEY_LENGTH);
  // timingSafeEqual throws if lengths differ, which would leak info via a
  // crash instead of a clean "wrong password" — guard the length first.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
