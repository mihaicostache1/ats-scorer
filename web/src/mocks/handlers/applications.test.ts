// @vitest-environment node
import { expect, it } from "vitest";
import { mockApplications, mockScoreAdvisory } from "../fixtures/applications";
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
  expect(all.advisory_note).toBe(mockScoreAdvisory);
  expect(all.ranked.pagination).toMatchObject({ total_items: 21, total_pages: 2, has_next: true });
  const nextRanked = await (await get(`${path}?ranked_page=2`)).json();
  expect(nextRanked.ranked.items).toHaveLength(1);
  expect(nextRanked.needs_manual_review).toEqual(all.needs_manual_review);
  expect(
    ["ranked", "needs_manual_review", "unranked"].reduce(
      (count, name) => count + all[name].pagination.total_items,
      0
    )
  ).toBe(27);
  expect(new Set(all.ranked.items.map((row: { band: string }) => row.band))).toEqual(
    new Set(["strong", "moderate", "weak"])
  );
  expect(all.ranked.items[0].application_id).toBe(mockApplications[0].id);
  expect(all.needs_manual_review.items[0].application_id).toBe(mockApplications[1].id);
  const filtered = await (await get(`${path}?required_skill=Postgres&per_page=1`)).json();
  expect(filtered.ranked.items).toEqual(all.ranked.items.slice(0, 1));
  expect(filtered.needs_manual_review.items).toEqual([]);
  expect((await get(path, true)).status).toBe(403);
});

it("pages groups independently and returns API-shaped errors", async () => {
  const path = `/jobs/${mockJobs[0].id}/ranked-candidates`;
  const all = await (await get(path)).json();
  const independent = await (
    await get(`${path}?page=3&per_page=1&ranked_page=1&review_page=2`)
  ).json();
  expect(independent.ranked.items).toEqual(all.ranked.items.slice(0, 1));
  expect(independent.needs_manual_review.items).toEqual(all.needs_manual_review.items.slice(1, 2));
  expect(independent.unranked.items).toEqual(all.unranked.items.slice(2, 3));
  const unranked = await (await get(`${path}?per_page=1&unranked_page=2`)).json();
  expect(unranked.unranked.items).toEqual(all.unranked.items.slice(1, 2));
  for (const query of ["min_score=abc", "sort_by=nope", "per_page=0", "review_page=0"]) {
    const response = await get(`${path}?${query}`);
    expect(response.status).toBe(422);
    expect((await response.json()).detail[0].loc).toEqual(["query", query.split("=")[0]]);
  }
  const id = "00000000-0000-4000-8000-000000000000";
  const missing = await get(`/jobs/${id}/ranked-candidates`);
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ detail: `Job with ID '${id}' was not found.` });
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
