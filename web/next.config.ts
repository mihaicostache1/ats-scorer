import "./src/env";
import type { NextConfig } from "next";
import { pageExtensionsFor } from "./src/lib/dev-routes";

/** A function, so the config knows which phase it is loaded for (dev server, build or start). */
export default function nextConfig(phase: string): NextConfig {
  return {
    /* config options here */
    output: "standalone",
    // `page.dev.tsx` / `route.dev.ts` are routes in `next dev` only (see src/lib/dev-routes.ts).
    pageExtensions: pageExtensionsFor(phase),
    turbopack: {
      resolveAlias: {
        // msw's package exports mark "./browser" as unavailable under the "node" condition, which
        // Turbopack also applies while bundling the SSR pass of client components. Point at the
        // file directly; it is only ever executed in the browser (see MockProvider).
        "msw/browser": "./node_modules/msw/lib/browser/index.js",
      },
    },
  };
}
