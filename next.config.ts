import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ['192.168.41.224'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
