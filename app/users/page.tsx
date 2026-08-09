"use client";

import { useEffect, useState, useCallback } from "react";
import { TopNav } from "@/components/dashboard/TopNav";

const ROLES = ["administrator", "sales_manager", "salesperson", "operations", "read_only"] as const;

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("salesperson");
  const [submitting, setSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    const data = await res.json();
    setUsers(data.users);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      setError("Couldn't load users.");
    });
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setJustCreated(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `Create failed (${res.status})`);
      }
      const data = await res.json();
      setJustCreated({ email: data.user.email, tempPassword: data.tempPassword });
      setName("");
      setEmail("");
      setRole("salesperson");
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't create user");
    } finally {
      setSubmitting(false);
    }
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <TopNav />
        <div className="max-w-3xl mx-auto p-6 text-sm text-neutral-600">
          Only administrators can manage users.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-1">New User</h1>
          <p className="text-xs text-neutral-500 mb-3">
            There&apos;s no email delivery in this build — after creating a user, their temporary password is
            shown once below. Relay it to them directly; they can change it afterward from their Account page.
          </p>
          <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
          </form>

          {justCreated && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">
              Created <strong>{justCreated.email}</strong>. Temporary password (shown once):{" "}
              <code className="bg-white border border-emerald-300 rounded px-1.5 py-0.5">{justCreated.tempPassword}</code>
            </div>
          )}
        </div>

        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-3">Users</h1>
          {users === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <div className="flex flex-col gap-2">
              {users.map((u) => (
                <div key={u.id} className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-neutral-800">{u.name}</div>
                    <div className="text-xs text-neutral-500">{u.email}</div>
                  </div>
                  <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-600">
                    {u.role.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
