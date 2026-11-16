"""Embeddings of CVs and jobs for the scorer, computed offline from a local copy of the model.

The scorer never loads a model: `score()` takes embeddings that were computed earlier, once
per CV when it is parsed and once per job when it is saved, and only compares them. This
module computes them. It needs the `[embeddings]` extra (sentence-transformers and PyTorch).

    python -m ats_scoring.embeddings download --to models/multilingual-e5-small

`download` is the only step that uses the network. After it, `Embedder` loads the model from
that folder with `local_files_only`, so computing an embedding never contacts the Hub. The
folder is checked against the model and revision in weights.yaml, so every embedding in the
system comes from the same model files.
"""

import argparse
import json
import os
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

from ats_scoring.config import DEFAULT_CONFIG, EmbeddingSettings
from ats_scoring.redaction import redact
from ats_scoring.text import candidate_text, job_text

# Folder with the downloaded model, used when Embedder is not given one.
MODEL_DIR_ENV = "ATS_EMBEDDING_MODEL_DIR"
# Written by `download` next to the model files; records which model and revision they are.
MARKER_FILE = "ats_embedding_model.json"
# e5 is trained with these prefixes. Leaving them out lowers quality without an error (L-6).
QUERY_PREFIX = "query: "
PASSAGE_PREFIX = "passage: "
# Model files to download. Leaves out the ONNX and other copies of the weights.
_DOWNLOAD_PATTERNS = [
    "*.json",
    "model.safetensors",
    "sentencepiece.bpe.model",
    "tokenizer*",
    "1_Pooling/*",
]


def download_model(target: Path | str, settings: EmbeddingSettings | None = None) -> Path:
    """Download the model named in weights.yaml, at its pinned revision, into `target`.

    The only function in the package that uses the network. Run it once per machine or
    image (for example while building the worker image), not while scoring.
    """
    from huggingface_hub import snapshot_download

    settings = settings or DEFAULT_CONFIG.embedding
    folder = Path(target)
    folder.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        settings.model,
        revision=settings.revision,
        local_dir=folder,
        allow_patterns=_DOWNLOAD_PATTERNS,
        ignore_patterns=["onnx/*", "openvino/*"],
    )
    marker = {"model": settings.model, "revision": settings.revision}
    (folder / MARKER_FILE).write_text(json.dumps(marker, indent=2) + "\n", encoding="utf-8")
    return folder


def _resolve_model_dir(model_dir: Path | str | None) -> Path:
    if model_dir is None:
        model_dir = os.environ.get(MODEL_DIR_ENV)
    if not model_dir:
        raise FileNotFoundError(
            f"No embedding model folder given. Pass model_dir or set {MODEL_DIR_ENV}, after "
            "downloading it with: python -m ats_scoring.embeddings download --to <folder>"
        )
    folder = Path(model_dir)
    if not (folder / MARKER_FILE).is_file():
        raise FileNotFoundError(
            f"{folder} is not a model folder made by "
            f"'python -m ats_scoring.embeddings download' (no {MARKER_FILE})"
        )
    return folder


def check_model_dir(folder: Path, settings: EmbeddingSettings) -> None:
    """Raise ValueError if the model in `folder` is not the one weights.yaml names."""
    marker = json.loads((folder / MARKER_FILE).read_text(encoding="utf-8"))
    found = (marker.get("model"), marker.get("revision"))
    if found != (settings.model, settings.revision):
        raise ValueError(
            f"{folder} holds {found[0]} at revision {found[1]}, but weights.yaml asks for "
            f"{settings.model} at {settings.revision}. Download it again."
        )


class Embedder:
    """Turns CVs and jobs into unit-length vectors on the CPU, without network access.

    Build one when the worker starts and reuse it: loading the model takes a few seconds.
    The embedding of a CV or job is the same whether it is computed alone or in a batch, up
    to float rounding (about 1e-6).
    """

    def __init__(
        self,
        model_dir: Path | str | None = None,
        *,
        settings: EmbeddingSettings | None = None,
        batch_size: int = 32,
    ) -> None:
        from sentence_transformers import SentenceTransformer

        self.settings = settings or DEFAULT_CONFIG.embedding
        self.folder = _resolve_model_dir(model_dir)
        check_model_dir(self.folder, self.settings)
        self.batch_size = batch_size
        self._model = SentenceTransformer(
            str(self.folder), device="cpu", local_files_only=True, trust_remote_code=False
        )
        # Renamed in sentence-transformers 6; the old name still works there, with a warning.
        if hasattr(self._model, "get_embedding_dimension"):
            dimensions = self._model.get_embedding_dimension()
        else:
            dimensions = self._model.get_sentence_embedding_dimension()
        if dimensions != self.settings.dimensions:
            raise ValueError(
                f"model gives {dimensions} dimensions, weights.yaml says {self.settings.dimensions}"
            )

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        """Embed texts as they are. Callers add the e5 prefix."""
        if not texts:
            return []
        vectors = self._model.encode(
            list(texts),
            batch_size=self.batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return [[float(value) for value in vector] for vector in vectors]

    def _embed(self, texts: list[str], prefix: str) -> list[list[float] | None]:
        present = [index for index, text in enumerate(texts) if text]
        vectors = self.embed_texts([prefix + texts[index] for index in present])
        result: list[list[float] | None] = [None] * len(texts)
        for index, vector in zip(present, vectors, strict=True):
            result[index] = vector
        return result

    def embed_candidates(self, candidates: Iterable[Mapping[str, Any]]) -> list[list[float] | None]:
        """One vector per parsed CV, from its redacted qualifications (the scorer's CV text).

        None for a CV with nothing to embed.
        """
        texts = [candidate_text(redact(candidate)) for candidate in candidates]
        return self._embed(texts, PASSAGE_PREFIX)

    def embed_jobs(self, jobs: Iterable[Mapping[str, Any]]) -> list[list[float] | None]:
        """One vector per job, from its title, description and skills. None if all are empty."""
        return self._embed([job_text(job) for job in jobs], QUERY_PREFIX)

    def embed_candidate(self, candidate: Mapping[str, Any]) -> list[float] | None:
        return self.embed_candidates([candidate])[0]

    def embed_job(self, job: Mapping[str, Any]) -> list[float] | None:
        return self.embed_jobs([job])[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m ats_scoring.embeddings", description="Manage the embedding model."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    download = commands.add_parser(
        "download", help="download the model named in weights.yaml (uses the network)"
    )
    download.add_argument("--to", type=Path, required=True, help="folder to download into")
    args = parser.parse_args(argv)

    settings = DEFAULT_CONFIG.embedding
    folder = download_model(args.to, settings)
    print(f"Downloaded {settings.model} at {settings.revision} to {folder}")
    print(f"Set {MODEL_DIR_ENV}={folder.resolve()} or pass it to Embedder.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
