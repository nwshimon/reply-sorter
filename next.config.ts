import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every page reads live data from Postgres
  // (corrections must show on the next load), so pages opt into per-request rendering
  // with `export const dynamic = "force-dynamic"` instead of Suspense + "use cache".
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
