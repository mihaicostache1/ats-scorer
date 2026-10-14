import { http, HttpResponse } from "msw";
import { mockAuthTokenResponse, mockOrg, mockUser, MOCK_ACCESS_TOKEN } from "../fixtures/auth";
import type { components } from "@/api/generated/schema";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Returns true if the request carries any bearer token (mock doesn't validate signature). */
function isAuthenticated(request: Request): boolean {
  const auth = request.headers.get("Authorization") ?? "";
  return auth.startsWith("Bearer ") && auth.length > 7;
}

function unauthorizedResponse(): Response {
  const body: components["schemas"]["ErrorEnvelope"] = {
    error: {
      code: "UNAUTHORIZED",
      message: "Missing or expired Authorization Bearer token.",
      timestamp: new Date().toISOString(),
      request_id: `req_auth_${Date.now()}`,
    },
  };
  return HttpResponse.json(body, { status: 401 });
}

export const authHandlers = [
  /**
   * POST /auth/login
   * Accepts any email that includes "recruiter", "admin", or is the exact
   * admin fixture email. All other combinations return 401.
   */
  http.post(`${BASE}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["LoginRequest"];

    const validEmails = ["recruiter@acme.com", "admin@acme.com"];
    if (!body.email || !validEmails.includes(body.email.toLowerCase())) {
      return HttpResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid email or password.",
            timestamp: new Date().toISOString(),
            request_id: `req_login_${Date.now()}`,
          },
        } satisfies components["schemas"]["ErrorEnvelope"],
        { status: 401 }
      );
    }

    return HttpResponse.json(mockAuthTokenResponse, { status: 200 });
  }),

  /**
   * GET /auth/me
   * Returns the current user profile if a Bearer token is present.
   */
  http.get(`${BASE}/auth/me`, ({ request }) => {
    if (!isAuthenticated(request)) return unauthorizedResponse();
    return HttpResponse.json(mockUser satisfies components["schemas"]["UserProfileResponse"]);
  }),

  /**
   * GET /orgs/current
   */
  http.get(`${BASE}/orgs/current`, ({ request }) => {
    if (!isAuthenticated(request)) return unauthorizedResponse();
    return HttpResponse.json(mockOrg satisfies components["schemas"]["OrganizationResponse"]);
  }),
];

export { MOCK_ACCESS_TOKEN };
