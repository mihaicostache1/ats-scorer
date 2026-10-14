# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo for a multi-tenant, AI-assisted Applicant Tracking System:

- `api/` — FastAPI + SQLAlchemy (sync) + Alembic backend (Python 3.11+, CI uses 3.12)
- `web/` — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (base-ui) frontend
- `ml/` — `synthetic/` (synthetic CV/job generator) and `embedding_spike/` (model comparison experiments); not part of the runtime
- `docs/` — scope, ERD, privacy checklist, and the **frozen API contract** (`openapi.yaml`, `api_spec.md`)

Postgres (pgvector/pg17) and Redis run in Docker; API and web are normally run natively.

## Commands

Infrastructure (from repo root): `cp .env.example .env && docker compose up -d` (`docker compose down -v` wipes data).

### API (run from `api/`)
```bash
pip install -r requirements-dev.txt
alembic upgrade head                 # apply migrations (URL comes from settings.DATABASE_URL)
uvicorn app.main:app --reload        # serves on :8000, docs at /docs, routes under /api/v1
ruff check . && ruff format --check .   # lint (CI runs both; line-length 100)
mypy app                              # strict mode
pytest -q                             # all tests
pytest tests/test_candidates.py::test_name -q   # single test
```
`make seed` (repo root) generates synthetic data and seeds a demo org (`admin@demo.com` / `recruiter@demo.com`, password `DevOnly123!`).

**Tests need a live Postgres and are destructive**: the `db_engine` fixture runs `Base.metadata.create_all` against `settings.DATABASE_URL` and `drop_all` afterwards. Point `DATABASE_URL` at a throwaway database (CI uses `ats_test`), never your dev DB with data you care about.

### Web (run from `web/`)
```bash
npm install
npm run dev
npm run lint
npm run typecheck        # runs `next typegen && tsc --noEmit`
npm run format           # prettier (with tailwind plugin)
npm run gen:api          # regenerate src/api/generated/schema.ts from ../docs/openapi.yaml
```
CI runs lint + typecheck only; there is no web test runner yet.

`web/AGENTS.md` (imported by `web/CLAUDE.md`) warns that this Next.js version has breaking changes — consult `web/node_modules/next/dist/docs/` before writing Next.js code.

## API architecture

- `app/main.py` mounts `api_router` (`app/api/v1/router.py`) at `/api/v1`; each resource lives in `app/api/v1/endpoints/*.py` and must be registered in the router. Layers: `endpoints` → `services` (`pipeline_service`, `audit_service`, `auth_service`, `storage`) → SQLAlchemy `models`, with Pydantic `schemas` for I/O. Schema changes need a new Alembic revision in `alembic/versions/` (numbered `00N_*`).
- **Auth** is cookie-based: JWT in an httpOnly `access_token` cookie (and refresh cookie), resolved by `get_current_user` in `app/core/dependencies.py`. Role guards: `get_current_admin`, `get_current_recruiter_or_admin`. Login is rate-limited with slowapi.
- **Multi-tenancy**: endpoints that touch tenant data should use `get_tenant_db`, which attaches a `do_orm_execute` listener adding `org_id == current_user.org_id` (via `with_loader_criteria`) to every SELECT on any model that has an `org_id` column. Writes must still set `org_id` explicitly. `tests/test_multitenancy.py` covers isolation.
- **Pipelines**: each org gets default pipeline stages via `seed_default_stages`; moving an application between stages records an `application_stage_history` row.
- **CV storage**: `app/services/storage.py` defines a `Storage` protocol with `LocalDiskStorage` (root from `STORAGE_LOCAL_DIR`, default `api/storage/`, git-ignored). Files are private — only readable through org-checked endpoints, never mounted statically. Obtain it via the `get_storage` dependency (tests override it with a tmp dir autouse fixture). Uploads are checked for real PDF content and capped by `MAX_CV_SIZE_BYTES`.
- Config is `pydantic-settings` in `app/core/config.py`, reading `.env` or `../.env`. `.env.example` uses a plain `postgresql://` URL; docker-compose and CI use `postgresql+psycopg://`.
- Tests (`tests/conftest.py`): `db_session` is a rolled-back transaction for model-level tests; `committed_db` + `create_user` + `login_as` are for HTTP tests where the app's own sessions must see committed data (`login_as` sets the auth cookie on `async_client`). `asyncio_mode = "auto"`.

## Web architecture

- **Typed API layer**: `src/api/generated/schema.ts` is generated from `docs/openapi.yaml` (don't hand-edit); `src/api/client.ts` builds an `openapi-fetch` client from it; `src/api/index.ts` exposes one helper per operation returning `{ data, error, response }`. When the contract changes, update `docs/openapi.yaml`, run `npm run gen:api`, then adjust helpers and mocks.
- **Mocking**: MSW handlers in `src/mocks/handlers/*` (with `fixtures/`) back both `mocks/browser.ts` (service worker, started by `MockProvider` when `NEXT_PUBLIC_MOCK_API=true`, which **defaults to true**) and `mocks/server.ts` (node/tests). Register new handler groups in both. `sessionGuard` (in `handlers/auth.ts`) is registered first and answers 401/403 for every non-`/auth/*` route, then falls through. Set `NEXT_PUBLIC_MOCK_API=false` and `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`) to hit the real API.
- **Auth**: httpOnly cookies set by the API (B-5); JavaScript never sees or stores a token. `apiClient` sends `credentials: "include"` and, on a 401 from a non-`/auth/*` call, refreshes once and replays the request. `SessionProvider` (`providers/session-provider.tsx`) restores the session via `GET /auth/me`; `useSession()` exposes `user`, `signIn`, `signUp`, `signOut`, `can(action)`. Routes: `app/(auth)/{login,register}` are public, everything under `app/(app)/` sits behind `RequireAuth` (client-side redirect to `/login?next=…`, so it works with MSW and the real API alike). Role gating is UI-only — `lib/permissions.ts` (from docs/scope.md §4) + `<Can action="…">` and `requires` on nav items; the API stays the source of truth. API errors are FastAPI `{ detail }`; `lib/api-error.ts` turns them into form messages. Mock logins (same password as the real seed): `admin@demo.com`, `recruiter@demo.com`, `viewer@demo.com` / `DevOnly123!` (viewer is mock-only).
- **List pages keep their state in the URL** (`?q=&status=&page=`): parse with `lib/url-state.ts` (invalid values fall back to defaults), write with `router.push` (filters/pages) or `replace` (debounced typing), and wrap the component in `<Suspense>` because it calls `useSearchParams`. `components/jobs/*` (`/jobs`) is the reference implementation; `components/common/pagination.tsx` is reusable. The older `DataTable` is client-side only (no URL state, no server paging).
- Env vars are validated in `src/env.ts` (`@t3-oss/env-nextjs` + zod); add new ones there, including `experimental__runtimeEnv`.
- UI: shared primitives in `src/components/ui` (shadcn), app chrome in `components/layout`, reusable states/tables in `components/common`; `/dev/components` is a component playground.

## Known mismatches to be aware of

- `docs/openapi.yaml` describes the planned API (including endpoints like `/candidates/upload`, `/orgs/current`, scores); the backend implements only a subset so far — check `api/app/api/v1/endpoints/` for what exists. The auth section (`/auth/register|login|refresh|logout|me`) matches the backend.
- Registered orgs in mock mode share the demo org's jobs/candidates fixtures.
