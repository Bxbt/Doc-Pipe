/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // html-to-docx (and its jszip/image-size deps) must run at runtime, not be
  // bundled by webpack for the route handler that generates .docx exports.
  experimental: {
    serverComponentsExternalPackages: ["html-to-docx"],
  },
};

export default nextConfig;
