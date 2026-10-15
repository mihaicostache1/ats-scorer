import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination, type PaginationProps } from "./pagination";

/** Example component test: render with props, interact like a user, assert on what is visible. */
function renderPagination(props: Partial<PaginationProps> = {}) {
  const onPageChange = vi.fn();
  render(
    <Pagination
      page={2}
      perPage={10}
      totalItems={25}
      totalPages={3}
      noun="jobs"
      onPageChange={onPageChange}
      {...props}
    />
  );
  return { onPageChange };
}

describe("Pagination", () => {
  it("summarises the visible range and the current page", () => {
    renderPagination();

    expect(screen.getByText("Showing 11 – 20 of 25 jobs")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("clamps the end of the range on the last page", () => {
    renderPagination({ page: 3 });

    expect(screen.getByText("Showing 21 – 25 of 25 jobs")).toBeInTheDocument();
  });

  it("asks for the previous and next page when the buttons are clicked", async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderPagination();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 3);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1);
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { rerender } = render(
      <Pagination
        page={1}
        perPage={10}
        totalItems={25}
        totalPages={3}
        noun="jobs"
        onPageChange={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    rerender(
      <Pagination
        page={3}
        perPage={10}
        totalItems={25}
        totalPages={3}
        noun="jobs"
        onPageChange={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("renders nothing when there are no results", () => {
    renderPagination({ totalItems: 0, totalPages: 1, page: 1 });

    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });
});
