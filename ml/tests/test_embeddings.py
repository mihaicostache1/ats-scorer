"""Tests for the offline embedder.

Most tests replace sentence-transformers with a small fake, so they run in CI without
PyTorch. The tests marked `real_model` load the real model and run only when
ATS_EMBEDDING_MODEL_DIR points at a folder made by `python -m ats_scoring.embeddings download`.
"""

import json
import os
import socket
import sys
import types
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from ats_scoring import score
from ats_scoring.config import DEFAULT_CONFIG
from ats_scoring.embeddings import (
    MARKER_FILE,
    MODEL_DIR_ENV,
    PASSAGE_PREFIX,
    QUERY_PREFIX,
    Embedder,
    check_model_dir,
    download_model,
)

SETTINGS = DEFAULT_CONFIG.embedding

CANDIDATE = {
    "headline": "Backend Developer",
    "summary": "Builds REST services in Python.",
    "skills": [{"raw": "Python", "normalized": "Python"}],
    "experiences": [{"title": "Backend Developer", "bullets": ["Built REST APIs"]}],
}
WITH_IDENTITY = {
    **CANDIDATE,
    "contact": {"full_name": "Maria Ionescu", "email": "maria.ionescu@example.com"},
    "date_of_birth": "1994-03-14",
}
JOB = {"title": "Senior Backend Engineer", "description": "Python, REST, PostgreSQL."}


def model_folder(
    tmp_path: Path, model: str = SETTINGS.model, revision: str = SETTINGS.revision
) -> Path:
    marker = {"model": model, "revision": revision}
    (tmp_path / MARKER_FILE).write_text(json.dumps(marker), encoding="utf-8")
    return tmp_path


class FakeModel:
    """Stands in for SentenceTransformer: records what it was given."""

    instances: list["FakeModel"] = []

    def __init__(self, path: str, **kwargs: Any) -> None:
        self.path, self.kwargs = path, kwargs
        self.encoded: list[str] = []
        self.dimensions = SETTINGS.dimensions
        FakeModel.instances.append(self)

    def get_embedding_dimension(self) -> int:
        return self.dimensions

    def encode(self, texts: list[str], **kwargs: Any) -> np.ndarray:
        assert kwargs["normalize_embeddings"] is True
        self.encoded += texts
        vectors = np.zeros((len(texts), self.dimensions), dtype=np.float32)
        for row, text in enumerate(texts):
            vectors[row, len(text) % self.dimensions] = 1.0
        return vectors


@pytest.fixture
def fake_sentence_transformers(monkeypatch: pytest.MonkeyPatch) -> type[FakeModel]:
    module = types.ModuleType("sentence_transformers")
    module.SentenceTransformer = FakeModel  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "sentence_transformers", module)
    FakeModel.instances = []
    return FakeModel


# --------------------------------------------------------------------------- model folder


def test_no_folder_given_is_explained(
    monkeypatch: pytest.MonkeyPatch, fake_sentence_transformers: Any
) -> None:
    monkeypatch.delenv(MODEL_DIR_ENV, raising=False)
    with pytest.raises(FileNotFoundError, match=MODEL_DIR_ENV):
        Embedder()


def test_folder_without_marker_is_rejected(tmp_path: Path, fake_sentence_transformers: Any) -> None:
    with pytest.raises(FileNotFoundError, match=MARKER_FILE):
        Embedder(tmp_path)


def test_folder_with_another_revision_is_rejected(tmp_path: Path) -> None:
    folder = model_folder(tmp_path, revision="0" * 40)
    with pytest.raises(ValueError, match="Download it again"):
        check_model_dir(folder, SETTINGS)


def test_folder_comes_from_the_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fake_sentence_transformers: Any
) -> None:
    monkeypatch.setenv(MODEL_DIR_ENV, str(model_folder(tmp_path)))

    assert Embedder().folder == tmp_path


def test_model_is_loaded_from_local_files_only(
    tmp_path: Path, fake_sentence_transformers: Any
) -> None:
    Embedder(model_folder(tmp_path))

    model = fake_sentence_transformers.instances[0]
    assert model.path == str(tmp_path)
    assert model.kwargs["local_files_only"] is True
    assert model.kwargs["device"] == "cpu"


