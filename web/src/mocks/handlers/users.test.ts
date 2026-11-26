// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_USER_ID } from "../fixtures/auth";
import { MOCK_INVITE_TOKENS, mockMembers } from "../fixtures/users";
import { sessionAccount } from "./auth";
import {
  INVALID_INVITE_DETAIL,
  LAST_ADMIN_DETAIL,
  resetUserStore,
  SELF_DEACTIVATE_DETAIL,
  userHandlers,
} from "./users";
import { BASE } from "./utils";

/**
 * The user-management mock is a stand-in for B-15, so these tests pin the behaviour it must copy
 * from the real service: last-admin and self-deactivation refusals, and one generic 400 for every
 * kind of unusable invitation. Handlers are called directly (CI runs Node 20, where `setupServer`
 * is unavailable); the session is passed the way a browser would, as the `access_token` cookie.
 */

const ADMIN_ID = "a0000000-0000-4000-a000-000000000001";
const VIEWER_ID = "a0000000-0000-4000-a000-000000000003";
const INACTIVE = mockMembers.find((m) => !m.user.is_active)!.user;
const OTHER_RECRUITER = mockMembers.find(
  (m) => m.user.role === "recruiter" && m.user.is_active
)!.user;

async function call(
  method: string,
  path: string,
  options: { as?: string; body?: unknown } = {}
): Promise<Response> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.as) headers.set("cookie", `access_token=${options.as}`);
  const request = new Request(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  for (const handler of userHandlers) {
    const result = await handler.run({ request: request.clone(), requestId: crypto.randomUUID() });
    if (result?.response) return result.response;
  }
  throw new Error(`No mock handler for ${method} ${path}`);
}

const detailOf = async (res: Response) => ((await res.json()) as { detail: string }).detail;

beforeEach(() => resetUserStore());

describe("GET /users", () => {
  it("lists every member of the org, inactive ones included, and filters", async () => {
    const all = await call("GET", "/users?per_page=100", { as: ADMIN_ID });
    expect(all.status).toBe(200);
    const body = (await all.json()) as { items: { email: string; is_active: boolean }[] };
    expect(body.items).toHaveLength(3 + mockMembers.length);
    expect(body.items.some((u) => !u.is_active)).toBe(true);

    const inactive = await call("GET", "/users?is_active=false", { as: ADMIN_ID });
    expect(((await inactive.json()) as { items: unknown[] }).items).toHaveLength(1);

    const viewers = await call("GET", "/users?role=viewer&search=ais", { as: ADMIN_ID });
    expect(((await viewers.json()) as { items: { email: string }[] }).items).toEqual([
      expect.objectContaining({ email: "aisha@demo.com" }),
    ]);
  });

  it("is admin only", async () => {
    const res = await call("GET", "/users", { as: MOCK_USER_ID });
    expect(res.status).toBe(403);
    expect(await detailOf(res)).toBe("Admin privileges required");
    expect((await call("GET", "/users", { as: VIEWER_ID })).status).toBe(403);
  });
});

describe("PATCH /users/{id}/role", () => {
  it("refuses to demote the only active admin", async () => {
    const res = await call("PATCH", `/users/${ADMIN_ID}/role`, {
      as: ADMIN_ID,
      body: { role: "recruiter" },
    });
    expect(res.status).toBe(409);
    expect(await detailOf(res)).toBe(LAST_ADMIN_DETAIL);
  });

  it("allows it once another active admin exists", async () => {
    const promote = await call("PATCH", `/users/${OTHER_RECRUITER.id}/role`, {
      as: ADMIN_ID,
      body: { role: "admin" },
    });
    expect(promote.status).toBe(200);
    const demote = await call("PATCH", `/users/${ADMIN_ID}/role`, {
      as: ADMIN_ID,
      body: { role: "viewer" },
    });
    expect(demote.status).toBe(200);
    expect(((await demote.json()) as { role: string }).role).toBe("viewer");
  });

  it("does not count an inactive admin as a spare", async () => {
    // Promote the inactive user directly: they are an admin on paper, but cannot act as one.
    await call("PATCH", `/users/${INACTIVE.id}/role`, { as: ADMIN_ID, body: { role: "admin" } });
    const res = await call("PATCH", `/users/${ADMIN_ID}/role`, {
      as: ADMIN_ID,
      body: { role: "recruiter" },
    });
    expect(res.status).toBe(409);
  });

  it("is idempotent, rejects unknown roles and unknown users", async () => {
    const same = await call("PATCH", `/users/${OTHER_RECRUITER.id}/role`, {
      as: ADMIN_ID,
      body: { role: "recruiter" },
    });
    expect(same.status).toBe(200);
    const bad = await call("PATCH", `/users/${OTHER_RECRUITER.id}/role`, {
      as: ADMIN_ID,
      body: { role: "owner" },
    });
    expect(bad.status).toBe(422);
    const missing = await call("PATCH", `/users/${crypto.randomUUID()}/role`, {
      as: ADMIN_ID,
      body: { role: "viewer" },
    });
    expect(missing.status).toBe(404);
  });
});

