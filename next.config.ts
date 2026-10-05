import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in a parent dir otherwise confuses
  // Turbopack's root inference.
  turbopack: { root: path.resolve() },
  // Portable by construction (ADR-0001): standard Node output, no Vercel-only APIs.
  // Not on Vercel: Next 16.3 + standalone fails Vercel's onBuildComplete with
  // ENOENT .next/next-server.js.nft.json (vercel/next.js#96646). Vercel sets VERCEL=1
  // at build time and does not use the standalone folder anyway.
  output: process.env.VERCEL ? undefined : "standalone",
  // `sharp` (photo downscale on ingest) is a native module — keep it external.
  serverExternalPackages: ["sharp"],
  // Lets the role guards answer a wrong-role request with a real 403 page (forbidden()), as
  // docs/auth-and-permissions.md section 10 asks, instead of redirecting to a page that says 200.
  experimental: { authInterrupts: true },
  images: {
    // Curated listing photos are served from Vercel Blob (ADR-0001). The exact
    // hostname is set once the store exists — see .env.example / docs/spec/seed-data.md.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Seed / demo placeholder images only.
      { protocol: "https", hostname: "placehold.co" },
    ],
  },
};

export default withNextIntl(nextConfig);
