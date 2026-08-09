import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

// Next.js 16 renamed middleware.ts -> proxy.ts (same runtime/behavior, new
// file/export name) — this file is the auth gate for every route except the
// ones explicitly excluded by `matcher` below. It runs in the Edge runtime,
// which is why session verification lives in lib/auth/session.ts (jose,
// Web Crypto) rather than lib/auth/password.ts (Node's `crypto` module,
// not available here).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/session"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Excludes Next's static/image assets and the favicon; everything else —
  // every page and every API route — goes through the check above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
