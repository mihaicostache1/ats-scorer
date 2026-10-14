# ATS Scorer web app

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui frontend. See the repository root `README.md`
for the full local setup (Docker, API) and `CLAUDE.md` for architecture notes.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000 (or the next free port)
```

`NEXT_PUBLIC_MOCK_API` decides where requests go:

- `true` (the default): [MSW](https://mswjs.io) answers every API call in the browser, so no backend is needed.
  Sign in with `admin@demo.com`, `recruiter@demo.com` or `viewer@demo.com`, password `DevOnly123!`.
- `false`: requests go to the real API at `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api/v1`).

Restart `npm run dev` after changing it.

## Checks

```bash
npm run lint
npm run typecheck
npm run format       # prettier --write
```

## Testing

There are two layers:

| Layer            | Tool                                                                                                                          | Where                                | What it is for                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| Component / unit | [Vitest](https://vitest.dev) + [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) (jsdom) | `src/**/*.test.tsx` next to the code | One component or function at a time, fast, no browser |
| End-to-end smoke | [Playwright](https://playwright.dev) (Chromium)                                                                               | `e2e/*.spec.ts`                      | The real app in a browser, against the MSW mocks      |

### One-time setup

```bash
npm install
npx playwright install chromium     # downloads the browser Playwright drives (about 150 MB)
```

### Run the tests

```bash
npm test                  # component tests, once
npm run test:watch        # component tests, re-run on change

npm run test:e2e          # end-to-end smoke test
npx playwright test --headed        # watch the browser while it runs
npx playwright test --ui            # Playwright's interactive UI mode
npx playwright show-report          # open the HTML report from the last CI-style run
```

`npm run test:e2e` builds the app with `NEXT_PUBLIC_MOCK_API=true`, starts it on port **3100** (so it
never clashes with `npm run dev`), runs the tests and stops the server. The first run takes a minute
for the build. Locally Playwright reuses a server that is already running on 3100; in CI it always
starts a fresh one. A `"next start" does not work with "output: standalone"` warning in the output is
expected and harmless here.

On Windows PowerShell, if `npm` fails with "running scripts is disabled", either run
`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once, or call `npm.cmd`
instead (for example `npm.cmd test`).

### What is covered

- `src/components/common/pagination.test.tsx`: an example component test. Renders `Pagination`, clicks
  its buttons like a user and checks what is shown. Copy it as a template.
- `e2e/login-to-jobs.spec.ts`: the flow from a signed-out visit to the jobs list. Redirect to
  `/login?next=…`, wrong password error, successful login back to `/jobs`, search and paging kept in the
  URL, and the session surviving a reload.

The end-to-end test relies on the mock data: the `admin@demo.com` account
(`src/mocks/fixtures/auth.ts`) and 25 jobs (`src/mocks/fixtures/jobs.ts`). If you change those
fixtures, update the numbers in the spec.

### Writing tests

- Component tests: name them `*.test.tsx` next to the component, import `describe`, `it`, `expect`
  and `vi` from `vitest` (there are no globals), and prefer queries by role or label
  (`getByRole`, `getByLabelText`) over test ids, as the example does.
- End-to-end tests: put them in `e2e/`, use role/label locators and Playwright's auto-waiting
  assertions (`await expect(...)`), never fixed sleeps. Keep this suite small: it is a smoke test.

### In CI

`.github/workflows/ci.yml` runs `npm test` in the `web` job and the Playwright smoke test in the
`web e2e` job. Neither needs the API, a database or Docker. When the e2e job fails, download the
`playwright-report` artifact from the run and open `index.html` (it includes a trace on retry).
