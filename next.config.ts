import type { NextConfig } from "next";

// Set by the GitHub Pages deploy workflow (e.g. "/ver" when served at
// ejhong.github.io/ver). Empty for local dev and custom domains.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
