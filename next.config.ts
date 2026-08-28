import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/data",
        headers: [{ key: "Accept-Ranges", value: "bytes" }],
      },
    ];
  },
};

export default nextConfig;
