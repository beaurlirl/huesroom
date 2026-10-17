import type { NextConfig } from "next";

// Optional sub-path hosting (e.g. hue.onl/huesroom): NEXT_PUBLIC_BASE_PATH=/huesroom next build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

// STATIC_EXPORT=1 writes a plain static site to out/ (the game is fully client-side), so it
// can be dropped into the static hue.onl site as a folder.
const staticExport = !!process.env.STATIC_EXPORT;

// The big files carry this in their address (src/config.ts `versioned`): the commit on Vercel (every deploy is a new one), else the time the dev server or the build started.
// A static export leaves it out: the app's files are local, and a plain static host cannot be told to cache them for long.
const assetVersion = staticExport ? "" : (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 10) || String(Date.now());

// Where the big files live. In production they are kept for a year (immutable): their address changes with every deploy, so an update still reaches everyone, and a returning
// player's browser does not ask about each of them again. Not in development, where a model is edited and reloaded all the time. (The draco decoder has a fixed address and never changes.)
const LONG_CACHE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
const BIG_FILES = ["/levels/:path*", "/room/:path*", "/hue/:path*", "/audio/:path*", "/fx/:path*", "/draco/:path*"];

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_ASSET_VERSION: assetVersion },
  ...(staticExport ? { output: "export" as const, trailingSlash: true } : {}),
  ...(!staticExport && process.env.NODE_ENV === "production" ? { headers: async () => BIG_FILES.map((source) => ({ source, headers: LONG_CACHE })) } : {}),
};

export default nextConfig;
