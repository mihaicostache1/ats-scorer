"""Text-to-L-10 extraction. No database access or downloads at runtime.

spaCy and the L-11 normalizer are reused under a lock: the normalizer is mutable,
and Arq can dispatch several parsing calls to worker threads at once.
"""

import re
import threading
from collections import defaultdict
from datetime import date
from functools import lru_cache

import spacy
from ats_scoring.parsed_cv import (
    SCHEMA_VERSION,
    Contact,
    Education,
    Experience,
    Language,
    ParsedCV,
    Skill,
)
from ats_scoring.skill_normalizer import SkillNormalizer, default_normalizer
from spacy.language import Language as NlpPipeline

PARSER_VERSION = "cv-parser-0.1.0"
REVIEW_THRESHOLD = 0.75

_HEADINGS = {
    "summary": ("summary", "profile", "about me", "professional summary", "objective"),
    "experiences": (
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "work history",
        "career history",
        "where i have worked",
    ),
    "skills": (
        "skills",
        "technical skills",
        "core competencies",
        "key skills",
        "tools and skills",
    ),
    "education": ("education", "education & training", "academic background", "studied"),
    "languages": ("languages", "language skills", "speaks"),
    "certifications": ("certifications", "courses & certificates", "certificates"),
    "contact": ("contact", "contact details", "reach me"),
    "other": ("projects", "interests", "references", "hobbies", "publications"),
}
_SECTION = {label: section for section, labels in _HEADINGS.items() for label in labels}
_BULLET = re.compile(r"^\s*[-•●▪◦‣*–]\s*")
_EMAIL = re.compile(r"(?<![\w.+-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+", re.I)
# Deliberately excludes newlines: two dates on adjacent rows must never become a phone.
_PHONE = re.compile(
    r"(?<![\w+])\+?\d(?:[\d(). \t-]{5,}\d)(?:[ \t]*(?:ext\.?|x)[ \t]*\d{1,6})?", re.I
)
_LINK = re.compile(r"(?:https?://|www\.)[^\s,|<>]+", re.I)
_MONTHS = (
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
)
_MONTH = "(?:" + "|".join(month[:3] + "(?:" + month[3:] + ")?" for month in _MONTHS) + ")"
_DATE = (
    rf"(?:\d{{4}}-(?:0[1-9]|1[0-2])|(?:0?[1-9]|1[0-2])[/.-]\d{{4}}|{_MONTH}\.?\s+\d{{4}}|\d{{4}})"
)
_RANGE = re.compile(
    rf"(?<![\d/.-])(?P<start>{_DATE})\s*(?:[-–—]|to)\s*"
    rf"(?P<end>{_DATE}|present|current|now|ongoing)(?![\d/.-])",
    re.I,
)
_SENSITIVE = re.compile(r"\b(?:date of birth|nationality|gender|marital status)\s*:", re.I)


class ParserUnavailableError(Exception):
    """The installed parser model is missing; install it before retrying the job."""


def detect_sections(text: str) -> dict[str, list[str]]:
    """Recognize full-line and inline headings, preserving the order within each section."""
    sections: dict[str, list[str]] = defaultdict(list)
    section = "header"
    for raw in text.splitlines():
        line = raw.strip()
        if not line or _SENSITIVE.search(line) or re.fullmatch(r"[-_=]{3,}", line):
            continue
        heading, separator, content = line.partition(":")
        key = heading.strip().casefold()
        if key in _SECTION:
            section = _SECTION[key]
            if separator and content.strip():
                sections[section].append(content.strip())
        else:
            sections[section].append(line)
    return dict(sections)


def _date_value(value: str) -> tuple[str | None, float]:
    value = re.sub(r"(?<=[a-z])\.", "", value.strip().lower())
    if value in {"present", "current", "now", "ongoing"}:
        return None, 0.98
    if re.fullmatch(r"\d{4}", value):
        return f"{value}-01", 0.6  # Month is unknown; the review screen must highlight it.
    if re.fullmatch(r"\d{4}-\d{2}", value):
        return value, 0.98
    if value[0].isdigit():
        month, year = re.split(r"[/.-]", value)
        return f"{year}-{int(month):02d}", 0.98
    month_name, year = value.split()
    month = next(i for i, name in enumerate(_MONTHS, 1) if name.startswith(month_name))
    return f"{year}-{month:02d}", 0.98


