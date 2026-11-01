## Local development setup

Infrastructure (Postgres + pgvector, Redis) runs in Docker. The API and web app run natively.

### Prerequisites
- Docker Desktop (macOS/Windows) or Docker Engine + Compose plugin (Linux)
- Python 3.11+ and Node 20+
- Tesseract OCR (see below)

### Install Tesseract
| OS | Command |
|---|---|
| macOS | `brew install tesseract` |
| Ubuntu/Debian | `sudo apt update && sudo apt install -y tesseract-ocr` |
| Windows | `winget install UB-Mannheim.TesseractOCR`, then add `C:\Program Files\Tesseract-OCR` to PATH (or set `TESSERACT_CMD` in `.env`) |

Verify it with: `tesseract --version`

### Start infrastructure
```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d
docker compose ps             # both services should show "healthy"
```

If port 5432 or 6379 is already in use, change `POSTGRES_PORT` / `REDIS_PORT` in `.env` and update `DATABASE_URL` / `REDIS_URL` to match.

### Stop / reset
```bash
docker compose down           # stop
docker compose down -v        # stop AND delete all data
```

### Run the apps
Install backend dependencies from `api/` with `pip install -r requirements-dev.txt`, then
run `alembic upgrade head`. This installs the shared `ml/` package and the pinned
spaCy `en_core_web_sm` model as well.

- API: `uvicorn app.main:app --reload` (from the backend folder)
- Worker: `arq app.worker.WorkerSettings` (from the backend folder, in a second terminal)
- Web: `npm run dev` (from the web folder)
- Web tests: `npm test` and `npm run test:e2e` (from the web folder). See [web/README.md](web/README.md#testing).

### Background worker
Uploaded CVs are processed by an [Arq](https://arq-docs.helpmanual.io/) worker that reads jobs from Redis. The API only queues the work, so without a running worker an uploaded CV stays `queued`.

The worker extracts the text with PyMuPDF and uses Tesseract for scanned pages, then
parses it into the shared L-10 schema using spaCy and the L-11 skill normalizer. It
needs the same `.env` as the API (`DATABASE_URL`, `REDIS_URL`, `STORAGE_LOCAL_DIR`)
and must see the same storage folder. A CV goes `queued` → `extracting` → `extracted`
→ `parsed` or `needs_review`, or ends as `failed` with an error code. `docker compose up`
starts a worker container too. Docker builds use the repository root as their context:
`docker build -f api/Dockerfile .`.

Set `ESCO_SKILLS_CSV` in the worker environment to enable ESCO matching; otherwise L-11
uses its alias table and preserves other skills as free text. Parser setup, review
rules and the measured synthetic accuracy are in [CV structured extraction](docs/ml/cv-structured-extraction.md).

### Demo Data (Dev-only)
You can populate the database with synthetic data (a demo organization, users, and 20 job postings) by running:
```bash
make seed
```
**Demo credentials (dev-only):**
- **Admin**: `admin@demo.com` / `DevOnly123!`
- **Recruiter**: `recruiter@demo.com` / `DevOnly123!`

## Folder Structure

- `/api` - Python FastAPI backend service, containing domain logic and vector store logic.
- `/web` - Next.js (App Router) frontend application using TypeScript, Tailwind CSS, and shadcn/ui.
- `/ml` - Machine-learning code and data tools. `/ml/ats_scoring` is the scoring package, `/ml/synthetic` generates the synthetic CV and job dataset.
- `/docs` - Project documentation.
- `.github/workflows` - CI pipelines for testing the API, Web and ML code.

## Documentation

- [Scope, personas and user stories](docs/scope.md)
- [Privacy and ethics checklist](docs/privacy-ethics-checklist.md)
- [API specification](docs/api_spec.md) and [OpenAPI file](docs/openapi.yaml)
- [Data model](docs/erd.md) and [candidate deletion decision](docs/candidate_deletion_decision.md)
- [UI wireframes](docs/ui_wireframes.md)
- [Synthetic CV and job dataset](ml/synthetic/README.md)
- [Embedding model and skill matching](docs/ml/embedding-model-and-skill-matching.md)
- [Scoring package](ml/README.md) and [parsed-CV schema](docs/ml/parsed-cv-schema.md)
- [Evaluation harness and rating process](docs/ml/evaluation.md)
