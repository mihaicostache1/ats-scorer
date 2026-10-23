/**
 * Role → action matrix, from docs/scope.md §4. This only decides what the UI shows;
 * the API enforces the same rules and stays the source of truth (it answers 403).
 *
 * `candidate:read` is the full candidate list and profiles. Viewers only get shortlisted candidates
 * per job (US-13), so they are kept out of those pages.
 */

export type Role = "admin" | "recruiter" | "viewer";

export type Action =
  | "job:write"
  | "candidate:read"
  | "candidate:write"
  | "application:move"
  | "user:manage"
  | "audit:read";

const PERMISSIONS: Record<Role, readonly Action[]> = {
  admin: [
    "job:write",
    "candidate:read",
    "candidate:write",
    "application:move",
    "user:manage",
    "audit:read",
  ],
  recruiter: ["job:write", "candidate:read", "candidate:write", "application:move"],
  viewer: [],
};

export function can(role: Role | undefined, action: Action): boolean {
  return role !== undefined && PERMISSIONS[role]?.includes(action) === true;
}
