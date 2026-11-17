import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/csp";

const nextConfig: NextConfig = {
  // development prints each Server Function call with its arguments; private mode's one action takes the dropped pages
  logging: { serverFunctions: false },
  // one policy on every route (docs/features/snap-incognito.md §9); the private route also sends no referrer and is never cached
  async headers() {
    return [
      { source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy(process.env.NODE_ENV !== "production") }] },
      { source: "/private", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
  /* config options here */
  cacheComponents: true,
  // fixtures are read at runtime (demo bill, fixture extractor); make sure the serverless bundle carries them
  outputFileTracingIncludes: { "/**": ["./fixtures/**/*"] },
  // uploads: a phone photo of a bill plus multipart overhead
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
