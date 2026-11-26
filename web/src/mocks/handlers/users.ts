import { http, HttpResponse } from "msw";
import type { components } from "@/api/generated/schema";
import type { MockAccount } from "../fixtures/auth";
import { INVITE_TTL_HOURS, MOCK_INVITE_TOKENS } from "../fixtures/users";
import { accountStore, sessionAccount } from "./auth";
import { BASE, detailResponse, paginate, wait } from "./utils";

/**
 * Stand-in for the user-management API (B-15) until it ships. It copies the real service
 * (`api/app/services/user_service.py`): the same routes, status codes and `detail` messages, so the
 * UI is written against the real behaviour. Errors use FastAPI's `{ detail }` body.
 */

type UserRole = components["schemas"]["UserRole"];
type UserProfile = components["schemas"]["UserProfileResponse"];

const ROLES: readonly UserRole[] = ["admin", "recruiter", "viewer"];
const HOUR_MS = 3_600_000;

export const LAST_ADMIN_DETAIL = "The last active admin cannot be removed";
export const SELF_DEACTIVATE_DETAIL = "You cannot deactivate your own account";
export const INVALID_INVITE_DETAIL = "Invalid or expired invitation";

interface Invitation {
  id: string;
  token: string;
  orgId: string;
  email: string;
  role: UserRole;
  expiresAt: number;
  usedAt: number | null;
  revoked: boolean;
}

function seedInvitations(orgId: string): Invitation[] {
  const now = Date.now();
  const base = { orgId, role: "recruiter" as const, revoked: false };
  return [
    {
      ...base,
      id: crypto.randomUUID(),
      token: MOCK_INVITE_TOKENS.valid,
      email: "new.colleague@demo.com",
      expiresAt: now + INVITE_TTL_HOURS * HOUR_MS,
      usedAt: null,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      token: MOCK_INVITE_TOKENS.expired,
      email: "late.invitee@demo.com",
      expiresAt: now - HOUR_MS,
      usedAt: null,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      token: MOCK_INVITE_TOKENS.used,
      email: "already.joined@demo.com",
      expiresAt: now + INVITE_TTL_HOURS * HOUR_MS,
      usedAt: now - HOUR_MS,
    },
  ];
}

let demoOrgId: string | null = null;
let invitations: Invitation[] = [];

/** The seeded invitations belong to the demo org, which is the org of the first admin. */
function ensureSeeded() {
  if (demoOrgId) return;
  const admin = accountStore.all().find((a) => a.user.role === "admin");
  demoOrgId = admin?.user.org_id ?? "";
  invitations = seedInvitations(demoOrgId);
}

/** Resets accounts and invitations to their starting state (used by tests). */
export function resetUserStore() {
  accountStore.reset();
  demoOrgId = null;
  invitations = [];
}

const problems = (...items: { field: string; msg: string; type: string }[]) =>
  HttpResponse.json(
    { detail: items.map((i) => ({ loc: ["body", i.field], msg: i.msg, type: i.type })) },
    { status: 422 }
  );

/** The signed-in admin, or the response to send instead (401 / 403). */
function requireAdmin(cookies: Record<string, string | undefined>): MockAccount | Response {
  const account = sessionAccount(cookies);
  if (!account) return detailResponse(401, "Not authenticated");
  if (account.user.role !== "admin") return detailResponse(403, "Admin privileges required");
  return account;
}

const isResponse = (value: MockAccount | Response): value is Response => value instanceof Response;

function activeAdmins(orgId: string) {
  return accountStore
    .all()
    .filter((a) => a.user.org_id === orgId && a.user.role === "admin" && a.user.is_active);
}

/** Refuses to remove the last active admin (demote or deactivate). */
function lastAdminGuard(target: UserProfile): Response | null {
  if (target.role !== "admin" || !target.is_active) return null;
  const admins = activeAdmins(target.org_id);
  return admins.length <= 1 ? detailResponse(409, LAST_ADMIN_DETAIL) : null;
}

const isRole = (value: unknown): value is UserRole => ROLES.includes(value as UserRole);

const COMMON_PASSWORDS = ["password", "12345678", "qwertyui"];

