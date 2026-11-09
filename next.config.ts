import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
