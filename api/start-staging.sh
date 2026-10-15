#!/bin/sh
# Start command for staging (see render.yaml): apply migrations, then serve the API.
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
