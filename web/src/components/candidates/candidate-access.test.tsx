import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { session } = vi.hoisted(() => ({ session: { can: vi.fn(() => true) } }));
vi.mock("@/providers/session-provider", () => ({ useSession: () => session }));

import { CandidateAccess } from "./candidate-access";

beforeEach(() => {
  session.can.mockReset();
});

describe("CandidateAccess", () => {
  it("renders the page for roles that can read candidates", () => {
    session.can.mockReturnValue(true);
    render(
      <CandidateAccess>
        <p>candidate list</p>
      </CandidateAccess>
    );
    expect(screen.getByText("candidate list")).toBeInTheDocument();
    expect(session.can).toHaveBeenCalledWith("candidate:read");
  });

  it("shows a no-access message instead, without rendering the page", () => {
    session.can.mockReturnValue(false);
    render(
      <CandidateAccess>
        <p>candidate list</p>
      </CandidateAccess>
    );
    expect(screen.queryByText("candidate list")).not.toBeInTheDocument();
    expect(screen.getByText("You don't have access to candidates")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to jobs" })).toHaveAttribute("href", "/jobs");
  });
});
