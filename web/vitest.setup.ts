import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest has no globals here, so RTL's automatic cleanup is wired up by hand.
afterEach(() => {
  cleanup();
});
