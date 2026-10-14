"""File storage: an interface plus a local-disk implementation for development.

Stored files are private. Nothing here is mounted as a static path; the only
way to read a file is through an endpoint that checks the caller's organization.
"""

import secrets
import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import settings


class StorageError(Exception):
    """A storage key is invalid or the file it names is missing."""


class Storage(Protocol):
    """Minimal blob store. Keys are opaque strings chosen by the application."""

    def save(self, key: str, data: bytes) -> None:
        """Store ``data`` under ``key``."""

    def read(self, key: str) -> bytes:
        """Return the bytes stored under ``key``; raise ``StorageError`` if missing."""

    def delete(self, key: str) -> None:
        """Remove ``key``. Deleting a missing key is not an error."""

    def exists(self, key: str) -> bool:
        """Return whether ``key`` is stored."""


class LocalDiskStorage:
    """Stores files under one root directory on the local disk."""

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        """Map a key to a path, refusing anything that would leave the root."""
        path = (self._root / key).resolve()
        if not key or self._root not in path.parents:
            raise StorageError(f"Invalid storage key: {key!r}")
        return path

    def save(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise StorageError(f"No file stored under key: {key!r}")
        return path.read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()


def new_cv_storage_key(org_id: uuid.UUID) -> str:
    """Return an unguessable key for a CV. It carries nothing from the uploaded filename."""
    return f"cvs/{org_id}/{secrets.token_hex(32)}.pdf"


def get_storage() -> Storage:
    """FastAPI dependency returning the configured storage backend."""
    return LocalDiskStorage(settings.STORAGE_LOCAL_DIR)
