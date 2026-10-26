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

### CV upload scenarios

With the mocks on, what happens to an uploaded CV is chosen by its **file name**, so every state of the
upload and processing flow can be reproduced by hand, in a test or in a demo. Put the marker between
separators (`-`, `_`, space or the dot), in any case: `alex-needs-review.pdf`, `Alex_Encrypted.PDF`. A name
with no marker takes the default. Status moves one step per status check, not with the clock, so a given
file always goes through the same states. The file itself must still be a real PDF (it starts with
`%PDF-` and ends with `%%EOF`), as the real API requires.

| Marker                                                 | What you see                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| _(none)_ or `parsed`                                   | queued, extracting, parsed                                                                           |
| `needs-review`                                         | queued, extracting, needs review                                                                     |
| `extracted`                                            | queued, extracting, text extracted (all the real backend can do today)                               |
| `ocr`                                                  | parsed, with "OCR used" and 4 pages                                                                  |
| `slow`                                                 | seven checks in extracting before parsed (shows the backoff)                                         |
| `stuck`                                                | never leaves the queue                                                                               |
| `timeout`                                              | times out and retries by itself twice ("attempt 2 of 3"…), then fails "Gave up after 3 attempts."    |
| `encrypted`, `corrupt`, `no-text`, `too-many-pages`    | fails with the backend's exact message and a hint (retrying won't help)                              |
| `fail-then-ok`                                         | fails with a temporary error; **Retry** works                                                        |
| `queue-down`                                           | uploaded but already failed (`queue_unavailable`); the first **Retry** fails again, the second works |
| `poll-error`                                           | the first two status checks fail with a server error, then it recovers                               |
| `poll-lost`                                            | every status check fails: "We lost contact…" with **Check again**                                    |
| `upload-413`, `upload-415`, `upload-403`, `upload-404` | the server refuses the upload                                                                        |
| `upload-500`, `upload-offline`                         | the server fails / the request never arrives                                                         |

Files over 10 MB or that aren't PDFs are refused in the browser before anything is sent. A few CVs in
the fixtures start mid-processing (`waiting-in-queue.pdf`, `being-extracted.pdf`), so opening those
candidates shows polling picking up where it left off. The scenarios live in
`src/mocks/scenarios/cv-scenarios.ts`; `cv-scenarios.test.ts` runs every one through the real handlers
and fails if a scenario has no test.

## Theme

The sun/moon/monitor button in the header (and in the corner of the login and register pages) switches
between **Light**, **Dark** and **System**. System follows the operating system and is the default. The
choice is saved in the browser (`localStorage`, key `ats-theme`) and applied by a small script in `<head>`
before the first paint, so there is no flash of the wrong theme. Dark mode is the `.dark` palette in
`src/app/globals.css`, switched on by a `dark` class on `<html>`; use the theme tokens (`bg-background`,
`text-muted-foreground`, ...) in new components and add a `dark:` variant for any fixed colour.

To reset it, delete `ats-theme` in DevTools > Application > Local Storage. In Playwright, use
`test.use({ colorScheme: "dark" })` to emulate a dark OS (see `e2e/theme.spec.ts`).

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
- `e2e/job-form.spec.ts`: create, edit, close and archive a job, and the list-to-detail link.
- `e2e/candidates.spec.ts`: the candidates list (search and paging in the URL), a profile, the empty and
  not-found states, and a viewer being kept out.
- `e2e/cv-upload.spec.ts`: uploading CVs and following them to parsed, needs review and failed, retry,
  files refused in the browser, a refused upload, and polling stopping when the page is left.
- `src/mocks/scenarios/cv-scenarios.test.ts`: every CV upload scenario, run through the real mock
  handlers in Node. Add a scenario and this fails until it has a test.
- `src/components/candidates/use-cv-polling.test.tsx`: the backoff schedule and every way polling stops
  (final status, leaving the page, 404, repeated failures, time budget), with fake timers.

The end-to-end tests rely on the mock data: the demo accounts (`src/mocks/fixtures/auth.ts`), 25 jobs
(`src/mocks/fixtures/jobs.ts`) and 25 candidates (`src/mocks/fixtures/candidates.ts`). If you change
those fixtures, update the numbers in the specs.

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
