import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { mockJobs } from "@/mocks/fixtures/jobs";

const { push, replace, listJobs, url } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  listJobs: vi.fn(),
  url: { search: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/jobs",
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock("@/api", () => ({ listJobs }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => ({ can: () => true }) }));

import { JobsList } from "./jobs-list";

function page(items = mockJobs.slice(0, 3), over: Record<string, unknown> = {}) {
  return {
    data: {
      items,
      pagination: {
        page: 1,
        per_page: 10,
        total_items: 25,
        total_pages: 3,
        has_next: true,
        has_prev: false,
        ...over,
      },
    },
    response: { status: 200 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  url.search = "";
  listJobs.mockResolvedValue(page());
});

describe("JobsList", () => {
  it("shows the jobs and the paging summary", async () => {
    render(<JobsList />);
    expect(await screen.findByText(mockJobs[0].title)).toBeInTheDocument();
    expect(screen.getByText("Showing 1 – 10 of 25 jobs")).toBeInTheDocument();
  });

  describe("when the real API reports zero pages for an empty list", () => {
    // The real API answers `total_pages: 0` when nothing matches; the mock always says 1. Zero pages
    // used to read as "past the last page", so the page redirected forever and sat on skeleton rows.
    const empty = (over: Record<string, unknown> = {}) =>
      page([], { total_items: 0, total_pages: 0, has_next: false, ...over });

    it("shows the empty state, with a way to create the first job, instead of loading forever", async () => {
      listJobs.mockResolvedValue(empty());
      const { container } = render(<JobsList />);

      expect(await screen.findByText("No jobs created yet")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Create Your First Job" })).toHaveAttribute(
        "href",
        "/jobs/new"
      );
      expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it("shows 'no matches' when a filter is on", async () => {
      url.search = "?status=draft";
      listJobs.mockResolvedValue(empty());
      render(<JobsList />);
      expect(await screen.findByText("No jobs match your filters")).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it("still moves a stale page back to page 1, never to page 0", async () => {
      url.search = "?page=5";
      listJobs.mockResolvedValue(empty({ page: 5 }));
      render(<JobsList />);

      await waitFor(() => expect(replace).toHaveBeenCalled());
      for (const [target] of replace.mock.calls) expect(target).not.toContain("page=0");
    });
  });

  it("moves a stale page back to the last page when the list is not empty", async () => {
    url.search = "?page=9";
    listJobs.mockResolvedValue(page(mockJobs.slice(0, 3), { page: 9, total_pages: 3 }));
    render(<JobsList />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/jobs?page=3", { scroll: false }));
  });
});
