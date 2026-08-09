"use client";

import { useEffect, useState } from "react";
import { TopNav } from "@/components/dashboard/TopNav";

export default function AccountPage() {
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setName(data?.user?.name ?? null);
        setEmail(data?.user?.email ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `Failed (${res.status})`);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-md mx-auto p-6 flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800">Account</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {name} · {email}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">Change Password</h2>
          <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Current password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              New password
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Confirm new password
              <input
                required
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-emerald-600">Password changed.</p>}
            <button
              type="submit"
              disabled={submitting}
              className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
            >
              {submitting ? "Saving…" : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
