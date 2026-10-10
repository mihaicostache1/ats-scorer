import type { components } from "@/api/generated/schema";

export const MOCK_ORG_ID = "123e4567-e89b-12d3-a456-426614174000";
export const MOCK_USER_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

/** Fake JWT — not cryptographically valid, just realistic-looking for mocks. */
export const MOCK_ACCESS_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJzdWIiOiI5YjFkZWI0ZC0zYjdkLTRiYWQtOWJkZC0yYjBkN2IzZGNiNmQiLCJvcmdfaWQiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJyb2xlIjoicmVjcnVpdGVyIiwiZXhwIjoxNzYyNzQ0MDAwfQ" +
  ".mock_signature_not_real";

export const mockUser: components["schemas"]["UserProfileResponse"] = {
  id: MOCK_USER_ID,
  org_id: MOCK_ORG_ID,
  email: "recruiter@acme.com",
  full_name: "Sarah Jenkins",
  role: "recruiter",
};

export const mockAdminUser: components["schemas"]["UserProfileResponse"] = {
  id: "a0000000-0000-4000-a000-000000000001",
  org_id: MOCK_ORG_ID,
  email: "admin@acme.com",
  full_name: "Marcus Cole",
  role: "admin",
};

export const mockAuthTokenResponse: components["schemas"]["AuthTokenResponse"] = {
  access_token: MOCK_ACCESS_TOKEN,
  token_type: "Bearer",
  user: mockUser,
};

export const mockOrg: components["schemas"]["OrganizationResponse"] = {
  id: MOCK_ORG_ID,
  name: "Acme Corp Hiring Workspace",
  slug: "acme-corp",
};
