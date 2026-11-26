// @vitest-environment node
import { expect, it } from "vitest";
import { mockApplications } from "../fixtures/applications";
import { mockAccounts } from "../fixtures/auth";
import { mockJobs } from "../fixtures/jobs";
import { applicationHandlers } from "./applications";
import { BASE } from "./utils";

async function get(path: string, viewer = false) {
  const user = mockAccounts.find((entry) => entry.user.role === (viewer ? "viewer" : "admin"))!;
  const request = new Request(`${BASE}${path}`, {
    headers: { Cookie: `access_token=${user.user.id}` },
  });
  for (const handler of applicationHandlers) {
    const result = await handler.run({ request: request.clone(), requestId: crypto.randomUUID() });
    if (result?.response) return result.response;
  }
  throw new Error(`No mock handler for ${path}`);
}

it("returns grouped ranking pages and filters stored required matches", async () => {
  const path = `/jobs/${mockJobs[0].id}/ranked-candidates`;
  const all = await (await get(path)).json();
  expect(all.ranked.items[0].application_id).toBe(mockApplications[0].id);
  expect(all.needs_manual_review.items[0].application_id).toBe(mockApplications[1].id);
  const filtered = await (await get(`${path}?required_skill=Postgres&per_page=1`)).json();
  expect(filtered.ranked.items).toEqual(all.ranked.items);
  expect(filtered.needs_manual_review.items).toEqual([]);
  expect((await get(path, true)).status).toBe(403);
});

it("enforces viewer stage access and serves review and rescoring outcomes", async () => {
  const path = (index: number) => `/applications/${mockApplications[index].id}/score`;
  expect((await get(path(2), true)).status).toBe(404);
  const score = await (await get(path(0), true)).json();
  expect(score.status).toBe("scored");
  expect(
    score.explanation.matched_skills.every((match: { skill: string }) =>
      [...mockJobs[0].required_skills, ...mockJobs[0].preferred_skills].includes(match.skill)
    )
  ).toBe(true);
  const review = await (await get(path(1))).json();
  expect(review).toMatchObject({ status: "needs_manual_review", score: null, explanation: null });
  expect((await (await get(path(5))).json()).status).toBe("rescoring");
});