def test_wrong_dimension_is_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fake_sentence_transformers: Any
) -> None:
    monkeypatch.setattr(FakeModel, "get_embedding_dimension", lambda self: 768)
    with pytest.raises(ValueError, match="768"):
        Embedder(model_folder(tmp_path))


def test_download_pins_the_revision_and_writes_the_marker(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[dict[str, Any]] = []
    module = types.ModuleType("huggingface_hub")
    module.snapshot_download = lambda repo, **kwargs: calls.append({"repo": repo, **kwargs})  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "huggingface_hub", module)

    folder = download_model(tmp_path / "model")

    assert calls[0]["repo"] == SETTINGS.model
    assert calls[0]["revision"] == SETTINGS.revision
    check_model_dir(folder, SETTINGS)  # does not raise


# --------------------------------------------------------------------------- what is embedded


def test_cvs_and_jobs_get_their_e5_prefixes(
    tmp_path: Path, fake_sentence_transformers: Any
) -> None:
    embedder = Embedder(model_folder(tmp_path))

    embedder.embed_candidate(CANDIDATE)
    embedder.embed_job(JOB)

    first, second = fake_sentence_transformers.instances[0].encoded
    assert first.startswith(PASSAGE_PREFIX + "Backend Developer")
    assert second.startswith(QUERY_PREFIX + "Senior Backend Engineer")


def test_only_qualifications_are_embedded(tmp_path: Path, fake_sentence_transformers: Any) -> None:
    embedder = Embedder(model_folder(tmp_path))

    embedder.embed_candidates([CANDIDATE, WITH_IDENTITY])

    plain, with_identity = fake_sentence_transformers.instances[0].encoded
    assert plain == with_identity
    assert "Maria" not in with_identity and "1994" not in with_identity


def test_nothing_to_embed_gives_none(tmp_path: Path, fake_sentence_transformers: Any) -> None:
    embedder = Embedder(model_folder(tmp_path))

    vectors = embedder.embed_candidates([{}, CANDIDATE, {"skills": []}])

    assert vectors[0] is None and vectors[2] is None
    assert vectors[1] is not None and len(vectors[1]) == SETTINGS.dimensions
    assert len(fake_sentence_transformers.instances[0].encoded) == 1
    assert embedder.embed_candidates([]) == []


# --------------------------------------------------------------------------- real model

real_model = pytest.mark.skipif(
    not os.environ.get(MODEL_DIR_ENV), reason=f"set {MODEL_DIR_ENV} to run with the real model"
)


@pytest.fixture(scope="module")
def real_embedder() -> Embedder:
    pytest.importorskip("sentence_transformers")
    return Embedder()


@real_model
def test_real_model_runs_without_network(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("sentence_transformers")

    def refuse(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("tried to open a network connection")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)

    embedder = Embedder()
    assert embedder.embed_job(JOB) is not None


@real_model
def test_real_embedding_is_the_same_alone_and_in_a_batch(real_embedder: Embedder) -> None:
    alone = np.array(real_embedder.embed_candidate(CANDIDATE))
    other = {"headline": "Pastry Chef", "summary": "Bakes bread. " * 50}
    batch = np.array(real_embedder.embed_candidates([other, CANDIDATE])[1])

    assert np.abs(alone - batch).max() < 1e-5
    assert np.linalg.norm(alone) == pytest.approx(1.0, abs=1e-5)


@real_model
def test_real_embeddings_rank_the_closer_cv_higher(real_embedder: Embedder) -> None:
    chef = {"headline": "Pastry Chef", "summary": "Bakes croissants and sourdough bread."}
    job_vector = real_embedder.embed_job(JOB)
    developer, baker = real_embedder.embed_candidates([CANDIDATE, chef])

    near = score(CANDIDATE, JOB, candidate_embedding=developer, job_embedding=job_vector)
    far = score(chef, JOB, candidate_embedding=baker, job_embedding=job_vector)

    assert near["components"]["embedding_similarity"] > far["components"]["embedding_similarity"]
