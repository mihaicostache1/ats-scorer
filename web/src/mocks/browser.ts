/**
 * Browser MSW entry — started by MockProvider in the browser via setupWorker.
 * Imported only when NEXT_PUBLIC_MOCK_API=true.
 */
import { setupWorker } from "msw/browser";
import { authHandlers } from "./handlers/auth";
import { jobHandlers } from "./handlers/jobs";
import { candidateHandlers } from "./handlers/candidates";
import { applicationHandlers } from "./handlers/applications";

export const worker = setupWorker(
  ...authHandlers,
  ...jobHandlers,
  ...candidateHandlers,
  ...applicationHandlers
);
