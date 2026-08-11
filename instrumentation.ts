import * as Sentry from "@sentry/nextjs";

// Server-side error/performance monitoring (Sentry). Entirely optional: set
// NEXT_PUBLIC_SENTRY_DSN (see .env.example) to activate it. Without a DSN,
// Sentry.init() is a documented no-op — nothing is captured or sent anywhere
// — so this file is always safe to ship, including in this sandbox and in
// any environment that hasn't set up a Sentry project yet.
//
// The DSN itself isn't a secret (it's meant to be embedded in shipped
// client-side JS), which is why it's a NEXT_PUBLIC_ var rather than a
// server-only one — one variable configures both server and client
// (instrumentation-client.ts) instrumentation.
export async function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Low sample rate — this is a small internal sales tool, not a
    // high-traffic app; 10% of requests is plenty to catch real problems
    // without burning through Sentry's free-tier event quota.
    tracesSampleRate: 0.1,
  });
}

// Reports errors from Server Components, Route Handlers, and Server Actions
// that Next.js's own error handling catches — this is the modern
// instrumentation.ts-based hook (see AGENTS.md: this Next.js version differs
// from training data; confirmed against node_modules/next/dist/docs before
// writing this) rather than the older sentry.server.config.ts pattern.
export const onRequestError = Sentry.captureRequestError;
