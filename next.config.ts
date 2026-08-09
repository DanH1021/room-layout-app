import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-to-img (lib/pdf/rasterizePlan.ts) wraps pdfjs-dist, which resolves
  // its own asset paths (standard fonts, cmaps) and an optional native
  // canvas binary (@napi-rs/canvas) at runtime via fs/require — bundling
  // these breaks that resolution, so they must run as plain Node
  // dependencies instead of being pulled into the serverless function
  // bundle.
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
