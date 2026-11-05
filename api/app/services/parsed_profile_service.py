"""Apply recruiter corrections while preserving the B-13 parser snapshot."""

import copy
from datetime import UTC, datetime
from typing import Any

from ats_scoring.parsed_cv import ParsedCV
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.candidate import Candidate
from app.models.cv_document import CvDocument
from app.models.user import User
from app.schemas.candidate import ParsedProfileResponse, UpdateCandidateRequest
from app.schemas.cv_document import CvStatus
from app.services.audit_service import log_audit_event
from app.services.cv_parser import needs_review

_CONTACT_FIELDS = {"name": "full_name", "email": "email", "phone": "phone", "location": "location"}


def _merge(original: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(original)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def _validation_error(exc: ValidationError, *, contact: bool = False) -> RequestValidationError:
    errors = exc.errors(include_url=False, include_input=False, include_context=False)
    for error in errors:
        location = error["loc"]
        if contact:
            reverse = {value: key for key, value in _CONTACT_FIELDS.items()}
            location = ("contact", reverse.get(str(location[0]), str(location[0])), *location[1:])
        error["loc"] = ("body", *location)
    return RequestValidationError(errors)


def _changes(before: Any, after: Any, path: str = "") -> list[str]:
    if before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        return [
            pointer
            for key in sorted(before.keys() | after.keys())
            for pointer in _changes(before.get(key), after.get(key), f"{path}/{key}")
        ]
    return [path]


def _leaves(value: Any, path: str) -> dict[str, float]:
    if isinstance(value, dict) and value:
        return {
            pointer: confidence
            for key, child in value.items()
            for pointer, confidence in _leaves(child, f"{path}/{key}").items()
        }
    if isinstance(value, list) and value:
        return {
            pointer: confidence
            for index, child in enumerate(value)
            for pointer, confidence in _leaves(child, f"{path}/{index}").items()
        }
    return {path: 1.0}


def _resolve(data: Any, pointer: str) -> Any:
    for part in pointer.lstrip("/").split("/"):
        data = data[int(part)] if isinstance(data, list) else data[part]
    return data


def correct_parsed_profile(
    db: Session,
    candidate: Candidate,
    patch: dict[str, Any],
    reviewer: User,
    request: Request,
) -> ParsedProfileResponse:
    # Match the worker's document-then-candidate lock order, so a correction cannot
    # race a parser write or deadlock while updating document status.
    document = (
        db.query(CvDocument)
        .filter(CvDocument.candidate_id == candidate.id, CvDocument.org_id == candidate.org_id)
        .order_by(CvDocument.created_at.desc(), CvDocument.id.desc())
        .with_for_update()
        .first()
    )
    if document is not None and document.status not in (
        CvStatus.PARSED.value,
        CvStatus.NEEDS_REVIEW.value,
    ):
        raise HTTPException(
            409, "The latest CV must finish parsing before its profile can be reviewed."
        )
    locked = (
        db.query(Candidate)
        .filter(Candidate.id == candidate.id, Candidate.org_id == reviewer.org_id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if locked is None:
        raise HTTPException(404, "The candidate was not found.")
    candidate = locked
    try:
        original = ParsedCV.model_validate(candidate.parsed_data).model_dump(mode="json")
    except ValidationError as exc:
        raise HTTPException(409, "The candidate does not have a valid parsed profile yet.") from exc
    try:
        corrected = ParsedCV.model_validate(_merge(original, patch)).model_dump(mode="json")
    except ValidationError as exc:
        raise _validation_error(exc) from exc

    # Canonical contact columns have tighter limits than the L-10 review copy.
    # Validate only the contact fields explicitly sent by the recruiter.
    contact_patch = patch.get("contact", {})
    canonical = {
        column: corrected["contact"][field]
        for field, column in _CONTACT_FIELDS.items()
        if field in contact_patch
    }
    null_errors = [
        {
            "type": "value_error",
            "loc": ("body", "contact", field),
            "msg": f"{field} cannot be null",
        }
        for field, column in (("name", "full_name"), ("email", "email"))
        if column in canonical and canonical[column] is None
    ]
    if null_errors:
        raise RequestValidationError(null_errors)
    try:
        contact = UpdateCandidateRequest.model_validate(canonical)
    except ValidationError as exc:
        raise _validation_error(exc, contact=True) from exc

    changed = _changes(
        {key: value for key, value in original.items() if key not in {"confidence", "source"}},
        {key: value for key, value in corrected.items() if key not in {"confidence", "source"}},
    )
    confidence = dict(original["confidence"])
    for pointer in changed:
        confidence = {
            key: value
            for key, value in confidence.items()
            if key != pointer and not key.startswith(pointer + "/")
        }
        confidence.update(_leaves(_resolve(corrected, pointer), pointer))
        confidence[pointer] = 1.0
    corrected["source"] = "recruiter"
    corrected["confidence"] = confidence
    parsed = ParsedCV.model_validate(corrected)
    reviewed_at = datetime.now(UTC)
    candidate.parsed_data = parsed.model_dump(mode="json")
    candidate.parsed_profile_reviewed_by = reviewer.id
    candidate.parsed_profile_reviewed_at = reviewed_at
    for column, value in contact.model_dump(exclude_unset=True).items():
        setattr(candidate, column, value)
    if document is not None:
        document.status = (
            CvStatus.NEEDS_REVIEW.value
            if needs_review(parsed, settings.CV_REVIEW_CONFIDENCE_THRESHOLD)
            else CvStatus.PARSED.value
        )
    log_audit_event(
        db=db,
        org_id=candidate.org_id,
        action="correct_parsed_profile",
        target_entity="candidate",
        target_id=candidate.id,
        user_id=reviewer.id,
        details={"changed_fields": changed, "schema_version": parsed.schema_version},
        request=request,
    )
    db.commit()
    return ParsedProfileResponse(
        candidate_id=candidate.id,
        parsed_data=parsed,
        reviewed_by=reviewer.id,
        reviewed_at=reviewed_at,
    )
