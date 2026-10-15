"""Arq worker entry point.

Run it with:  arq app.worker.WorkerSettings
"""

from typing import Any

from arq import func

from app.core.config import settings
from app.core.logging import logger
from app.services.cv_extraction import extract_cv_text
from app.services.job_queue import EXTRACT_CV_TEXT_JOB, redis_settings


async def on_startup(ctx: dict[str, Any]) -> None:
    logger.info("Worker started in %s mode", settings.ENVIRONMENT)


async def on_shutdown(ctx: dict[str, Any]) -> None:
    logger.info("Worker stopped")


class WorkerSettings:
    """Configuration read by the ``arq`` command."""

    functions = [
        func(
            extract_cv_text,
            name=EXTRACT_CV_TEXT_JOB,
            max_tries=settings.CV_EXTRACTION_MAX_TRIES,
            # The job enforces its own limit and records the outcome; Arq's limit is
            # only a backstop, so it is set a little later.
            timeout=int(settings.CV_EXTRACTION_TIMEOUT_SECONDS) + 30,
            # Results live in cv_documents. Keeping none also frees the job ID, so a
            # failed document can be queued again.
            keep_result=0,
        )
    ]
    redis_settings = redis_settings()
    max_jobs = 4
    on_startup = on_startup
    on_shutdown = on_shutdown
