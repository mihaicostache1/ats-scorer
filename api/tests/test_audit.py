"""Audit endpoint tests."""

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent

REGISTER_PAYLOAD = {
    "org_name": "Audit Org",
    "org_slug": "audit-org-1",
    "admin_full_name": "Audit Admin",
    "admin_email": "admin@auditorg.com",
    "admin_password": "SuperSecret123!",
}


@pytest.mark.asyncio
async def test_audit_events_created_on_register_and_login(
    async_client: AsyncClient, db_session: Session
) -> None:
    """Test that audit events are created on register and login."""
    # 1. Register
    response = await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 201

    events = db_session.query(AuditEvent).all()
    assert len(events) == 2
    actions = {e.action for e in events}
    assert actions == {"create_org", "create_user"}

    # 2. Login
    login_response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["admin_email"], "password": REGISTER_PAYLOAD["admin_password"]},
    )
    assert login_response.status_code == 200

    events = db_session.query(AuditEvent).all()
    assert len(events) == 3
    actions = {e.action for e in events}
    assert actions == {"create_org", "create_user", "login"}


@pytest.mark.asyncio
async def test_audit_events_list_endpoint(async_client: AsyncClient, db_session: Session) -> None:
    """Test the admin endpoint to list audit events."""
    # Register and login to get admin access
    await async_client.post("/api/v1/auth/register", json=REGISTER_PAYLOAD)
    await async_client.post(
        "/api/v1/auth/login",
        json={"email": REGISTER_PAYLOAD["admin_email"], "password": REGISTER_PAYLOAD["admin_password"]},
    )

    # Fetch audit events
    response = await async_client.get("/api/v1/audit/events")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    actions = {item["action"] for item in data["items"]}
    assert actions == {"create_org", "create_user", "login"}
    
    # Test pagination
    response_paged = await async_client.get("/api/v1/audit/events?page=1&size=2")
    assert response_paged.status_code == 200
    data_paged = response_paged.json()
    assert data_paged["total"] == 3
    assert len(data_paged["items"]) == 2
