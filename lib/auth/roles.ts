import { SessionPayload } from "@/lib/auth/session";

// Minimal role checks against the brief's Section 18 role list
// (administrator | sales_manager | salesperson | operations | read_only).
// This is NOT the full permission matrix from that section — it's the
// smallest useful slice: org-level config (equipment/rooms/users) needs
// elevated trust, and read_only genuinely can't write anything. Enforcing
// the rest of Section 18's finer-grained rules is separate future work; see
// the milestone doc.

export function canManageUsers(role: string): boolean {
  return role === "administrator";
}

/** Equipment library and room templates are org-wide config, not per-event work. */
export function canManageOrgSettings(role: string): boolean {
  return role === "administrator" || role === "sales_manager";
}

/** Everything else that writes data (events, layouts, AI requests) — anyone but read_only. */
export function canEdit(role: string): boolean {
  return role !== "read_only";
}

export function forbidden(message: string) {
  return Response.json({ error: message }, { status: 403 });
}

export type { SessionPayload };
