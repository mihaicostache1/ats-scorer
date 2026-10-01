"""Tests for SQLAlchemy ORM Models and Multi-Tenant Schema."""

import uuid

from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.audit_event import AuditEvent
from app.models.candidate import Candidate
from app.models.consent_record import ConsentRecord
from app.models.job import Job
from app.models.organization import Organization
from app.models.score import Score
from app.models.user import User


def test_tenant_tables_have_org_id() -> None:
    """Verify every tenant table model explicitly contains org_id foreign key attribute."""
    tenant_models = [
        User,
        Job,
        Candidate,
        Application,
        Score,
        AuditEvent,
        ConsentRecord,
    ]
    for model in tenant_models:
        assert hasattr(model, "org_id"), f"Model {model.__name__} is missing org_id!"


def test_create_organization_and_user(db_session: Session, test_org: Organization) -> None:
    """Test organization persistence and user creation."""
    user = User(
        id=uuid.uuid4(),
        org_id=test_org.id,
        email="admin@testcorp.com",
        hashed_password="secret_password",
        full_name="Admin User",
        role="admin",
    )
    db_session.add(user)
    db_session.commit()

    fetched = db_session.query(User).filter_by(id=user.id).first()
    assert fetched is not None
    assert fetched.org_id == test_org.id
    assert fetched.role == "admin"


def test_create_score_with_component_breakdown(
    db_session: Session,
    test_org: Organization,
    test_job: Job,
    test_candidate: Candidate,
    test_application: Application,
) -> None:
    """Test score creation storing model_version and component_breakdown JSONB."""
    score = Score(
        id=uuid.uuid4(),
        org_id=test_org.id,
        application_id=test_application.id,
        job_id=test_job.id,
        candidate_id=test_candidate.id,
        overall_score=88.50,
        skill_overlap_score=90.00,
        semantic_score=85.00,
        experience_score=92.00,
        title_fit_score=80.00,
        model_version="v1.0.0-baseline-cpu",
        component_breakdown={
            "matched_skills": ["Python", "FastAPI"],
            "missing_skills": ["Docker"],
            "score_explanations": ["Matched 2 of 3 required skills."],
        },
    )
    db_session.add(score)
    db_session.commit()

    fetched = db_session.query(Score).filter_by(id=score.id).first()
    assert fetched is not None
    assert fetched.model_version == "v1.0.0-baseline-cpu"
    assert fetched.component_breakdown["matched_skills"] == ["Python", "FastAPI"]
    assert fetched.overall_score == 88.50


def test_create_audit_event_and_consent_record(
    db_session: Session, test_org: Organization, test_candidate: Candidate
) -> None:
    """Test audit logging and consent record creation."""
    audit = AuditEvent(
        id=uuid.uuid4(),
        org_id=test_org.id,
        action="candidate.upload",
        target_entity="candidate",
        target_id=test_candidate.id,
        details={"file_name": "resume.pdf"},
    )
    consent = ConsentRecord(
        id=uuid.uuid4(),
        org_id=test_org.id,
        candidate_id=test_candidate.id,
        candidate_email_hash="a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
        consent_type="data_processing",
        status="granted",
    )
    db_session.add_all([audit, consent])
    db_session.commit()

    fetched_audit = db_session.query(AuditEvent).filter_by(id=audit.id).first()
    assert fetched_audit is not None
    assert fetched_audit.action == "candidate.upload"

    fetched_consent = db_session.query(ConsentRecord).filter_by(id=consent.id).first()
    assert fetched_consent is not None
    assert fetched_consent.status == "granted"
