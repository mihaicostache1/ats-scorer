"""Find candidate duplicates within an organization without changing any records."""

import re
import unicodedata
import uuid
from dataclasses import dataclass
from typing import Literal

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.schemas.duplicate import PossibleDuplicate

NAME_SIMILARITY_THRESHOLD = 85


def normalize_email(value: str) -> str:
    """Ignore surrounding whitespace and casing, preserving mailbox punctuation."""
    return value.strip().casefold()


def normalize_phone(value: str) -> str:
    """Ignore formatting and treat 00 as an international prefix; never guess a country."""
    if not re.fullmatch(r"[+0-9().\s/\-]+", value):
        return ""
    digits = re.sub(r"[^0-9]", "", value)
    if digits.startswith("00"):
        digits = digits[2:]
    return digits if 7 <= len(digits) <= 15 else ""


def normalize_name(value: str) -> str:
    """Ignore accents, casing, punctuation, spacing and the order of name tokens."""
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = "".join(char if char.isalnum() else " " for char in value)
    return " ".join(sorted(value.split()))


@dataclass(frozen=True)
class _Identity:
    id: uuid.UUID
    full_name: str
    emails: frozenset[str]
    phones: frozenset[str]
    names: frozenset[str]

    @classmethod
    def build(
        cls,
        candidate_id: uuid.UUID,
        full_name: str,
        email: str,
        phone: str | None,
        contact: object,
    ) -> "_Identity":
        contact = contact if isinstance(contact, dict) else {}
        emails = (email, contact.get("email"))
        phones = (phone, contact.get("phone"))
        names = (full_name, contact.get("name"))
        return cls(
            id=candidate_id,
            full_name=full_name,
            emails=frozenset(
                normalized
                for value in emails
                if isinstance(value, str) and (normalized := normalize_email(value))
            ),
            phones=frozenset(
                normalized
                for value in phones
                if isinstance(value, str) and (normalized := normalize_phone(value))
            ),
            names=frozenset(
                normalized
                for value in names
                if isinstance(value, str) and len(normalized := normalize_name(value)) >= 3
            ),
        )


class DuplicateDetector:
    """Load only one org's contact data once, also usable without a tenant-scoped session."""

    def __init__(self, db: Session, org_id: uuid.UUID) -> None:
        self.org_id = org_id
        rows = (
            db.query(
                Candidate.id,
                Candidate.full_name,
                Candidate.email,
                Candidate.phone,
                Candidate.parsed_data["contact"].label("contact"),
            )
            .filter(Candidate.org_id == org_id)
            .all()
        )
        self.identities = [
            _Identity.build(row.id, row.full_name, row.email, row.phone, row.contact)
            for row in rows
        ]

    def find(self, candidate: Candidate) -> list[PossibleDuplicate]:
        if candidate.org_id != self.org_id:
            return []
        subject = _Identity.build(
            candidate.id,
            candidate.full_name,
            candidate.email,
            candidate.phone,
            candidate.parsed_data.get("contact"),
        )
        matches = []
        for other in self.identities:
            if other.id == subject.id:
                continue
            matched_on: list[Literal["email", "phone", "name"]] = []
            if subject.emails & other.emails:
                matched_on.append("email")
            if subject.phones & other.phones:
                matched_on.append("phone")
            similarity = max(
                (
                    fuzz.ratio(name, other_name, score_cutoff=NAME_SIMILARITY_THRESHOLD)
                    for name in subject.names
                    for other_name in other.names
                ),
                default=0.0,
            )
            if similarity >= NAME_SIMILARITY_THRESHOLD:
                matched_on.append("name")
            if matched_on:
                matches.append(
                    PossibleDuplicate(
                        candidate_id=other.id,
                        full_name=other.full_name,
                        matched_on=matched_on,
                        name_similarity=round(similarity, 2) if "name" in matched_on else None,
                    )
                )
        # Exact contact matches first; UUID breaks ties so responses are stable.
        return sorted(
            matches,
            key=lambda match: (
                "email" not in match.matched_on,
                "phone" not in match.matched_on,
                -(match.name_similarity or 0),
                str(match.candidate_id),
            ),
        )
