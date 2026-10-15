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
// Sessions are httpOnly cookies set by the API; none of these return a token.

export function register(body: components["schemas"]["RegisterRequest"]) {
  return apiClient.POST("/auth/register", { body });
}

export function login(body: components["schemas"]["LoginRequest"]) {
  return apiClient.POST("/auth/login", { body });
}

export function refreshSession() {
  return apiClient.POST("/auth/refresh");
}

export function logout() {
  return apiClient.POST("/auth/logout");
}

export function getCurrentUser() {
  return apiClient.GET("/auth/me");
}

// ─── Org ──────────────────────────────────────────────────────────────────────

export function getOrganization() {
  return apiClient.GET("/orgs/current");
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export function listJobs(params?: {
  status?: "draft" | "open" | "paused" | "closed" | "archived";
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: "created_at" | "updated_at" | "title" | "status";
  sort_order?: "asc" | "desc";
}) {
  return apiClient.GET("/jobs", { params: { query: params } });
}

export function createJob(body: components["schemas"]["CreateJobRequest"]) {
  return apiClient.POST("/jobs", { body });
}

export function getJob(id: string) {
  return apiClient.GET("/jobs/{id}", { params: { path: { id } } });
}

export function updateJob(id: string, body: components["schemas"]["UpdateJobRequest"]) {
  return apiClient.PATCH("/jobs/{id}", { params: { path: { id } }, body });
}

export function updateJobStatus(id: string, body: components["schemas"]["UpdateJobStatusRequest"]) {
  return apiClient.PATCH("/jobs/{id}/status", { params: { path: { id } }, body });
}

export function archiveJob(id: string) {
  return apiClient.POST("/jobs/{id}/archive", { params: { path: { id } } });
}

export function getJobStages(id: string) {
  return apiClient.GET("/jobs/{id}/stages", { params: { path: { id } } });
}

// ─── Candidates ───────────────────────────────────────────────────────────────

export function listCandidates(params?: {
  search?: string;
  page?: number;
  per_page?: number;
  sort_by?: "created_at" | "updated_at" | "full_name" | "email";
  sort_order?: "asc" | "desc";
}) {
  return apiClient.GET("/candidates", { params: { query: params } });
}

export function createCandidate(body: components["schemas"]["CreateCandidateRequest"]) {
  return apiClient.POST("/candidates", { body });
}

export function getCandidate(id: string) {
  return apiClient.GET("/candidates/{id}", { params: { path: { id } } });
}

export function updateCandidate(id: string, body: components["schemas"]["UpdateCandidateRequest"]) {
  return apiClient.PATCH("/candidates/{id}", { params: { path: { id } }, body });
}

export function hardDeleteCandidate(id: string) {
  return apiClient.DELETE("/candidates/{id}", { params: { path: { id } } });
}

export function listCandidateCvDocuments(id: string) {
  return apiClient.GET("/candidates/{id}/cv", { params: { path: { id } } });
}

export function uploadCandidateCV(id: string, file: File) {
  return apiClient.POST("/candidates/{id}/cv", {
    params: { path: { id } },
    body: { file: file as unknown as string },
    // openapi-fetch cannot serialise File bodies on its own, so build the multipart form here.
    bodySerializer: () => {
      const form = new FormData();
      form.append("file", file);
      return form;
    },
  });
}

export function getCandidateCvDocument(id: string, cvId: string) {
  return apiClient.GET("/candidates/{id}/cv/{cv_id}", {
    params: { path: { id, cv_id: cvId } },
  });
}

export function downloadCandidateCV(id: string, cvId: string) {
  return apiClient.GET("/candidates/{id}/cv/{cv_id}/download", {
    params: { path: { id, cv_id: cvId } },
    parseAs: "blob",
  });
}

// ─── Applications ─────────────────────────────────────────────────────────────

export function listApplications(params?: {
  job_id?: string;
  candidate_id?: string;
  stage_id?: string;
  status?: "active" | "hired" | "rejected" | "withdrawn";
  page?: number;
  per_page?: number;
}) {
  return apiClient.GET("/applications", { params: { query: params } });
}

export function createApplication(body: components["schemas"]["CreateApplicationRequest"]) {
  return apiClient.POST("/applications", { body });
}

export function getApplication(id: string) {
  return apiClient.GET("/applications/{id}", { params: { path: { id } } });
}

export function getApplicationHistory(id: string) {
  return apiClient.GET("/applications/{id}/history", { params: { path: { id } } });
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
