/**
 * Browser MSW entry — started by MockProvider in the browser via setupWorker.
 * Imported only when NEXT_PUBLIC_MOCK_API=true.
 */
import { setupWorker } from "msw/browser";
import { authHandlers, sessionGuard } from "./handlers/auth";
import { jobHandlers } from "./handlers/jobs";
import { candidateHandlers } from "./handlers/candidates";
import { applicationHandlers } from "./handlers/applications";

export const worker = setupWorker(
  sessionGuard,
  ...authHandlers,
  ...jobHandlers,
  ...candidateHandlers,
  ...applicationHandlers
);

const globalForMsw = globalThis as typeof globalThis & { __mswStarted?: Promise<unknown> };

/**
 * Starts the worker at most once per page load. React Strict Mode runs effects twice in dev,
 * and MSW throws if `start()` is called on an already enabled worker.
 */
export function startWorker() {
  globalForMsw.__mswStarted ??= worker.start({
    onUnhandledFrame: "bypass", // let real assets through
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
  return globalForMsw.__mswStarted;
}
