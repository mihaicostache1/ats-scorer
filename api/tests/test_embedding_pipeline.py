"""Exercise the parser, review, worker and backfill with pgvector and a fake encoder."""

import uuid
from collections.abc import Callable, Sequence
from datetime import timedelta
from typing import Any

import pytest
from ats_scoring.config import DEFAULT_CONFIG
from ats_scoring.embeddings import Embedder
from ats_scoring.parsed_cv import Contact, ParsedCV, Skill
from httpx import AsyncClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.v1.endpoints import jobs as job_endpoints
from app.core.config import settings
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.job import Job
from app.models.user import User
from app.services import embedding_pipeline as pipeline
from app.services.cv_extraction import _mark_parsed
from app.worker import WorkerSettings
from scripts import backfill_embeddings


class RecordingEmbedder(Embedder):
    """Keep the real text preparation and replace only the model call."""

    def __init__(self) -> None:
        self.inputs: list[str] = []
        self.on_encode: Callable[[], None] | None = None

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        self.inputs.extend(texts)
        if self.on_encode is not None:
            self.on_encode()
        return [
            [
                float(index == len(text) % DEFAULT_CONFIG.embedding.dimensions)
                for index in range(DEFAULT_CONFIG.embedding.dimensions)
            ]
            for text in texts
        ]


@pytest.fixture
def encoder(monkeypatch: pytest.MonkeyPatch) -> RecordingEmbedder:
    encoder = RecordingEmbedder()
    monkeypatch.setattr(pipeline, "_embedder", lambda: encoder)
    monkeypatch.setattr(settings, "ATS_EMBEDDING_MODEL_DIR", "/fake/local/model")
    return encoder


def _parsed() -> ParsedCV:
    return ParsedCV(
        schema_version="1.1",
        source="parser",
        contact=Contact(name="Jane Smith", email="jane@example.org"),
        summary="Jane Smith builds Python services. Contact jane@example.org",
        skills=[Skill(raw="Docker", normalized="Docker")],
    )


def _candidate(db: Session, reviewer: User) -> tuple[Candidate, CvDocument]:
    candidate = Candidate(
        id=uuid.uuid4(),
        org_id=reviewer.org_id,
        full_name="Jane Smith",
        email="jane@example.org",
    )
    document = CvDocument(
        org_id=reviewer.org_id,
        candidate_id=candidate.id,
        storage_key=f"{uuid.uuid4()}.pdf",
        original_filename="cv.pdf",
        content_type="application/pdf",
        size_bytes=100,
        sha256="a" * 64,
        status="extracted",
        extracted_text="raw OCR text that must never reach the model",
    )
    candidate.cv_documents.append(document)
    db.add(candidate)
    db.commit()
    return candidate, document


