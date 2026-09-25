import type { NextConfig } from "next";

// Optional sub-path hosting (e.g. hue.onl/huesroom): NEXT_PUBLIC_BASE_PATH=/huesroom next build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

// STATIC_EXPORT=1 writes a plain static site to out/ (the game is fully client-side), so it
// can be dropped into the static hue.onl site as a folder.
const nextConfig: NextConfig = {
  basePath,
  ...(process.env.STATIC_EXPORT ? { output: "export" as const, trailingSlash: true } : {}),
};

export default nextConfig;
