"""Health Check Endpoint."""

from typing import Any

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health", response_model=dict[str, Any], status_code=200)
async def health_check() -> dict[str, Any]:
    """Health check endpoint verifying system operational status."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }
