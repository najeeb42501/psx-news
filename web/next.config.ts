import type { NextConfig } from "next";

// Security headers on every response. The site loads nothing from other domains (fonts are
// self-hosted by next/font, data is fetched on the server), so the policy can stay strict.
// Next.js needs inline scripts for hydration ('unsafe-inline'); dev mode also needs eval.
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false, // no Next.js "N" badge, even in development
  // resvg is a native module; keep it out of the bundle and ship the font files with the server code.
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  async redirects() {
    // The calendar moved from /upcoming (query strings such as ?kind=board are kept).
    return [{ source: "/upcoming", destination: "/calendar", permanent: true }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
