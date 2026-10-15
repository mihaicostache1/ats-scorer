"use client";

import * as React from "react";
import { env } from "@/env";

/**
 * Conditionally starts the MSW Service Worker in the browser when
 * `NEXT_PUBLIC_MOCK_API=true`.
 *
 * The worker module is dynamically imported so it is never bundled for
 * production builds where mocking is disabled.
 *
 * Place this as high in the tree as possible (e.g. `app/layout.tsx`).
 */
export function MockProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(!env.NEXT_PUBLIC_MOCK_API);

  React.useEffect(() => {
    if (!env.NEXT_PUBLIC_MOCK_API) return;

    let mounted = true;

    async function startWorker() {
      const { startWorker } = await import("@/mocks/browser");
      await startWorker();
      if (mounted) setReady(true);
    }

    startWorker().catch(console.error);

    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    // Avoids a flash of un-mocked requests before the Service Worker activates.
    return null;
  }

  return <>{children}</>;
}
