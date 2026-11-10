import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { toast, ToastProvider } from "./toast";

/** The real provider, not a mock: this is about how a toast leaves. */

const EXIT_MS = 200;

beforeEach(() => {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <p>the app</p>
    </ToastProvider>
  );
});
afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("a toast leaving", () => {
  it("slides in, with the enter animation and not the exit one", () => {
    act(() => toast.success("Saved", "Done"));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Saved");
    expect(alert).not.toHaveAttribute("data-leaving");
    expect(alert.className).toContain("animate-in");
    expect(alert.className).not.toContain("animate-toast-out");
  });

  it("plays its exit before it is removed, when dismissed", () => {
    act(() => toast.success("Saved", "Done"));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    // Still on screen, now leaving: it can't be clicked, and it plays the exit animation.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-leaving");
    expect(alert.className).toContain("animate-toast-out");
    expect(alert.className).toContain("pointer-events-none");

    advance(EXIT_MS - 1);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    advance(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the same way when it times out on its own", () => {
    act(() => toast({ title: "Heads up", description: "Going soon", duration: 1000 }));

    advance(999);
    expect(screen.getByRole("alert")).not.toHaveAttribute("data-leaving");

    advance(2);
    expect(screen.getByRole("alert")).toHaveAttribute("data-leaving");

    advance(EXIT_MS + 1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("only takes away the toast that was dismissed", () => {
    act(() => {
      toast({ title: "First", duration: 0 });
      toast({ title: "Second", duration: 0 });
    });
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    advance(EXIT_MS + 1);

    const left = screen.getAllByRole("alert");
    expect(left).toHaveLength(1);
    expect(left[0]).toHaveTextContent("Second");
    expect(left[0]).not.toHaveAttribute("data-leaving");
  });

  it("copes with being dismissed twice (a click just as the timer fires)", () => {
    act(() => toast({ title: "Once", duration: 300 }));

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    advance(300);
    advance(EXIT_MS + 1);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
