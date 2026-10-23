import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { ThemeProvider } from "@/providers/theme-provider";
import { ThemeToggle } from "./theme-toggle";

const html = document.documentElement;
const renderToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );
const button = () => screen.getByRole("button", { name: "Theme" });

beforeEach(() => {
  localStorage.clear();
  html.className = "";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("ThemeToggle", () => {
  it("offers Light, Dark and System, with the current choice checked", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(button());

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitemradio").map((item) => item.textContent)).toEqual([
      "Light",
      "Dark",
      "System",
    ]);
    expect(screen.getByRole("menuitemradio", { name: "System" })).toBeChecked();
  });

  it("switches to dark when Dark is picked, and remembers it", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(button());
    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));

    expect(html).toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    await user.click(button());
    expect(await screen.findByRole("menuitemradio", { name: "Dark" })).toBeChecked();
  });

  it("can be used with the keyboard alone, and returns focus to the button", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.tab();
    expect(button()).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");

    // Move to "Dark" and choose it.
    await waitFor(() => expect(screen.getAllByRole("menuitemradio")[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");

    expect(html).toHaveClass("dark");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(button()).toHaveFocus();
  });

  it("closes with Escape without changing anything", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(button());
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(html).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("works without a provider (nothing happens, nothing breaks)", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(button());
    await user.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
    expect(button()).toBeInTheDocument();
  });
});
