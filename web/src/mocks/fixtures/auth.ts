import type { components } from "@/api/generated/schema";

export const MOCK_ORG_ID = "123e4567-e89b-12d3-a456-426614174000";
export const MOCK_USER_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

/** Same password as the real dev seed (`make seed`), so the demo logins work in both modes. */
export const MOCK_PASSWORD = "DevOnly123!";

export type MockUser = components["schemas"]["UserProfileResponse"];

export interface MockAccount {
  user: MockUser;
  password: string;
}

export const mockOrg: components["schemas"]["OrganizationResponse"] = {
  id: MOCK_ORG_ID,
  name: "Demo Org",
  slug: "demo",
};

/** One account per role. admin/recruiter match the real seed; viewer exists for mock-only demos. */
export const mockAccounts: MockAccount[] = [
  {
    password: MOCK_PASSWORD,
    user: {
      id: "a0000000-0000-4000-a000-000000000001",
      org_id: MOCK_ORG_ID,
      email: "admin@demo.com",
      full_name: "Marcus Cole",
      role: "admin",
      is_active: true,
    },
  },
  {
    password: MOCK_PASSWORD,
    user: {
      id: MOCK_USER_ID,
      org_id: MOCK_ORG_ID,
      email: "recruiter@demo.com",
      full_name: "Sarah Jenkins",
      role: "recruiter",
      is_active: true,
    },
  },
  {
    password: MOCK_PASSWORD,
    user: {
      id: "a0000000-0000-4000-a000-000000000003",
      org_id: MOCK_ORG_ID,
      email: "viewer@demo.com",
      full_name: "Daniel Okafor",
      role: "viewer",
      is_active: true,
    },
  },
];