async def test_worker_reembeds_corrected_profile_without_encoding_identity(
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    reviewer = create_user("recruiter")
    candidate, document = _candidate(committed_db, reviewer)
    sessions = sessionmaker(bind=db_engine)
    context = {"sessions": sessions}
    (job,) = WorkerSettings.cron_jobs
    assert job.coroutine is pipeline.embed_pending
    assert await pipeline.embed_pending(context) == 0

    assert _mark_parsed(sessions, document.id, _parsed()) == "parsed"
    committed_db.refresh(candidate)
    parsed_at = candidate.updated_at
    assert await pipeline.embed_pending(context) == 1
    (text,) = encoder.inputs
    assert text.startswith("passage: ")
    assert "Python services" in text and "Docker" in text
    assert "Jane Smith" not in text and "jane@example.org" not in text
    assert "raw OCR text" not in text
    committed_db.refresh(candidate)
    assert candidate.embedding is not None
    original = list(candidate.embedding)
    assert len(original) == DEFAULT_CONFIG.embedding.dimensions
    assert candidate.embedding_model_version == pipeline.EMBEDDING_MODEL_VERSION
    assert candidate.updated_at == parsed_at
    assert await pipeline.embed_pending(context) == 0

    login_as(reviewer)
    url = f"/api/v1/candidates/{candidate.id}/parsed-profile"
    assert (
        await async_client.patch(url, json={"contact": {"email": "corrected@example.org"}})
    ).status_code == 200
    assert await pipeline.embed_pending(context) == 0
    assert len(encoder.inputs) == 1
    correction = {"summary": "Builds Rust tools"}
    response = await async_client.patch(url, json=correction)
    assert response.status_code == 200
    committed_db.refresh(candidate)
    assert candidate.embedding is None and candidate.embedding_model_version is None
    assert await pipeline.embed_pending(context) == 1
    assert encoder.inputs[1] == "passage: Builds Rust tools\nDocker"
    committed_db.refresh(candidate)
    assert candidate.embedding is not None and list(candidate.embedding) != original
    assert candidate.embedding_model_version == pipeline.EMBEDDING_MODEL_VERSION

    assert (await async_client.patch(url, json=correction)).status_code == 200
    assert await pipeline.embed_pending(context) == 0
    assert len(encoder.inputs) == 2


@pytest.mark.parametrize(
    ("parsed_name", "rename"), [(None, False), (None, True), ("Julia Black", True)]
)
async def test_scrubs_canonical_and_prior_names_after_edits(
    parsed_name: str | None,
    rename: bool,
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    reviewer = create_user("recruiter")
    candidate, document = _candidate(committed_db, reviewer)
    sessions = sessionmaker(bind=db_engine)
    parsed = _parsed()
    parsed.contact.name = parsed_name
    names = ["Jane Smith"]
    if rename:
        names += ["Robin Wells", "Casey Green"]
    if parsed_name:
        names.append(parsed_name)
    parsed.summary = ", ".join(names) + " Built cloud services."
    assert _mark_parsed(sessions, document.id, parsed) in {"parsed", "needs_review"}
    login_as(reviewer)
    url = f"/api/v1/candidates/{candidate.id}"
    contact = {"phone": "+40123456789"}
    if rename:
        first = await async_client.patch(url, json={"full_name": "Robin Wells"})
        assert first.status_code == 200
        contact = {"name": "Casey Green"}
    correction = await async_client.patch(f"{url}/parsed-profile", json={"contact": contact})
    assert correction.status_code == 200

    assert await pipeline.embed_pending({"sessions": sessions}) == 1
    (text,) = encoder.inputs
    assert "Built cloud services" in text
    assert all(part not in text for name in names for part in name.split())


@pytest.mark.parametrize("newer_status", ["queued", "extracting", "failed"])
async def test_saved_parse_can_embed_while_a_newer_upload_has_no_result(
    newer_status: str,
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
) -> None:
    candidate, old = _candidate(committed_db, create_user())
    committed_db.add(
        CvDocument(
            org_id=candidate.org_id,
            candidate_id=candidate.id,
            storage_key=f"{uuid.uuid4()}.pdf",
            original_filename="replacement.pdf",
            content_type=old.content_type,
            size_bytes=old.size_bytes,
            sha256=old.sha256,
            created_at=old.created_at + timedelta(seconds=1),
            status=newer_status,
        )
    )
    committed_db.commit()
    sessions = sessionmaker(bind=db_engine)
    assert _mark_parsed(sessions, old.id, _parsed()) == "parsed"
    assert await pipeline.embed_pending({"sessions": sessions}) == 1
    assert "Python services" in encoder.inputs[0]


async def test_needs_review_waits_for_a_saved_correction(
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
) -> None:
    reviewer = create_user("recruiter")
    candidate, document = _candidate(committed_db, reviewer)
    sessions = sessionmaker(bind=db_engine)
    parsed = _parsed()
    parsed.confidence["/contact/name"] = 0.5
    assert _mark_parsed(sessions, document.id, parsed) == "needs_review"
    assert await pipeline.embed_pending({"sessions": sessions}) == 0
    assert encoder.inputs == []

    login_as(reviewer)
    corrected = await async_client.patch(
        f"/api/v1/candidates/{candidate.id}/parsed-profile", json={"summary": "Builds Rust tools"}
    )
    assert corrected.status_code == 200
    committed_db.refresh(document)
    assert document.status == "needs_review"
    assert await pipeline.embed_pending({"sessions": sessions}) == 1
    assert encoder.inputs == ["passage: Builds Rust tools\nDocker"]


def test_changed_snapshot_cannot_receive_an_older_embedding(
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
) -> None:
    candidate, document = _candidate(committed_db, create_user())
    sessions = sessionmaker(bind=db_engine)
    assert _mark_parsed(sessions, document.id, _parsed()) == "parsed"

    def reparse_during_inference() -> None:
        with sessions() as db:
            current = db.get(CvDocument, document.id)
            assert current is not None
            current.status = "extracted"
            db.commit()
        corrected = _parsed().model_copy(update={"summary": "Builds Rust tools"})
        assert _mark_parsed(sessions, document.id, corrected) == "parsed"

    encoder.on_encode = reparse_during_inference
    assert pipeline.embed_batch(sessions, "candidates").written == 0
    committed_db.refresh(candidate)
    assert candidate.embedding is None and candidate.embedding_model_version is None
    encoder.on_encode = None
    assert pipeline.embed_batch(sessions, "candidates").written == 1
    assert encoder.inputs[-1] == "passage: Builds Rust tools\nDocker"


async def test_job_edits_and_backfill_refresh_missing_or_stale_rows(
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    login_as(create_user("recruiter"))
    context: dict[str, Any] = {"sessions": sessionmaker(bind=db_engine)}
    added = await async_client.post(
        "/api/v1/jobs",
        json={
            "title": "Software engineer",
            "description": "Uses Docker",
            "required_skills": ["Go"],
        },
    )
    assert added.status_code == 201
    job = committed_db.get(Job, uuid.UUID(added.json()["id"]))
    assert job is not None
    assert await pipeline.embed_pending(context) == 1
    assert encoder.inputs == ["query: Software engineer\nUses Docker\nGo"]
    committed_db.refresh(job)
    assert job.embedding is not None
    assert job.embedding_model_version == pipeline.EMBEDDING_MODEL_VERSION
    url = f"/api/v1/jobs/{job.id}"
    assert (await async_client.patch(url, json={"department": "Engineering"})).status_code == 200
    assert await pipeline.embed_pending(context) == 0
    assert (
        await async_client.patch(url, json={"description": "Uses Kubernetes"})
    ).status_code == 200
    committed_db.refresh(job)
    assert job.embedding is None and job.embedding_model_version is None

    stale = Job(
        org_id=job.org_id,
        title="Stale job",
        description="Uses Linux",
        embedding_model_version="old-model@old-revision",
    )
    historical = Candidate(
        org_id=job.org_id,
        full_name="Historical candidate",
        email="historical@example.org",
        embedding_ready=True,
        parsed_data={
            "schema_version": "1.0",
            "source": "parser",
            "skills": [{"raw": "SQL", "normalized": None}],
        },
    )
    empty = Candidate(
        org_id=job.org_id,
        full_name="Candidate with no qualifications",
        email="contact-only@example.org",
        embedding_ready=True,
        parsed_data={
            "schema_version": "1.0",
            "source": "parser",
            "contact": {"email": "contact-only@example.org"},
            "skills": [],
        },
    )
    committed_db.add_all([stale, historical, empty])
    committed_db.commit()
    monkeypatch.setattr(backfill_embeddings, "SessionLocal", context["sessions"])
    assert backfill_embeddings.main(["--batch-size", "1"]) == 0
    assert capsys.readouterr().out.splitlines() == ["candidates: processed 2", "jobs: processed 2"]
    assert len(encoder.inputs) == 4
    assert "passage: SQL" in encoder.inputs
    assert "query: Software engineer\nUses Kubernetes\nGo" in encoder.inputs
    assert "query: Stale job\nUses Linux" in encoder.inputs
    committed_db.refresh(empty)
    assert empty.embedding is None
    assert empty.embedding_model_version == pipeline.EMBEDDING_MODEL_VERSION
    assert backfill_embeddings.main(["--batch-size", "1"]) == 0
    assert capsys.readouterr().out.splitlines() == ["candidates: processed 0", "jobs: processed 0"]
    assert len(encoder.inputs) == 4


@pytest.mark.parametrize("keep_editing", [False, True])
def test_backfill_retries_stale_model_rows_after_concurrent_edit(
    keep_editing: bool,
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    org_id = create_user().org_id
    job = Job(org_id=org_id, title="Stale", description="Go", embedding_model_version="old")
    committed_db.add(job)
    committed_db.commit()
    sessions = sessionmaker(bind=db_engine)
    edits = 0

    def edit_unrelated_field() -> None:
        nonlocal edits
        edits += 1
        with sessions.begin() as db:
            row = db.get(Job, job.id)
            assert row is not None
            row.department = f"Department {edits}"
        if not keep_editing:
            encoder.on_encode = None

    encoder.on_encode = edit_unrelated_field
    monkeypatch.setattr(backfill_embeddings, "SessionLocal", sessions)
    assert backfill_embeddings.main(["--batch-size", "1"]) == int(keep_editing)
    assert len(encoder.inputs) >= 2
    output = capsys.readouterr()
    committed_db.refresh(job)
    if keep_editing:
        assert job.embedding_model_version == "old"
        assert "1 rows kept changing" in output.err
    else:
        assert job.embedding_model_version == pipeline.EMBEDDING_MODEL_VERSION
        assert "jobs: processed 1" in output.out


async def test_job_edit_invalidates_a_vector_filled_after_the_job_was_loaded(
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    async_client: AsyncClient,
    create_user: Callable[..., User],
    login_as: Callable[[User], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = create_user("recruiter")
    login_as(recruiter)
    job = Job(org_id=recruiter.org_id, title="Engineer", description="Uses Docker")
    committed_db.add(job)
    committed_db.commit()
    sessions = sessionmaker(bind=db_engine)
    lookup = job_endpoints._get_job_or_404

    def load_then_embed(db: Session, job_id: uuid.UUID) -> Job:
        loaded = lookup(db, job_id)
        assert loaded.embedding_model_version is None
        assert pipeline.embed_batch(sessions, "jobs").written == 1
        return loaded

    monkeypatch.setattr(job_endpoints, "_get_job_or_404", load_then_embed)
    assert (
        await async_client.patch(f"/api/v1/jobs/{job.id}", json={"description": "Uses Kubernetes"})
    ).status_code == 200
    committed_db.refresh(job)
    assert job.embedding is None and job.embedding_model_version is None
    assert pipeline.embed_batch(sessions, "jobs").written == 1
    assert encoder.inputs == ["query: Engineer\nUses Docker", "query: Engineer\nUses Kubernetes"]


async def test_worker_drains_multiple_batches_in_one_run(
    encoder: RecordingEmbedder,
    db_engine: Engine,
    committed_db: Session,
    create_user: Callable[..., User],
) -> None:
    org_id = create_user().org_id
    count = pipeline.BATCH_SIZE + 3
    committed_db.add_all(
        Job(org_id=org_id, title=f"Posting {i}", description="Go") for i in range(count)
    )
    committed_db.commit()
    assert await pipeline.embed_pending({"sessions": sessionmaker(bind=db_engine)}) == count
    assert len(encoder.inputs) == count
