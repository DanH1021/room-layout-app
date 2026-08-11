import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // pdf-to-img (lib/pdf/rasterizePlan.ts) wraps pdfjs-dist, which resolves
  // its own asset paths (standard fonts, cmaps) and an optional native
  // canvas binary (@napi-rs/canvas) at runtime via fs/require — bundling
  // these breaks that resolution, so they must run as plain Node
  // dependencies instead of being pulled into the serverless function
  // bundle.
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "@napi-rs/canvas"],
  // serverExternalPackages only stops Next from *bundling* these — it
  // doesn't guarantee Next's output file tracer actually copies them into
  // the deployed serverless function. pdfjs-dist requires @napi-rs/canvas
  // conditionally (wrapped in try/catch), so the tracer's static analysis
  // can't see the dependency and silently drops it from the Vercel build,
  // producing "Cannot find module '@napi-rs/canvas'" only in production —
  // it's present in node_modules locally, just not copied into the
  // function bundle. Force-include it (and its per-platform native
  // binary packages, e.g. @napi-rs/canvas-linux-x64-gnu) explicitly for
  // the one route that rasterizes PDFs.
  outputFileTracingIncludes: {
    "/api/rooms/plan-uploads": [
      "./node_modules/@napi-rs/canvas*/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/pdf-to-img/**/*",
    ],
  },
};

// withSentryConfig wraps the build to also upload source maps to Sentry (so
// stack traces in the dashboard show real code, not minified output) — but
// that upload step only runs when SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN
// are set. Without them it's a documented no-op wrapper: the build proceeds
// normally, error reporting still works via instrumentation.ts/
// instrumentation-client.ts (those only need NEXT_PUBLIC_SENTRY_DSN), you
// just get minified stack traces in Sentry until the auth token is added.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Not disableLogger/webpack.treeshake.removeDebugLogging — both are
  // webpack-only and this app builds with Turbopack (see build output).
});
