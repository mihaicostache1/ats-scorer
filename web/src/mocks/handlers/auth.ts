import { http, HttpResponse } from "msw";
import { mockAccounts, mockOrg, type MockAccount } from "../fixtures/auth";
import type { components } from "@/api/generated/schema";
import { BASE } from "./utils";

/**
 * Mirrors the real auth API (B-5): tokens only ever travel as cookies, never in a body or in
 * script-readable storage. The mock "token" is just the user id; there is nothing secret here.
 * Error bodies use FastAPI's `{ detail }` shape, like the real server.
 */

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const REFRESH_PATH = new URL(`${BASE}/auth/refresh`, "http://localhost").pathname;

type TokenResponse = components["schemas"]["TokenResponse"];

/** In-memory accounts; registrations add to it for the browser session. */
const accounts: MockAccount[] = [...mockAccounts];
const orgSlugs = new Set<string>([mockOrg.slug]);

const detail = (status: number, message: string) =>
  HttpResponse.json({ detail: message }, { status });

type Cookies = Record<string, string | undefined>;

/**
 * Returns the signed-in account for a request's cookies, or null. MSW supplies `cookies`
 * from its own cookie store (filled from our `Set-Cookie` headers) when the request was made
 * with `credentials: "include"`, which the API client always does.
 */
export function sessionAccount(cookies: Cookies): MockAccount | null {
  const userId = cookies[ACCESS_COOKIE];
  return accounts.find((a) => a.user.id === userId && a.user.is_active) ?? null;
}

const cookie = (name: string, value: string, path: string, maxAge: number) =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`;

function sessionHeaders(userId: string): Headers {
  const headers = new Headers();
  headers.append("Set-Cookie", cookie(ACCESS_COOKIE, userId, "/", 15 * 60));
  headers.append("Set-Cookie", cookie(REFRESH_COOKIE, userId, REFRESH_PATH, 7 * 24 * 3600));
  return headers;
}

function tokenResponse(account: MockAccount, status: number) {
  const body: TokenResponse = {
    token_type: "bearer",
    user_id: account.user.id,
    org_id: account.user.org_id,
    role: account.user.role,
    message: "Tokens issued via httpOnly cookies",
  };
  return HttpResponse.json(body, { status, headers: sessionHeaders(account.user.id) });
}

export const authHandlers = [
  /**
   * POST /auth/register — creates an organization and its first admin, and signs them in.
   * 409 when the slug or email is taken; 422 (field list) on invalid input.
   */
  http.post(`${BASE}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["RegisterRequest"];

    const problems: { loc: string[]; msg: string; type: string }[] = [];
    if (!/^[a-z0-9-]+$/.test(body.org_slug ?? "")) {
      problems.push({
        loc: ["body", "org_slug"],
        msg: "String should match pattern '^[a-z0-9-]+$'",
        type: "string_pattern_mismatch",
      });
    }
    if ((body.admin_password ?? "").length < 8) {
      problems.push({
        loc: ["body", "admin_password"],
        msg: "String should have at least 8 characters",
        type: "string_too_short",
      });
    } else if (["password", "12345678", "qwertyui"].includes(body.admin_password.toLowerCase())) {
      problems.push({
        loc: ["body", "admin_password"],
        msg: "Value error, Password is too common",
        type: "value_error",
      });
    }
    if (problems.length) return HttpResponse.json({ detail: problems }, { status: 422 });

    const email = body.admin_email.toLowerCase();
    if (orgSlugs.has(body.org_slug) || accounts.some((a) => a.user.email === email)) {
      return detail(409, "Organisation slug or email already exists");
    }

    const orgId = crypto.randomUUID();
    orgSlugs.add(body.org_slug);
    const account: MockAccount = {
      password: body.admin_password,
      user: {
        id: crypto.randomUUID(),
        org_id: orgId,
        email,
        full_name: body.admin_full_name,
        role: "admin",
        is_active: true,
      },
    };
    accounts.push(account);
    return tokenResponse(account, 201);
  }),

  /**
   * POST /auth/login — the same 401 for an unknown email and a wrong password.
   */
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["LoginRequest"];
    const email = (body.email ?? "").toLowerCase();
    const account = accounts.find((a) => a.user.email === email);

    if (!account || account.password !== body.password || !account.user.is_active) {
      return detail(401, "Incorrect email or password");
    }
    return tokenResponse(account, 200);
  }),

  /**
   * POST /auth/refresh — reissues the session from the refresh cookie.
   */
  http.post(`${BASE}/auth/refresh`, ({ cookies }) => {
    const userId = cookies[REFRESH_COOKIE];
    const account = accounts.find((a) => a.user.id === userId && a.user.is_active);
    if (!account) return detail(401, "Invalid or expired refresh token");
    return tokenResponse(account, 200);
  }),

  /**
   * POST /auth/logout — expires both cookies.
   */
  http.post(`${BASE}/auth/logout`, ({ cookies }) => {
    if (!sessionAccount(cookies)) return detail(401, "Not authenticated");
    const headers = new Headers();
    headers.append("Set-Cookie", cookie(ACCESS_COOKIE, "", "/", 0));
    headers.append("Set-Cookie", cookie(REFRESH_COOKIE, "", REFRESH_PATH, 0));
    return HttpResponse.json({ message: "Logged out successfully" }, { headers });
  }),

  /**
   * GET /auth/me
   */
  http.get(`${BASE}/auth/me`, ({ cookies }) => {
    const account = sessionAccount(cookies);
    return account ? HttpResponse.json(account.user) : detail(401, "Not authenticated");
  }),

  /**
   * GET /orgs/current
   */
  http.get(`${BASE}/orgs/current`, ({ cookies }) => {
    if (!sessionAccount(cookies)) return detail(401, "Not authenticated");
    return HttpResponse.json(mockOrg satisfies components["schemas"]["OrganizationResponse"]);
  }),
];

/**
 * Registered first, ahead of every data handler. Answers 401 without a session and 403 when a
 * viewer attempts a write or reads candidates, then returns nothing so the request falls through to the real handler.
 * `/auth/*` is exempt (those handlers decide for themselves).
 */
export const sessionGuard = http.all(`${BASE}/*`, ({ request, cookies }) => {
  if (new URL(request.url).pathname.startsWith(new URL(`${BASE}/auth/`, "http://x").pathname)) {
    return;
  }
  const account = sessionAccount(cookies);
  if (!account) return detail(401, "Not authenticated");
  if (account.user.role === "viewer") {
    if (request.method !== "GET") return detail(403, "Not enough privileges");
    // Viewers only see shortlisted candidates (docs/scope.md §4), never the full list or profiles.
    // The real API does not enforce this yet; the mock follows the intended policy.
    if (
      new URL(request.url).pathname.startsWith(new URL(`${BASE}/candidates`, "http://x").pathname)
    ) {
      return detail(403, "Not enough privileges");
    }
  }
});
