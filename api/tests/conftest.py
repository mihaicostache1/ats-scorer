"""Pytest Configuration and Shared Test Fixtures."""

import uuid
from collections.abc import AsyncGenerator, Generator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.main import app
from app.models.application import Application
from app.models.candidate import Candidate
from app.models.job import Job
from app.models.organization import Organization
from app.models.pipeline_stage import PipelineStage
from app.models.user import User


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client fixture using httpx and ASGITransport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture(scope="session")
def db_engine():
    """Create test SQLAlchemy engine."""
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine) -> Generator[Session, None, None]:
    """Provide transactional database session for unit tests."""
    connection = db_engine.connect()
    transaction = connection.begin()
    SessionTest = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = SessionTest()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def test_org(db_session: Session) -> Organization:
    """Fixture providing a test tenant organization."""
    org = Organization(
        id=uuid.uuid4(),
        name="Test Corp",
        slug=f"test-corp-{uuid.uuid4().hex[:6]}",
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def test_user(db_session: Session, test_org: Organization) -> User:
    """Fixture providing a test user assigned to tenant organization."""
    user = User(
        id=uuid.uuid4(),
        org_id=test_org.id,
        email=f"user-{uuid.uuid4().hex[:6]}@testcorp.com",
        hashed_password="hashed_secret_password",
        full_name="Test User",
        role="recruiter",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_job(db_session: Session, test_org: Organization, test_user: User) -> Job:
    """Fixture providing a test job posting."""
    job = Job(
        id=uuid.uuid4(),
        org_id=test_org.id,
        title="Senior Python Backend Engineer",
        department="Engineering",
        location="Remote",
        employment_type="full_time",
        status="open",
        description="We are seeking a Senior Python Engineer.",
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        preferred_skills=["Docker", "Redis"],
        min_experience_years=3,
        created_by=test_user.id,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


@pytest.fixture
def test_candidate(db_session: Session, test_org: Organization) -> Candidate:
    """Fixture providing a test candidate."""
    candidate = Candidate(
        id=uuid.uuid4(),
        org_id=test_org.id,
        full_name="Jane Candidate",
        email=f"jane-{uuid.uuid4().hex[:6]}@example.com",
        phone="+1-555-0199",
        parsed_data={"skills": ["Python", "FastAPI", "PostgreSQL"], "experience_years": 4.0},
    )
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)
    return candidate


@pytest.fixture
def test_stage(db_session: Session, test_org: Organization, test_job: Job) -> PipelineStage:
    """Fixture providing a test pipeline stage."""
    stage = PipelineStage(
        id=uuid.uuid4(),
        org_id=test_org.id,
        job_id=test_job.id,
        name="Applied",
        stage_order=1,
        stage_type="applied",
    )
    db_session.add(stage)
    db_session.commit()
    db_session.refresh(stage)
    return stage


@pytest.fixture
def test_application(
    db_session: Session,
    test_org: Organization,
    test_job: Job,
    test_candidate: Candidate,
    test_stage: PipelineStage,
) -> Application:
    """Fixture providing a test application."""
    application = Application(
        id=uuid.uuid4(),
        org_id=test_org.id,
        job_id=test_job.id,
        candidate_id=test_candidate.id,
        stage_id=test_stage.id,
        status="active",
    )
    db_session.add(application)
    db_session.commit()
    db_session.refresh(application)
    return application
