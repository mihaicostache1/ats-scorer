"""Tests for Health Check Endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_health_check(async_client: AsyncClient) -> None:
    """Test GET /health returns HTTP 200 OK and healthy status payload."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data
    assert "version" in data
    assert "environment" in data


@pytest.mark.asyncio
async def test_v1_health_check(async_client: AsyncClient) -> None:
    """Test GET /api/v1/health returns HTTP 200 OK."""
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
