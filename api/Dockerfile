FROM python:3.11-slim

WORKDIR /app

# Install curl for Docker health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications
COPY requirements.txt requirements-dev.txt ./

# Install Python dependencies including dev requirements for CI/testing
RUN pip install --no-cache-dir -r requirements-dev.txt

# Copy application source code and migrations
COPY app ./app
COPY alembic ./alembic
COPY tests ./tests
COPY alembic.ini pyproject.toml ./

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
