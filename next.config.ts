import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in a parent dir otherwise confuses
  // Turbopack's root inference.
  turbopack: { root: path.resolve() },
  // Portable by construction (ADR-0001): standard Node output, no Vercel-only APIs.
  output: "standalone",
  // `sharp` (photo downscale on ingest) is a native module — keep it external.
  serverExternalPackages: ["sharp"],
  // Lets the role guards answer a wrong-role request with a real 403 page (forbidden()), as
  // docs/auth-and-permissions.md section 10 asks, instead of redirecting to a page that says 200.
  experimental: {
    authInterrupts: true,
    // Admin photo upload (issue #37): the browser shrinks each photo and never sends more
    // than 4 MB (lib/photo-upload-limits.ts); the extra room covers the multipart overhead.
    // It stays under the 4.5 MB a hosted function accepts per request.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
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
