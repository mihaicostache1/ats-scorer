"""Main API v1 Router Aggregator."""

from fastapi import APIRouter

from app.api.v1.endpoints import audit, auth, health, users

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(auth.router)
api_router.include_router(audit.router)
api_router.include_router(users.router)
