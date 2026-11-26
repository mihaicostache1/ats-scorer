import { NETWORK_ERROR_MESSAGE, parseApiFailure } from "@/lib/api-error";

/** A failed user action, worded for the person who triggered it. */
export interface UserActionError {
  title: string;
  description?: string;
}

export type UserAction = "role" | "deactivate";

/**
 * Turns the API's answer to a role change or deactivation into a clear message. The API's own
 * 409 texts ("The last active admin cannot be removed", "You cannot deactivate your own account")
 * are accurate but terse; here they say what to do next. Anything unrecognised falls back to the
 * API's text through `parseApiFailure`.
 */
export function describeUserActionError(
  action: UserAction,
  error: unknown,
  status?: number
): UserActionError {
  const { message } = parseApiFailure(error, status);
  const text = message.toLowerCase();

  if (status === 409 && text.includes("last active admin")) {
    return {
      title: "At least one active admin is required",
      description:
        action === "role"
          ? "This is the only active admin, so their role can't be changed. Make another user an admin first."
          : "This is the only active admin, so they can't be deactivated. Make another user an admin first.",
    };
  }
  if (status === 409 && text.includes("own account")) {
    return {
      title: "You can't deactivate your own account",
      description: "Ask another admin to deactivate it if you need to leave the workspace.",
    };
  }
  if (status === 403) {
    return { title: "Only admins can manage users" };
  }
  if (status === 404) {
    return {
      title: "This user no longer exists in your workspace",
      description: "Refresh the list to see the current members.",
    };
  }
  return { title: message };
}

/** For a request that never reached the server (offline, API down). */
export const NETWORK_ACTION_ERROR: UserActionError = { title: NETWORK_ERROR_MESSAGE };
