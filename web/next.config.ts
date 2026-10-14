import "./src/env";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  turbopack: {
    resolveAlias: {
      // msw's package exports mark "./browser" as unavailable under the "node" condition, which
      // Turbopack also applies while bundling the SSR pass of client components. Point at the
      // file directly; it is only ever executed in the browser (see MockProvider).
      "msw/browser": "./node_modules/msw/lib/browser/index.js",
    },
  },
};

export default nextConfig;