def _phone_values(text: str) -> list[str]:
    values = []
    for line in text.splitlines():
        if _SENSITIVE.search(line):
            continue
        # Remove dates and URLs before phone matching to avoid reading dates/URL IDs as phones.
        line = _LINK.sub("", _RANGE.sub("", line))
        for match in _PHONE.finditer(_EMAIL.sub("", line)):
            value = match.group().strip()
            main = re.split(r"(?:ext\.?|x)", value, flags=re.I)[0]
            digits = re.sub(r"\D", "", main)
            if 7 <= len(digits) <= 15 and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", main):
                values.append(value)
    return list(dict.fromkeys(values))


def needs_review(parsed: ParsedCV, threshold: float = REVIEW_THRESHOLD) -> bool:
    """Name, email and qualifications are key; an omitted phone alone is acceptable."""
    return (
        not parsed.contact.name
        or not parsed.contact.email
        or not (parsed.skills or parsed.experiences or parsed.education)
        or any(value < threshold for value in parsed.confidence.values())
    )


class CvParser:
    def __init__(self, nlp: NlpPipeline, normalizer: SkillNormalizer) -> None:
        self.nlp = nlp
        self.normalizer = normalizer
        self._lock = threading.Lock()

    def parse(self, text: str, *, as_of: date | None = None) -> ParsedCV:
        with self._lock:
            return self._parse(text, as_of or date.today())

    def _parse(self, text: str, as_of: date) -> ParsedCV:
        sections = detect_sections(text)
        # Prevent extremely long OCR output from exceeding spaCy's document limit.
        clean_text = "\n".join(line for line in text.splitlines() if not _SENSITIVE.search(line))
        entities = [
            (ent.text.strip(), ent.label_)
            for chunk in range(0, len(clean_text), 50_000)
            for ent in self.nlp(clean_text[chunk : chunk + 50_000]).ents
        ]
        parsed = ParsedCV(schema_version=SCHEMA_VERSION, source="parser", skills=[])
        emails = list(dict.fromkeys(match.group() for match in _EMAIL.finditer(clean_text)))
        phones = _phone_values(clean_text)
        parsed.contact = Contact(
            email=emails[0] if emails else None,
            phone=phones[0] if phones else None,
            links=list(dict.fromkeys(m.group().rstrip(".)") for m in _LINK.finditer(clean_text))),
        )
        for field, found in (("email", emails), ("phone", phones)):
            if found:
                parsed.confidence[f"/contact/{field}"] = 0.99 if len(found) == 1 else 0.5

        # A sidebar may precede the name in extracted text. Inspect the lines immediately
        # before Summary too; never use a PERSON mentioned in work-history prose.
        lines = clean_text.splitlines()
        candidates = list(sections.get("header", []))
        for i, line in enumerate(lines):
            if line.strip().rstrip(":").casefold() in _HEADINGS["summary"]:
                candidates.extend(line.strip() for line in lines[max(0, i - 2) : i])
        people = [value for value, label in entities if label == "PERSON"]
        candidates = [
            re.sub(r"^(?:full name|name)\s*:\s*", "", line, flags=re.I) for line in candidates
        ]
        for line in candidates:
            line = line.strip()
            if any(person.casefold() == line.casefold() for person in people):
                parsed.contact.name = line
                parsed.confidence["/contact/name"] = 0.9
                break
        if not parsed.contact.name:
            # CV headings often defeat a news-trained NER model (especially ALL CAPS).
            # Retain a plausible header for review, without claiming NER confidence.
            for line in candidates:
                if re.fullmatch(r"[^\W\d_][^\d@,:|/]{1,65}", line) and 2 <= len(line.split()) <= 4:
                    parsed.contact.name = line
                    parsed.confidence["/contact/name"] = 0.6
                    break
        if parsed.contact.name:
            for i, line in enumerate(lines[:-1]):
                if line.strip() == parsed.contact.name:
                    next_line = lines[i + 1].strip()
                    if next_line.casefold().rstrip(":") not in _SECTION and not _EMAIL.search(
                        next_line
                    ):
                        parsed.headline = next_line
                    break
        # A right-hand main column can follow the sidebar's last section.
        for key in ("skills", "education", "languages", "certifications", "contact"):
            sections[key] = [
                line
                for line in sections.get(key, [])
                if line not in (parsed.contact.name, parsed.headline)
            ]
        contact_lines = sections.get("contact", []) + sections.get("header", [])
        for line in contact_lines:
            match = re.match(r"(?:location|address)\s*:\s*(.+)", line, re.I)
            if match:
                parsed.contact.location = match[1]
                break
            location = _EMAIL.sub("", line)
            for phone in phones:
                location = location.replace(phone, "")
            location = location.strip(" ,|;")
            if re.fullmatch(r"[^\W\d_][^\d@:|]+,\s*[^\W\d_][^\d@:|]+", location):
                parsed.contact.location = location
                break
        summary = sections.get("summary", [])
        if not summary and parsed.headline:
            header = sections.get("header", [])
            if parsed.headline in header:
                summary = header[header.index(parsed.headline) + 1 :]
        parsed.summary = " ".join(summary) or None
        self._skills(sections, parsed)
        self._experiences(sections.get("experiences", []), parsed, entities)
        self._education(sections.get("education", []), parsed, entities)
        for line in sections.get("languages", []):
            for item in re.split(r"[,;|]", _BULLET.sub("", line)):
                match = re.fullmatch(r"\s*([^():]+?)(?:\s*(?:\(|:)\s*([^)]*)\)?)?\s*", item)
                if match:
                    parsed.languages.append(Language(language=match[1].strip(), level=match[2]))
        parsed.certifications = [
            item.strip()
            for line in sections.get("certifications", [])
            for item in _BULLET.sub("", line).split(";")
            if item.strip()
        ]
        parsed.experience_years = _experience_years(parsed.experiences, as_of)
        # Revalidate the serialized result at the boundary used for JSONB persistence.
        return ParsedCV.model_validate(parsed.model_dump(mode="json"))

    def _skills(self, sections: dict[str, list[str]], parsed: ParsedCV) -> None:
        lines = sections.get("skills", [])
        if any(_BULLET.match(line) for line in lines):
            grouped: list[str] = []
            for line in lines:
                if _BULLET.match(line) or not grouped:
                    grouped.append(_BULLET.sub("", line))
                else:
                    grouped[-1] += " " + line
            lines = grouped
        elif re.search(r"[,;|]|\s/|/\s", "\n".join(lines)):
            # PDF line wrapping can split a phrase or put a separator at a line end.
            lines = [" ".join(lines)]
        items = [
            item.strip()
            for line in lines
            for item in re.split(r"[,;|•●▪]|\s+/\s+", _BULLET.sub("", line))
            if item.strip()
        ]
        results = []
        for item in items:
            normalized = self.normalizer.normalize_skills([item])[0]
            parts = self.normalizer.normalize_skills(item.split("/"))
            if not normalized.accepted and len(parts) > 1 and all(p.accepted for p in parts):
                results.extend(parts)
            else:
                results.append(normalized)
        if not items:
            # In the absence of a list, extract known phrases from qualifications only.
            prose = "\n".join(
                line for section in ("summary", "experiences") for line in sections.get(section, [])
            )
            results = self.normalizer.extract_skills(prose)
        seen: set[str] = set()
        for result in results:
            key = (result.normalized or result.raw).casefold()
            if key in seen:
                continue
            seen.add(key)
            index = len(parsed.skills)
            parsed.skills.append(Skill.model_validate(result.to_parsed_cv()))
            parsed.confidence[f"/skills/{index}/normalized"] = 0.98 if result.accepted else 0.6

    def _experiences(
        self,
        lines: list[str],
        parsed: ParsedCV,
        entities: list[tuple[str, str]],
    ) -> None:
        # Dates can precede titles (tables), follow them, or share a line (plain CV).
        entries: list[tuple[Experience, float, float]] = []
        pending: list[str] = []
        current: Experience | None = None
        dates_first = bool(lines and _RANGE.search(lines[0]))
        for i, line in enumerate(lines):
            match = _RANGE.search(line)
            if match is None:
                pending.append(line)
                continue
            heading = line[: match.start()].strip(" (,–—-")
            if heading:
                title_lines = [heading]
                if current is not None:
                    current.bullets = [_BULLET.sub("", item) for item in pending]
            elif not dates_first and pending:
                # Classic layout: the last line before the date is title + company.
                title_lines = [pending[-1]]
                if current is not None:
                    current.bullets = [_BULLET.sub("", item) for item in pending[:-1]]
            else:
                # A date in its own table column is followed by title and company.
                title_lines = lines[i + 1 : i + 3]
                if current is not None:
                    current.bullets = [_BULLET.sub("", item) for item in pending]
            pending = []
            if not title_lines:
                continue
            title, company = _title_company(title_lines, entities)
            if not title:
                continue
            start, start_confidence = _date_value(match["start"])
            end, end_confidence = _date_value(match["end"])
            current = Experience(
                title=title,
                company=company,
                start=start,
                end=end,
                is_current=match["end"].casefold() in {"present", "current", "now", "ongoing"},
            )
            if start and end and end < start:
                start_confidence = end_confidence = 0.3
            entries.append((current, start_confidence, end_confidence))
        if current is not None:
            current.bullets = [_BULLET.sub("", item) for item in pending]
        entries.sort(key=lambda entry: entry[0].start or "", reverse=True)
        for entry, start_confidence, end_confidence in entries:
            # Table titles were read ahead; remove them from the description.
            entry.bullets = [
                item for item in entry.bullets if item not in (entry.title, entry.company)
            ]
            entry.summary = " ".join(entry.bullets) or None
            index = len(parsed.experiences)
            parsed.experiences.append(entry)
            parsed.confidence[f"/experiences/{index}/start"] = start_confidence
            parsed.confidence[f"/experiences/{index}/end"] = end_confidence
        if lines and not entries:
            title, company = _title_company([lines[0]], entities)
            if title:
                parsed.experiences.append(
                    Experience(
                        title=title,
                        company=company,
                        summary=" ".join(_BULLET.sub("", line) for line in lines[1:]) or None,
                        bullets=[_BULLET.sub("", line) for line in lines[1:]],
                    )
                )
            parsed.confidence["/experiences"] = 0.3

    def _education(
        self,
        lines: list[str],
        parsed: ParsedCV,
        entities: list[tuple[str, str]],
    ) -> None:
        pending: list[str] = []
        years_first = bool(lines and re.fullmatch(r"\d{4}", lines[0].strip()))
        for line in lines:
            if years_first and re.fullmatch(r"(?:19[5-9]\d|20\d{2}|2100)", line.strip()):
                if pending:
                    self._education_entry(pending, parsed, entities)
                pending = [line]
                continue
            pending.append(_BULLET.sub("", line))
            years = re.findall(r"\b(?:19[5-9]\d|20\d{2}|2100)\b", line)
            if not years:
                continue
            # Table extraction emits graduation year before degree/institution.
            if len(pending) == 1 and line.strip() == years[-1]:
                continue
            self._education_entry(pending, parsed, entities)
            pending = []
        if pending:
            self._education_entry(pending, parsed, entities)

    def _education_entry(
        self,
        lines: list[str],
        parsed: ParsedCV,
        entities: list[tuple[str, str]],
    ) -> None:
        text = " ".join(lines)
        years = re.findall(r"\b(?:19[5-9]\d|20\d{2}|2100)\b", text)
        text = re.sub(r"\b(?:19[5-9]\d|20\d{2}|2100)\b", "", text).strip(" ,")
        if not text:
            return
        parts = [part.strip(" ,") for part in text.split(",", 1)]
        institution = parts[1] if len(parts) > 1 else None
        if institution is None and len(lines) > 1:
            degree = lines[1] if lines[0].strip().isdigit() else lines[0]
            institution = text.removeprefix(degree).strip(" ,") or None
        else:
            degree = parts[0]
        if institution is None:
            institution = next(
                (value for value, label in entities if label == "ORG" and value in text), None
            )
            if institution:
                degree = text.replace(institution, "").strip(" ,")
        if degree:
            parsed.education.append(
                Education(
                    degree=degree,
                    institution=institution,
                    grad_year=int(years[-1]) if years else None,
                )
            )


