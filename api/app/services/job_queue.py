"""Background job queue: an interface plus the Arq (Redis) implementation."""

import asyncio
import uuid
from typing import Protocol

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings

# Name the worker registers the CV extraction job under.
EXTRACT_CV_TEXT_JOB = "extract_cv_text"


class QueueUnavailableError(Exception):
    """A job could not be handed to the queue."""


class JobQueue(Protocol):
    """Hands work to the background worker."""

    def enqueue_cv_extraction(self, cv_document_id: uuid.UUID) -> None:
        """Queue text extraction for a CV document; raise ``QueueUnavailableError`` on failure."""


def redis_settings(*, fail_fast: bool = False) -> RedisSettings:
    """Arq connection settings from ``REDIS_URL``.

    ``fail_fast`` is for request handlers, which must not hang while Redis is down.
    """
    redis = RedisSettings.from_dsn(settings.REDIS_URL)
    if fail_fast:
        redis.conn_timeout = 2
        redis.conn_retries = 0
    return redis


class ArqJobQueue:
    """Enqueues jobs on Redis for the Arq worker (``app.worker``)."""

    def enqueue_cv_extraction(self, cv_document_id: uuid.UUID) -> None:
        # Request handlers are synchronous and run in a worker thread without an
        # event loop, so a short-lived loop and connection are used per job.
        try:
            asyncio.run(self._enqueue(cv_document_id))
        except Exception as exc:
            raise QueueUnavailableError(str(exc)) from exc

    @staticmethod
    async def _enqueue(cv_document_id: uuid.UUID) -> None:
        pool = await create_pool(redis_settings(fail_fast=True))
        try:
            # The job ID makes a second enqueue of the same document a no-op while
            # the first is still waiting or running.
            await pool.enqueue_job(
                EXTRACT_CV_TEXT_JOB,
                str(cv_document_id),
                _job_id=f"{EXTRACT_CV_TEXT_JOB}:{cv_document_id}",
            )
        finally:
            await pool.aclose()


def get_job_queue() -> JobQueue:
    """FastAPI dependency returning the configured job queue."""
    return ArqJobQueue()
