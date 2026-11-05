FROM python:3.11-slim

WORKDIR /app/api

# curl for Docker health checks, Tesseract for OCR of scanned CVs (used by the worker)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications
COPY api/requirements.txt api/requirements-dev.txt ./
COPY ml /app/ml

# Install Python dependencies including dev requirements for CI/testing
RUN pip install --no-cache-dir -r requirements-dev.txt

# Copy application source code and migrations
COPY api/app ./app
COPY api/alembic ./alembic
COPY api/tests ./tests
COPY api/scripts ./scripts
COPY docs/openapi.yaml /app/docs/openapi.yaml
COPY api/alembic.ini api/pyproject.toml api/start-staging.sh ./

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
