"use client";

import { useEffect, useState } from "react";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Client-side "who am I" hook backed by /api/auth/session. Several
 * dashboard pages need the current role to decide whether to show
 * management UI that the server would reject anyway (see lib/auth/roles.ts)
 * — this centralizes that fetch instead of every page re-implementing it.
 * Returns undefined while loading, null if not logged in (shouldn't really
 * happen since proxy.ts already gates these pages, but the type is honest
 * about the request being able to fail).
 */
export function useCurrentUser(): CurrentUser | null | undefined {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
