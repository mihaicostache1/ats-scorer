import { describe, expect, it } from "vitest";
import { describeUserActionError } from "./user-errors";

describe("describeUserActionError", () => {
  it("explains the last-admin refusal for a role change", () => {
    const result = describeUserActionError(
      "role",
      { detail: "The last active admin cannot be removed" },
      409
    );
    expect(result.title).toBe("At least one active admin is required");
    expect(result.description).toMatch(/only active admin/i);
    expect(result.description).toMatch(/role can't be changed/i);
  });

  it("explains the last-admin refusal for a deactivation", () => {
    const result = describeUserActionError(
      "deactivate",
      { detail: "The last active admin cannot be removed" },
      409
    );
    expect(result.title).toBe("At least one active admin is required");
    expect(result.description).toMatch(/can't be deactivated/i);
  });

  it("explains self-deactivation", () => {
    const result = describeUserActionError(
      "deactivate",
      { detail: "You cannot deactivate your own account" },
      409
    );
    expect(result.title).toBe("You can't deactivate your own account");
    expect(result.description).toMatch(/another admin/i);
  });

  it("words 403 and 404", () => {
    expect(
      describeUserActionError("role", { detail: "Admin privileges required" }, 403).title
    ).toBe("Only admins can manage users");
    expect(describeUserActionError("deactivate", { detail: "User was not found" }, 404).title).toBe(
      "This user no longer exists in your workspace"
    );
  });

  it("falls back to the API's own text, and to a generic one for server errors", () => {
    expect(describeUserActionError("role", { detail: "Something odd" }, 400).title).toBe(
      "Something odd"
    );
    expect(describeUserActionError("role", undefined, 500).title).toMatch(/server ran into/i);
  });
});
