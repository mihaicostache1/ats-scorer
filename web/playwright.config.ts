import { defineConfig, devices } from "@playwright/test";

/** Own port, so it never collides with a `next dev` server on 3000/3001. */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Tests run against the production build with the MSW mocks switched on, so no API,
  // database or Docker is needed. NEXT_PUBLIC_* values are inlined at build time, which is why
  // the variable is set for the build too, not just for `next start`.
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { NEXT_PUBLIC_MOCK_API: "true" },
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