def _title_company(lines: list[str], entities: list[tuple[str, str]]) -> tuple[str, str | None]:
    heading = lines[0].strip()
    parts = re.split(r"\s+(?:at|@)\s+|\s*[|,]\s*", heading, maxsplit=1)
    if len(parts) == 2:
        return parts[0], parts[1]
    if len(lines) > 1:
        return heading, lines[1]
    company = next(
        (value for value, label in entities if label == "ORG" and value in heading), None
    )
    title = heading.replace(company, "").strip(" -–—") if company else heading
    return title, company


def _experience_years(entries: list[Experience], as_of: date) -> float | None:
    intervals = []
    for entry in entries:
        end = f"{as_of.year:04d}-{as_of.month:02d}" if entry.is_current else entry.end
        if not entry.start or not end or end < entry.start:
            return None
        start_month = int(entry.start[:4]) * 12 + int(entry.start[5:])
        end_month = int(end[:4]) * 12 + int(end[5:])
        intervals.append((start_month, end_month))
    if not intervals:
        return None
    total = 0
    previous_end = 0
    for start, end in sorted(intervals):
        total += max(0, end - max(start, previous_end))
        previous_end = max(previous_end, end)
    return round(total / 12, 1)


@lru_cache(maxsize=1)
def get_cv_parser() -> CvParser:
    try:
        nlp = spacy.load(
            "en_core_web_sm", disable=["tagger", "parser", "attribute_ruler", "lemmatizer"]
        )
    except OSError as exc:
        raise ParserUnavailableError(
            "Install the en_core_web_sm model before processing CVs."
        ) from exc
    return CvParser(nlp, default_normalizer())


def parse_cv_text(text: str) -> ParsedCV:
    return get_cv_parser().parse(text)
