/**
 * Role → action matrix, from docs/scope.md §4. This only decides what the UI shows;
 * the API enforces the same rules and stays the source of truth (it answers 403).
 *
 * `candidate:read` is the full candidate list and profiles. Viewers only get shortlisted candidates
 * per job (US-13), so they are kept out of those pages.
 *
 * `cv-review:read` opens the parsed-CV review screen (F-11), which every role may look at. Roles
 * without `candidate:write` see it read-only.
 */

export type Role = "admin" | "recruiter" | "viewer";

export type Action =
  | "job:write"
  | "candidate:read"
  | "candidate:write"
  | "cv-review:read"
  | "application:move"
  | "user:manage"
  | "audit:read";

const PERMISSIONS: Record<Role, readonly Action[]> = {
  admin: [
    "job:write",
    "candidate:read",
    "candidate:write",
    "cv-review:read",
    "application:move",
    "user:manage",
    "audit:read",
  ],
  recruiter: [
    "job:write",
    "candidate:read",
    "candidate:write",
    "cv-review:read",
    "application:move",
  ],
  viewer: ["cv-review:read"],
};

export function can(role: Role | undefined, action: Action): boolean {
  return role !== undefined && PERMISSIONS[role]?.includes(action) === true;
}
