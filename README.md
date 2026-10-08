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
- API: `uvicorn app.main:app --reload` (from the backend folder)
- Web: `npm run dev` (from the web folder)

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
- `/docs` - Project documentation.
- `.github/workflows` - CI pipelines for testing the API and Web services.
