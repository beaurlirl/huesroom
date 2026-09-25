import type { NextConfig } from "next";

// Optional sub-path hosting (e.g. hue.onl/huesroom): NEXT_PUBLIC_BASE_PATH=/huesroom next build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
};

export default nextConfig;
