import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // resvg is a native module; keep it out of the bundle and ship the font files with the server code.
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
};

export default nextConfig;
