import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: "bottom-right",
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
