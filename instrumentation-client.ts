import * as Sentry from "@sentry/nextjs";

// Client-side half of the Sentry setup — see instrumentation.ts for the
// server-side half and why this is safe with no DSN configured. This file
// convention (instead of the older sentry.client.config.ts) is what this
// Next.js version's docs specify for client instrumentation.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

// Lets Sentry tag errors/traces with which client-side navigation they
// happened during — the SDK requires this export explicitly rather than
// inferring it, per the build's own "ACTION REQUIRED" warning.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
