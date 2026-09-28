import type { NextConfig } from "next";

// Serve under /huesroom so both huesroom.vercel.app/huesroom/ and hue.onl/huesroom/ resolve.
// Override with NEXT_PUBLIC_BASE_PATH="" for a root-hosted dev build.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/huesroom";

// STATIC_EXPORT=1 writes a plain static site to out/ (the game is fully client-side), so it
// can be dropped into the static hue.onl site as a folder.
const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  ...(process.env.STATIC_EXPORT ? { output: "export" as const, trailingSlash: true } : {}),
};

export default nextConfig;
