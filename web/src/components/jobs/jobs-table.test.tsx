import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { mockJobs } from "@/mocks/fixtures/jobs";
import { Skeleton } from "@/components/ui/skeleton";
import { JobsTable } from "./jobs-table";

describe("JobsTable loading and entrance", () => {
  const bodyRows = () => screen.getAllByRole("row").slice(1); // the first row is the header

  it("brings each row in a step after the one before it", () => {
    render(<JobsTable jobs={mockJobs.slice(0, 4)} />);

    const rows = bodyRows();
    expect(rows).toHaveLength(4);
    rows.forEach((row, index) => {
      expect(row.className).toContain("animate-row-in");
      expect(row.style.getPropertyValue("--i")).toBe(String(index));
    });
  });

  it("shows placeholder rows while loading, and no data rows yet", () => {
    const { container } = render(<JobsTable jobs={[]} isLoading />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton-shimmer").length).toBeGreaterThan(10);
    // The placeholders don't use the entrance animation: they are the thing being replaced.
    expect(container.querySelector("tbody .animate-row-in")).not.toBeInTheDocument();
  });

  it("does not replay the entrance for rows that were already there", () => {
    const jobs = mockJobs.slice(0, 3);
    const { rerender } = render(<JobsTable jobs={jobs} />);
    const before = bodyRows();

    // Same jobs while a newer page loads in the background (the table dims, rows stay).
    rerender(<JobsTable jobs={jobs} isRefreshing />);

    // React keeps the same elements, so a CSS animation has no reason to start again.
    bodyRows().forEach((row, index) => expect(row).toBe(before[index]));
  });
});

describe("Skeleton", () => {
  it("sweeps a highlight across, rather than pulsing", () => {
    render(<Skeleton className="h-4 w-20" data-testid="skeleton" />);
    const skeleton = screen.getByTestId("skeleton");

    expect(skeleton.className).toContain("skeleton-shimmer");
    expect(skeleton.className).not.toContain("animate-pulse");
  });
});
