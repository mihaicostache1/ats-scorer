import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockCandidates } from "@/mocks/fixtures/candidates";

const { push, replace, listCandidates, url } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  listCandidates: vi.fn(),
  url: { search: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/candidates",
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock("@/api", () => ({ listCandidates }));

import { CandidatesList } from "./candidates-list";

function page(items = mockCandidates.slice(0, 3), over: Record<string, unknown> = {}) {
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
  listCandidates.mockResolvedValue(page());
});

describe("CandidatesList", () => {
  it("shows a loading state, then the candidates and the paging summary", async () => {
    const { container } = render(<CandidatesList />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();

    expect(await screen.findByRole("link", { name: "Alex Mercer" })).toHaveAttribute(
      "href",
      `/candidates/${mockCandidates[0].id}`
    );
    expect(screen.getByText("Showing 1 – 10 of 25 candidates")).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeInTheDocument();
  });

  it("reads the search text and page from the URL", async () => {
    url.search = "?q=priya&page=2";
    render(<CandidatesList />);

    await waitFor(() =>
      expect(listCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ search: "priya", page: 2, per_page: 10 })
      )
    );
    expect(screen.getByRole("searchbox", { name: /search candidates/i })).toHaveValue("priya");
  });

  it("falls back to page 1 for an invalid page param", async () => {
    url.search = "?page=abc";
    render(<CandidatesList />);
    await waitFor(() =>
      expect(listCandidates).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    );
  });

  it("writes the page to the URL when paging", async () => {
    const user = userEvent.setup();
    render(<CandidatesList />);
    await user.click(await screen.findByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenCalledWith("/candidates?page=2", { scroll: false });
  });

  it("writes the search text to the URL after a pause, resetting the page", async () => {
    url.search = "?page=2";
    listCandidates.mockResolvedValue(page(mockCandidates.slice(0, 3), { page: 2 }));
    const user = userEvent.setup();
    render(<CandidatesList />);
    await user.type(screen.getByRole("searchbox", { name: /search candidates/i }), "ali");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/candidates?q=ali", { scroll: false })
    );
  });

  it("shows an empty state when there are no candidates at all", async () => {
    listCandidates.mockResolvedValue(page([], { total_items: 0, total_pages: 1, has_next: false }));
    render(<CandidatesList />);
    expect(await screen.findByText("No candidates yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("shows a different empty state for a search with no matches, and can clear it", async () => {
    url.search = "?q=zzz";
    listCandidates.mockResolvedValue(page([], { total_items: 0, total_pages: 1, has_next: false }));
    const user = userEvent.setup();
    render(<CandidatesList />);
    expect(await screen.findByText("No candidates match your search")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(push).toHaveBeenCalledWith("/candidates", { scroll: false });
  });

  it("shows an error state and retries", async () => {
    listCandidates.mockResolvedValueOnce({
      data: undefined,
      error: { detail: "Database is down" },
      response: { status: 503 },
    });
    const user = userEvent.setup();
    render(<CandidatesList />);

    expect(await screen.findByText("Couldn't load candidates")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("link", { name: "Alex Mercer" })).toBeInTheDocument();
    expect(listCandidates).toHaveBeenCalledTimes(2);
  });

  it("shows an error state when the request itself fails", async () => {
    listCandidates.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<CandidatesList />);
    expect(await screen.findByText("Couldn't load candidates")).toBeInTheDocument();
  });
});
