import type { NextConfig } from "next";

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

export default nextConfig;
