import type { NextConfig } from "next";

// Optional sub-path hosting (e.g. hue.onl/room): NEXT_PUBLIC_BASE_PATH=/room next build
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
};

export default nextConfig;
