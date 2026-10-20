
"""Pydantic models of the parsed-CV schema, version 1.0.

The JSON Schema in `schemas/parsed_cv.schema.json` describes the same shape for
non-Python readers. Both are checked against the fixtures in `schemas/fixtures/`, so
they cannot drift apart unnoticed. Rules for changing either: docs/ml/parsed-cv-schema.md.
"""

from typing import Annotated, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

SCHEMA_VERSION: Final = "1.0"

NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]
YearMonth = Annotated[str, StringConstraints(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$")]
# JSON Pointer into the record, e.g. "/contact/email" or "/experiences/0/title".
FieldPointer = Annotated[str, StringConstraints(pattern=r"^(/[A-Za-z0-9_-]+)+$")]
Confidence = Annotated[float, Field(ge=0, le=1)]


class _Model(BaseModel):
    """Closed and strict, like the JSON Schema: an unknown field is an error, so a new field
    needs a version bump, and "2020" is not accepted where a number is expected."""

    model_config = ConfigDict(extra="forbid", strict=True)


class Contact(_Model):
    """Who the CV belongs to, as read from the CV. Never read by the scorer (US-06)."""

    name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[NonEmptyStr] = Field(default_factory=list)  # profile and portfolio URLs


class Skill(_Model):
    raw: NonEmptyStr  # as written in the CV
    normalized: NonEmptyStr | None  # canonical name, or null when it is not recognized


class Experience(_Model):
    title: NonEmptyStr
    company: str | None = None
    start: YearMonth | None = None  # null: unknown
    end: YearMonth | None = None  # null: unknown, or still current (see is_current)
    is_current: bool = False
    summary: str | None = None
    bullets: list[str] = Field(default_factory=list)


class Education(_Model):
    degree: NonEmptyStr
    institution: str | None = None
    grad_year: Annotated[int, Field(ge=1950, le=2100)] | None = None


class Language(_Model):
    language: NonEmptyStr
    level: str | None = None  # as written in the CV: "B2", "native", "fluent"


class ParsedCV(_Model):
    """The content of `candidates.parsed_data` once a CV has been parsed."""

    schema_version: Literal["1.0"]
    source: Literal["parser", "recruiter"]  # who wrote this version of the record
    contact: Contact = Field(default_factory=Contact)
    headline: str | None = None  # current or most recent job title
    summary: str | None = None
    skills: list[Skill]  # may be empty
    experience_years: Annotated[float, Field(ge=0)] | None = None
    experiences: list[Experience] = Field(default_factory=list)  # most recent first
    education: list[Education] = Field(default_factory=list)
    languages: list[Language] = Field(default_factory=list)
    certifications: list[NonEmptyStr] = Field(default_factory=list)
    # 0-1 per field, keyed by JSON Pointer. A field with no entry has no confidence value.
    confidence: dict[FieldPointer, Confidence] = Field(default_factory=dict)
