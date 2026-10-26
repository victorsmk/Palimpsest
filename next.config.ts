import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The local demo's database (npm run dev:demo) is loaded by Node as it is, not packed into the server bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  async redirects() {
    // The Studio started life as /prototype.
    return [{ source: '/prototype', destination: '/studio', permanent: false }];
  },
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
