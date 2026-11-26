import type { components } from "@/api/generated/schema";
import { MOCK_ORG_ID, MOCK_PASSWORD, type MockAccount } from "./auth";

type UserRole = components["schemas"]["UserRole"];

/**
 * Extra members of the demo org, so the user-management page (F-12) has something to list.
 * `admin@demo.com` stays the ONLY admin on purpose: demoting or deactivating it reproduces the
 * "last admin" error. `former@demo.com` is inactive and cannot sign in.
 */
export const mockMembers: MockAccount[] = [
  member("a0000000-0000-4000-a000-000000000004", "Priya Raman", "priya@demo.com", "recruiter"),
  member("a0000000-0000-4000-a000-000000000005", "Tomás Herrera", "tomas@demo.com", "recruiter"),
  member("a0000000-0000-4000-a000-000000000006", "Aisha Bello", "aisha@demo.com", "viewer"),
  member(
    "a0000000-0000-4000-a000-000000000007",
    "Jonas Weber",
    "former@demo.com",
    "recruiter",
    false
  ),
];

function member(
  id: string,
  full_name: string,
  email: string,
  role: UserRole,
  is_active = true
): MockAccount {
  return {
    password: MOCK_PASSWORD,
    user: { id, org_id: MOCK_ORG_ID, email, full_name, role, is_active },
  };
}

/**
 * Invitation tokens that always exist in mock mode, one per state, for trying the accept-invite
 * page: open `/accept-invite#token=<token>`. Mock-only: the real API has no such fixed tokens.
 */
export const MOCK_INVITE_TOKENS = {
  valid: "demo-valid-invite",
  expired: "demo-expired-invite",
  used: "demo-used-invite",
} as const;

/** How long a new invitation lives, like the API's default `USER_INVITE_EXPIRE_HOURS`. */
export const INVITE_TTL_HOURS = 48;
