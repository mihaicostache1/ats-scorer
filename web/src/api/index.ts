/**
 * Typed operation helpers built on top of `apiClient`.
 *
 * Each helper returns the full `{ data, error, response }` tuple from
 * openapi-fetch so callers can handle errors explicitly.
 *
 * Import from here instead of reaching into `@/api/client` directly.
 */

import { apiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function login(body: components["schemas"]["LoginRequest"]) {
  return apiClient.POST("/auth/login", { body });
}

export function getCurrentUser() {
  return apiClient.GET("/auth/me");
}

// ─── Org ──────────────────────────────────────────────────────────────────────

export function getOrganization() {
  return apiClient.GET("/orgs/current");
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export function listJobs(
  params?: components["schemas"] extends never
    ? never
    : {
        status?: "draft" | "open" | "paused" | "closed" | "archived";
        page?: number;
        per_page?: number;
      }
) {
  return apiClient.GET("/jobs", { params: { query: params } });
}

export function createJob(body: components["schemas"]["CreateJobRequest"]) {
  return apiClient.POST("/jobs", { body });
}

export function getJob(id: string) {
  return apiClient.GET("/jobs/{id}", { params: { path: { id } } });
}

export function getJobStages(id: string) {
  return apiClient.GET("/jobs/{id}/stages", { params: { path: { id } } });
}

// ─── Candidates ───────────────────────────────────────────────────────────────

export function listCandidates(params?: { search?: string; page?: number; per_page?: number }) {
  return apiClient.GET("/candidates", { params: { query: params } });
}

export function uploadCandidateCV(formData: FormData) {
  // FormData cannot be typed as the generated binary schema body — cast through unknown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiClient.POST("/candidates/upload", { body: formData as any });
}

export function getCandidate(id: string) {
  return apiClient.GET("/candidates/{id}", { params: { path: { id } } });
}

export function updateCandidate(
  id: string,
  body: components["schemas"]["UpdateCandidateRequest"]
) {
  return apiClient.PATCH("/candidates/{id}", { params: { path: { id } }, body });
}

export function hardDeleteCandidate(id: string) {
  return apiClient.DELETE("/candidates/{id}", { params: { path: { id } } });
}

// ─── Applications ─────────────────────────────────────────────────────────────

export function createApplication(body: components["schemas"]["CreateApplicationRequest"]) {
  return apiClient.POST("/applications", { body });
}

export function updateApplicationStage(
  id: string,
  body: components["schemas"]["UpdateStageRequest"]
) {
  return apiClient.PATCH("/applications/{id}/stage", { params: { path: { id } }, body });
}

export function getApplicationScore(id: string) {
  return apiClient.GET("/applications/{id}/score", { params: { path: { id } } });
}

// ─── Re-export schema types ────────────────────────────────────────────────────

export type { components } from "@/api/generated/schema";