export const userHandlers = [
  /** GET /users — admin only; includes inactive users. */
  http.get(`${BASE}/users`, async ({ request, cookies }) => {
    const admin = requireAdmin(cookies);
    if (isResponse(admin)) return admin;
    await wait(250);

    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const isActive = url.searchParams.get("is_active");
    const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();

    const members = accountStore
      .all()
      .map((a) => a.user)
      .filter((u) => u.org_id === admin.user.org_id)
      .filter((u) => !role || u.role === role)
      .filter((u) => isActive === null || String(u.is_active) === isActive)
      .filter(
        (u) =>
          !search ||
          u.email.toLowerCase().includes(search) ||
          u.full_name.toLowerCase().includes(search)
      );
    return HttpResponse.json(paginate(members, url));
  }),

  /** POST /users/invitations — returns a link to share; no email is sent. */
  http.post(`${BASE}/users/invitations`, async ({ request, cookies }) => {
    const admin = requireAdmin(cookies);
    if (isResponse(admin)) return admin;
    ensureSeeded();
    await wait(300);

    const body = (await request.json()) as Partial<components["schemas"]["InviteUserRequest"]>;
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role ?? "recruiter";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return problems({
        field: "email",
        msg: "value is not a valid email address",
        type: "value_error",
      });
    }
    if (!isRole(role)) {
      return problems({
        field: "role",
        msg: "Input should be 'admin', 'recruiter' or 'viewer'",
        type: "enum",
      });
    }
    const orgId = admin.user.org_id;
    // Emails are unique across all workspaces, not per workspace (B-15, migration 009).
    if (accountStore.all().some((a) => a.user.email === email)) {
      return detailResponse(409, "A user with this email already exists");
    }

    // A new invitation for the same email invalidates every older unused link.
    for (const old of invitations) {
      if (old.orgId === orgId && old.email === email && !old.usedAt) old.revoked = true;
    }
    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const invitation: Invitation = {
      id: crypto.randomUUID(),
      token,
      orgId,
      email,
      role,
      expiresAt: Date.now() + INVITE_TTL_HOURS * HOUR_MS,
      usedAt: null,
      revoked: false,
    };
    invitations.push(invitation);

    const origin = globalThis.location?.origin ?? "http://localhost:3000";
    const response: components["schemas"]["UserInvitationResponse"] = {
      id: invitation.id,
      email,
      role,
      expires_at: new Date(invitation.expiresAt).toISOString(),
      invite_url: `${origin}/accept-invite#token=${token}`,
    };
    return HttpResponse.json(response, { status: 201, headers: { "Cache-Control": "no-store" } });
  }),

  /** PATCH /users/{id}/role — the last active admin cannot be demoted. */
  http.patch(`${BASE}/users/:id/role`, async ({ request, params, cookies }) => {
    const admin = requireAdmin(cookies);
    if (isResponse(admin)) return admin;
    await wait(250);

    const body = (await request.json()) as Partial<components["schemas"]["UpdateUserRoleRequest"]>;
    if (!isRole(body.role)) {
      return problems({
        field: "role",
        msg: "Input should be 'admin', 'recruiter' or 'viewer'",
        type: "enum",
      });
    }
    const target = accountStore.find(String(params.id));
    if (!target || target.user.org_id !== admin.user.org_id) {
      return detailResponse(404, "User was not found");
    }
    if (target.user.role === body.role) return HttpResponse.json(target.user);
    if (body.role !== "admin") {
      const blocked = lastAdminGuard(target.user);
      if (blocked) return blocked;
    }
    target.user.role = body.role;
    return HttpResponse.json(target.user);
  }),

  /** POST /users/{id}/deactivate — never yourself, never the last active admin. */
  http.post(`${BASE}/users/:id/deactivate`, async ({ params, cookies }) => {
    const admin = requireAdmin(cookies);
    if (isResponse(admin)) return admin;
    await wait(250);

    const id = String(params.id);
    if (id === admin.user.id) return detailResponse(409, SELF_DEACTIVATE_DETAIL);
    const target = accountStore.find(id);
    if (!target || target.user.org_id !== admin.user.org_id) {
      return detailResponse(404, "User was not found");
    }
    if (!target.user.is_active) return HttpResponse.json(target.user);
    const blocked = lastAdminGuard(target.user);
    if (blocked) return blocked;
    target.user.is_active = false;
    return HttpResponse.json(target.user);
  }),

  /**
   * POST /auth/accept-invite — public. Creates the account but does not sign anyone in. Unknown,
   * expired, used and superseded tokens all get the same 400; a bad name or password is a 422 and
   * leaves the token usable.
   */
  http.post(`${BASE}/auth/accept-invite`, async ({ request }) => {
    ensureSeeded();
    await wait(300);

    const body = (await request.json()) as Partial<
      components["schemas"]["AcceptInvitationRequest"]
    >;
    const fullName = (body.full_name ?? "").trim();
    const password = body.password ?? "";
    const issues: { field: string; msg: string; type: string }[] = [];
    if (fullName.length < 2) {
      issues.push({
        field: "full_name",
        msg: "Value error, Full name must contain at least two non-whitespace characters",
        type: "value_error",
      });
    }
    if (password.length < 8) {
      issues.push({
        field: "password",
        msg: "String should have at least 8 characters",
        type: "string_too_short",
      });
    } else if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
      issues.push({
        field: "password",
        msg: "Value error, Password is too common",
        type: "value_error",
      });
    }
    if (issues.length) return problems(...issues);

    const invitation = invitations.find((i) => i.token === body.token);
    if (
      !invitation ||
      invitation.usedAt ||
      invitation.revoked ||
      invitation.expiresAt <= Date.now()
    ) {
      return detailResponse(400, INVALID_INVITE_DETAIL);
    }
    if (accountStore.all().some((a) => a.user.email === invitation.email)) {
      return detailResponse(409, "A user with this email already exists");
    }

    const account: MockAccount = {
      password,
      user: {
        id: crypto.randomUUID(),
        org_id: invitation.orgId,
        email: invitation.email,
        full_name: fullName,
        role: invitation.role,
        is_active: true,
      },
    };
    accountStore.add(account);
    invitation.usedAt = Date.now();
    return HttpResponse.json(account.user, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  }),
];
