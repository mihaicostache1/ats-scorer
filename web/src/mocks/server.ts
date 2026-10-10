/**
 * Node.js (server / test) MSW entry — usable in future Jest/Vitest tests or
 * Next.js server-side instrumentation without any browser globals.
 *
 * Usage (Jest / Vitest):
 * ```ts
 * import { server } from "@/mocks/server";
 * beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 * ```
 */
import { setupServer } from "msw/node";
import { authHandlers } from "./handlers/auth";
import { jobHandlers } from "./handlers/jobs";
import { candidateHandlers } from "./handlers/candidates";
import { applicationHandlers } from "./handlers/applications";

export const server = setupServer(
  ...authHandlers,
  ...jobHandlers,
  ...candidateHandlers,
  ...applicationHandlers
);
