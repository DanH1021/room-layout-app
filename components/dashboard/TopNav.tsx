"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

/**
 * Minimal shared nav for the non-editor "dashboard" pages (events, rooms).
 * The editor screen intentionally omits this — it's a focused full-screen
 * canvas, and the Toolbar/Save/Export controls already live there (though it
 * does get its own small "Log out" control — see RoomCanvas.tsx).
 *
 * This is a Client Component (not a Server Component reading the session
 * cookie directly) because it's rendered from client-component pages
 * (events/rooms use client-side data fetching); a "use client" module can't
 * import and render a Server Component that touches next/headers.
 */
export function TopNav() {
  const router = useRouter();
  const user = useCurrentUser();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="border-b border-neutral-200 bg-white px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="text-sm font-semibold text-neutral-800">Room Layout Program</span>
      <nav className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
        <Link href="/events" className="hover:text-neutral-900">
          Events
        </Link>
        <Link href="/rooms" className="hover:text-neutral-900">
          Rooms
        </Link>
        <Link href="/equipment" className="hover:text-neutral-900">
          Equipment
        </Link>
        {user?.role === "administrator" && (
          <Link href="/users" className="hover:text-neutral-900">
            Users
          </Link>
        )}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-neutral-600">
        <Link href="/account" className="hover:text-neutral-900">
          {user?.name ?? "Account"}
        </Link>
        <button onClick={handleLogout} className="hover:text-neutral-900">
          Log out
        </button>
      </div>
    </div>
  );
}