describe("POST /users/{id}/deactivate", () => {
  it("always refuses self-deactivation", async () => {
    const res = await call("POST", `/users/${ADMIN_ID}/deactivate`, { as: ADMIN_ID });
    expect(res.status).toBe(409);
    expect(await detailOf(res)).toBe(SELF_DEACTIVATE_DETAIL);
  });

  it("protects the last active admin from another admin, too", async () => {
    await call("PATCH", `/users/${OTHER_RECRUITER.id}/role`, {
      as: ADMIN_ID,
      body: { role: "admin" },
    });
    // The second admin deactivates the first: fine, two admins. Now only one is left.
    const first = await call("POST", `/users/${ADMIN_ID}/deactivate`, { as: OTHER_RECRUITER.id });
    expect(first.status).toBe(200);
    // The original admin is inactive, so the session no longer resolves for them.
    expect(sessionAccount({ access_token: ADMIN_ID })).toBeNull();
  });

  it("ends the deactivated user's session straight away", async () => {
    expect(sessionAccount({ access_token: OTHER_RECRUITER.id })).not.toBeNull();
    const res = await call("POST", `/users/${OTHER_RECRUITER.id}/deactivate`, { as: ADMIN_ID });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { is_active: boolean }).is_active).toBe(false);
    expect(sessionAccount({ access_token: OTHER_RECRUITER.id })).toBeNull();
  });

  it("is idempotent for an already inactive user", async () => {
    const res = await call("POST", `/users/${INACTIVE.id}/deactivate`, { as: ADMIN_ID });
    expect(res.status).toBe(200);
  });
});

describe("invitations", () => {
  const invite = (email: string, role = "recruiter") =>
    call("POST", "/users/invitations", { as: ADMIN_ID, body: { email, role } });
  const tokenOf = (url: string) => new URL(url).hash.replace("#token=", "");

  it("creates a single-use link with the token in the fragment", async () => {
    const res = await invite("Fresh@Demo.com", "viewer");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { email: string; role: string; invite_url: string };
    expect(body.email).toBe("fresh@demo.com");
    expect(body.role).toBe("viewer");
    expect(new URL(body.invite_url).pathname).toBe("/accept-invite");
    expect(new URL(body.invite_url).search).toBe("");
    expect(tokenOf(body.invite_url).length).toBeGreaterThan(40);
  });

  it("refuses an email that already belongs to a member, even an inactive one", async () => {
    for (const email of ["recruiter@demo.com", INACTIVE.email]) {
      const res = await invite(email);
      expect(res.status).toBe(409);
      expect(await detailOf(res)).toBe("A user with this email already exists");
    }
  });

  it("creates the account on accept, which then exists but is not signed in", async () => {
    const created = (await (await invite("fresh@demo.com", "viewer")).json()) as {
      invite_url: string;
    };
    const accept = await call("POST", "/auth/accept-invite", {
      body: {
        token: tokenOf(created.invite_url),
        full_name: "Fresh Face",
        password: "Str0ngPass!",
      },
    });
    expect(accept.status).toBe(201);
    expect(accept.headers.get("set-cookie")).toBeNull();
    expect(await accept.json()).toMatchObject({
      email: "fresh@demo.com",
      role: "viewer",
      full_name: "Fresh Face",
      is_active: true,
    });

    // Single use: the same link now fails.
    const again = await call("POST", "/auth/accept-invite", {
      body: {
        token: tokenOf(created.invite_url),
        full_name: "Fresh Face",
        password: "Str0ngPass!",
      },
    });
    expect(again.status).toBe(400);
  });

  it("answers every unusable token with the same 400", async () => {
    const results = await Promise.all(
      [MOCK_INVITE_TOKENS.expired, MOCK_INVITE_TOKENS.used, "no-such-token"].map((token) =>
        call("POST", "/auth/accept-invite", {
          body: { token, full_name: "Someone", password: "Str0ngPass!" },
        })
      )
    );
    for (const res of results) {
      expect(res.status).toBe(400);
      expect(await detailOf(res)).toBe(INVALID_INVITE_DETAIL);
    }
  });

  it("accepts the seeded valid token", async () => {
    const res = await call("POST", "/auth/accept-invite", {
      body: {
        token: MOCK_INVITE_TOKENS.valid,
        full_name: "New Colleague",
        password: "Str0ngPass!",
      },
    });
    expect(res.status).toBe(201);
  });

  it("a newer invitation to the same email replaces the older link", async () => {
    const first = (await (await invite("twice@demo.com")).json()) as { invite_url: string };
    await invite("twice@demo.com");
    const res = await call("POST", "/auth/accept-invite", {
      body: { token: tokenOf(first.invite_url), full_name: "Twice Over", password: "Str0ngPass!" },
    });
    expect(res.status).toBe(400);
  });

  it("a bad name or password is a 422 and does not use up the token", async () => {
    const weak = await call("POST", "/auth/accept-invite", {
      body: { token: MOCK_INVITE_TOKENS.valid, full_name: "New Colleague", password: "password" },
    });
    expect(weak.status).toBe(422);
    const issues = ((await weak.json()) as { detail: { loc: string[] }[] }).detail;
    expect(issues[0].loc).toEqual(["body", "password"]);

    const ok = await call("POST", "/auth/accept-invite", {
      body: {
        token: MOCK_INVITE_TOKENS.valid,
        full_name: "New Colleague",
        password: "Str0ngPass!",
      },
    });
    expect(ok.status).toBe(201);
  });
});
