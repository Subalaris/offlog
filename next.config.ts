import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  typedRoutes: false,
  serverExternalPackages: ["all-the-cities"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
});

export default nextConfig;
