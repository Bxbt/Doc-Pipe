/** @type {import('next').NextConfig} */

// Baseline security headers applied to every response. CSP is intentionally
// omitted here — the block editor (BlockNote) + Mermaid rely on inline styles
// and data: URIs, so a Content-Security-Policy needs its own tested rollout
// (start report-only) rather than a blind add.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Defense-in-depth; Cloudflare (which terminates TLS) can also enforce HSTS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version.
  poweredByHeader: false,
  // html-to-docx (and its jszip/image-size deps) must run at runtime, not be
  // bundled by webpack for the route handler that generates .docx exports.
  // (Renamed from experimental.serverComponentsExternalPackages in Next 15.)
  serverExternalPackages: ["html-to-docx", "docxtemplater", "pizzip"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
