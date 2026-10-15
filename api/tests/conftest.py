"""Pytest Configuration and Shared Test Fixtures."""

import uuid
from collections.abc import AsyncGenerator, Callable, Generator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.security import create_access_token
from app.main import app
from app.models import Base
from app.models.application import Application
from app.models.candidate import Candidate
from app.models.job import Job
from app.models.organization import Organization
from app.models.pipeline_stage import PipelineStage
from app.models.user import User
from app.services.job_queue import QueueUnavailableError, get_job_queue
from app.services.pipeline_service import seed_default_stages
from app.services.storage import LocalDiskStorage, get_storage


@pytest.fixture
async def async_client(db_engine) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client fixture using httpx and ASGITransport."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture
def db_engine():
    """Create test SQLAlchemy engine."""
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
    # Create all tables before tests
    Base.metadata.create_all(engine)
    yield engine
    # Drop all tables after tests
    Base.metadata.drop_all(engine)
    with engine.connect() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        conn.commit()
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


@pytest.fixture
def committed_db(db_engine) -> Generator[Session, None, None]:
    """Session that really commits, for data the app's own request sessions must see.

    Unlike ``db_session`` it is not rolled back; ``db_engine`` drops the tables afterwards.
    """
    session = Session(db_engine, expire_on_commit=False)
    yield session
    session.close()


@pytest.fixture
def create_user(committed_db: Session) -> Callable[..., User]:
    """Factory committing a user, in a brand-new organization unless ``org_id`` is given."""

    def _create(role: str = "admin", org_id: uuid.UUID | None = None) -> User:
        suffix = uuid.uuid4().hex[:8]
        if org_id is None:
            org = Organization(id=uuid.uuid4(), name=f"Org {suffix}", slug=f"org-{suffix}")
            committed_db.add(org)
            committed_db.flush()
            seed_default_stages(committed_db, org.id)
            org_id = org.id
        user = User(
            id=uuid.uuid4(),
            org_id=org_id,
            email=f"{role}-{suffix}@example.com",
            hashed_password="hashed_password",
            full_name=f"{role.title()} {suffix}",
            role=role,
        )
        committed_db.add(user)
        committed_db.commit()
        return user

    return _create


@pytest.fixture(autouse=True)
def cv_storage(tmp_path: Path) -> Generator[LocalDiskStorage, None, None]:
    """Point the app's file storage at a temporary directory for every test."""
    storage = LocalDiskStorage(tmp_path / "storage")
    app.dependency_overrides[get_storage] = lambda: storage
    yield storage
    app.dependency_overrides.pop(get_storage, None)


class RecordingJobQueue:
    """Stands in for Redis: remembers what was queued, and can be made to fail."""

    def __init__(self) -> None:
        self.cv_extractions: list[uuid.UUID] = []
        self.available = True

    def enqueue_cv_extraction(self, cv_document_id: uuid.UUID) -> None:
        if not self.available:
            raise QueueUnavailableError("Redis is down")
        self.cv_extractions.append(cv_document_id)


@pytest.fixture(autouse=True)
def job_queue() -> Generator[RecordingJobQueue, None, None]:
    """Replace the app's job queue for every test, so no test needs Redis."""
    queue = RecordingJobQueue()
    app.dependency_overrides[get_job_queue] = lambda: queue
    yield queue
    app.dependency_overrides.pop(get_job_queue, None)


@pytest.fixture
def login_as(async_client: AsyncClient) -> Callable[[User], None]:
    """Authenticate ``async_client`` as the given user via the access-token cookie."""

    def _login(user: User) -> None:
        token = create_access_token(user_id=str(user.id), org_id=str(user.org_id), role=user.role)
        async_client.cookies.set(settings.ACCESS_COOKIE_NAME, token)

    return _login
