"""Remove identity details and stand-ins for protected traits from a parsed CV (L-14, US-06).

`redact(parsed_cv)` returns a new record built from an allow-list, so a field it does not
know (`photo`, `date_of_birth`, `gender`, ...) never gets through. What it does:

- **Contact:** name, email, phone and links are dropped. The location keeps its last two
  parts without a street, number or postcode: "Str. Lipscani 12, Bucharest, Romania" becomes
  "Bucharest, Romania", for location fit.
- **Dates:** total years of experience are computed from the position dates when the record
  has none, then the dates and graduation years are dropped.
- **Free text** (headline, summary, titles, bullets, degrees, certifications): the
  candidate's own name, email, phone, links and street are removed wherever they appear,
  and so are any email, URL or phone number, dates, birth dates and ages, photo references,
  "Gender: ..." style labels and honorifics (Mr, Ms, ...). Gendered job words become
  neutral ("saleswoman" -> "salesperson") and pronouns become they/them/their.
- **Skills** lose identity details only, so "SQL Server 2019" keeps its year.

Kept as they are: skills, job titles, employers, schools, languages and certifications.
Schools and employers can still correlate with protected traits; see
docs/ml/redaction.md for what redaction does not remove.

`score()` and `Embedder.embed_candidates()` call `redact()` themselves, so nothing above
reaches the scorer even when a caller forgets. Redacting twice gives the same result.
"""

import copy
import re
from collections.abc import Callable, Iterable, Mapping
from datetime import date
from typing import Any

# --- Patterns ---------------------------------------------------------------------------

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(
    r"\b(?:https?://|www\.)\S+"
    r"|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)/\S*",
    re.I,
)
# A phone number starts with +, 00, 0 or "(", or reads 415-555-0100. At least 9 digits, so
# year ranges ("2015 - 2019") and "10 000 users" are not phone numbers.
_PHONE = re.compile(
    r"(?<![\w+])(?:\+|00|0|\()[\d\s().-]{7,}\d(?!\w)|(?<!\w)\d{3}[-.\s]\d{3}[-.\s]\d{4}(?!\w)"
)
_IMAGE_FILE = re.compile(r"[\w.-]+\.(?:jpe?g|png|gif|bmp|webp|heic|tiff?)\b", re.I)
_PHOTO = re.compile(
    r"[\[(]\s*(?:photo|picture|headshot|portrait)\s*[\])]"
    r"|\b(?:photo|photograph|picture|headshot|portrait)"
    r"(?:\s*:\s*\S*|\s+(?:attached|enclosed|included|below|above)\b)",
    re.I,
)
_YEAR = r"(?:19[5-9]\d|20\d\d|2100)"
_MONTH = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
)
_DATE = (
    rf"(?:\d{{1,2}}[./-]\d{{1,2}}[./-]{_YEAR}|{_YEAR}[./-]\d{{1,2}}(?:[./-]\d{{1,2}})?"
    rf"|\d{{1,2}}[./]{_YEAR}|(?:\d{{1,2}}\s+)?{_MONTH}\s+(?:\d{{1,2}},?\s+)?{_YEAR}|{_YEAR})"
)

# "Gender: female", "Date of birth: 14.03.1994", "Born in Cluj in 1994", "Age: 34". The value
# runs to the end of the sentence, or is one date ("14.03.1994" holds dots).
_PERSONAL_LABEL = re.compile(
    r"\b(?:gender|sex|marital\s+status|civil\s+status|nationality|citizenship|religion"
    r"|date\s+of\s+birth|birth\s*date|d\.?\s?o\.?\s?b\.?|place\s+of\s+birth|age)"
    rf"\s*:\s*(?:{_DATE}(?!\w)|[^.;\n|]*)"
    r"|\bborn\s+(?:on|in)\b[^.;\n|]*",
    re.I,
)
_AGE = re.compile(r"\baged\s+\d{2}\b|\b\d{2}\s+years?\s+old\b|\b\d{2}\s?y\.?o\.?(?!\w)", re.I)
# A date or range, with the word that introduces it: "class of 2010", "2015 - present".
_DATES = re.compile(
    r"(?:\b(?:class\s+of|graduated(?:\s+in)?|graduation(?:\s+year)?\s*:?|since|from|in)\s+)?"
    rf"(?<!\w){_DATE}"
    rf"(?:\s*(?:-|–|—|to|until|till)\s*(?:{_DATE}|present|current|now|today|ongoing))?(?!\w)",
    re.I,
)

# Honorifics before a name. Case-sensitive, so "never miss a deadline" and "MS SQL" stay.
_HONORIFIC = re.compile(r"\b(?:Mr|Mrs|Ms|Mx|Mister|Miss|Madam|Madame|Mme|Mlle)\b\.?\s*(?=[A-Z]|$)")
_GENDERED_WORDS = {
    "chairman": "chairperson",
    "chairwoman": "chairperson",
    "salesman": "salesperson",
    "saleswoman": "salesperson",
    "salesmen": "salespeople",
    "saleswomen": "salespeople",
    "spokesman": "spokesperson",
    "spokeswoman": "spokesperson",
    "businessman": "businessperson",
    "businesswoman": "businessperson",
    "foreman": "supervisor",
    "forewoman": "supervisor",
    "waiter": "server",
    "waitress": "server",
    "steward": "flight attendant",
    "stewardess": "flight attendant",
    "actress": "actor",
    "hostess": "host",
    "headmaster": "head teacher",
    "headmistress": "head teacher",
    "policeman": "police officer",
    "policewoman": "police officer",
    "fireman": "firefighter",
    "cameraman": "camera operator",
    "camerawoman": "camera operator",
    "craftsman": "craftsperson",
    "craftswoman": "craftsperson",
    "draftsman": "drafter",
    "draughtsman": "drafter",
    "repairman": "repairer",
    "workman": "worker",
    "manageress": "manager",
    "barman": "bartender",
    "barmaid": "bartender",
    "maternity": "parental",
    "paternity": "parental",
    # Pronouns. "her" is read as "their"; the scorer does not depend on the grammar.
    "s/he": "they",
    "he/she": "they",
    "she/he": "they",
    "his/her": "their",
    "her/his": "their",
    "him/her": "them",
    "he": "they",
    "she": "they",
    "him": "them",
    "his": "their",
    "her": "their",
    "hers": "theirs",
    "himself": "themselves",
    "herself": "themselves",
}
_GENDERED = re.compile(
    r"(?<![\w/])(?:"
    + "|".join(re.escape(word) for word in sorted(_GENDERED_WORDS, key=len, reverse=True))
    + r")(?![\w/])",
    re.I,
)

# A location part that is a street, a number or a postcode, not a place.
_STREET_PART = re.compile(
    r"\d|\b(?:street|st|str|strada|road|rd|avenue|ave|av|boulevard|blvd|bd|bulevardul|calea"
    r"|lane|ln|drive|dr|way|alley|aleea|square|sq|place|pl|plaza|piata|apt|apartment|suite"
    r"|floor|fl|bloc|bl|sc|ap|et|nr|no|house|rue|via|strasse|straße|platz|po box)\b\.?",
    re.I,
)
_YEAR_MONTH = re.compile(r"^[0-9]{4}-(0[1-9]|1[0-2])$")

_EMPTY_BRACKETS = re.compile(r"\(\s*[,;:/–—-]*\s*\)|\[\s*[,;:/–—-]*\s*\]")
# Not before ".NET": the mark must end the word.
_SPACE_BEFORE_PUNCTUATION = re.compile(r"\s+([,.;:!?)\]])(?=\s|$)")
_REPEATED_STOPS = re.compile(r"([.;:])(?:\s*[.;:])+")
_REPEATED_SEPARATORS = re.compile(r"([,;|/])(?:\s*[,;|/–—-])+")
_EDGE = " \t,;:|/–—-"
_LEADING_STOP = re.compile(r"^(?:[.!?](?=\s|$))+")


# --- Text -------------------------------------------------------------------------------


def _literal(value: str) -> re.Pattern[str]:
    words = value.split()
    return re.compile(r"(?<!\w)" + r"\s+".join(map(re.escape, words)) + r"(?!\w)", re.I)


def _identity_patterns(contact: Mapping[str, Any], street: list[str]) -> list[re.Pattern[str]]:
    """The candidate's own details, longest first, so the full name goes before its parts."""
    values: set[str] = set(street)
    for key in ("name", "full_name", "email", "phone", "location"):
        value = contact.get(key)
        if isinstance(value, str) and value.strip():
            values.add(value.strip())
    links = contact.get("links")
    if isinstance(links, list | tuple):
        values.update(link.strip() for link in links if isinstance(link, str) and link.strip())
    for key in ("name", "full_name"):
        name = contact.get(key)
        if isinstance(name, str):
            values.update(part for part in re.split(r"[\s,]+", name) if len(part) >= 2)
    values.discard(coarse_location(contact.get("location")) or "")
    return [_literal(value) for value in sorted(values, key=len, reverse=True)]


def _match_case(word: str, neutral: str) -> str:
    if word.isupper() and len(word) > 1:
        return neutral.upper()
    if word[0].isupper():
        return neutral[0].upper() + neutral[1:]
    return neutral


def _neutral(match: re.Match[str]) -> str:
    word = match.group()
    return _match_case(word, _GENDERED_WORDS[word.casefold()])


def _tidy(text: str) -> str:
    text = _EMPTY_BRACKETS.sub("", text)
    text = _REPEATED_SEPARATORS.sub(r"\1", text)
    text = _SPACE_BEFORE_PUNCTUATION.sub(r"\1", text)
    text = _REPEATED_STOPS.sub(r"\1", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    # A stop left by a removed first sentence goes too, but not the dot of ".NET".
    return _LEADING_STOP.sub("", text.strip(_EDGE)).strip(_EDGE)


def _phone(match: re.Match[str]) -> str:
    return " " if sum(char.isdigit() for char in match.group()) >= 9 else match.group()


_Step = tuple[re.Pattern[str], str | Callable[[re.Match[str]], str]]


class _Scrubber:
    def __init__(self, identity: list[re.Pattern[str]]) -> None:
        self._identity: list[_Step] = [(pattern, " ") for pattern in identity]
        self._contact: list[_Step] = [
            (_EMAIL, " "),
            (_URL, " "),
            (_PHONE, _phone),
            (_IMAGE_FILE, " "),
        ]

    @staticmethod
    def _apply(text: str, steps: Iterable[_Step]) -> str:
        original = text
        for pattern, replacement in steps:
            text = pattern.sub(replacement, text)
        # Only tidy what was changed, so text without identity details stays exactly as is.
        return text if text == original else _tidy(text)

    # Emails, links and file names go before the name, which they often contain.
    def identity(self, text: str) -> str:
        """Remove who the candidate is: name, contact details, links, photo files."""
        return self._apply(text, [*self._contact, *self._identity])

    def text(self, text: str) -> str:
        """Honorifics (before the name they precede), identity details, then personal labels,
        ages, photo references, dates and gendered words."""
        steps: list[_Step] = [
            (_HONORIFIC, ""),
            *self._contact,
            *self._identity,
            (_PHOTO, " "),
            (_PERSONAL_LABEL, " "),
            (_AGE, " "),
            (_DATES, " "),
            (_GENDERED, _neutral),
        ]
        return self._apply(text, steps)


# --- Location and experience ------------------------------------------------------------


def _location_parts(location: object) -> tuple[list[str], list[str]]:
    """The place parts of a location and the street parts, split at commas."""
    if not isinstance(location, str):
        return [], []
    parts = [part.strip() for part in re.split(r"[,\n|]", location) if part.strip()]
    places = [part for part in parts if not _STREET_PART.search(part)]
    return places, [part for part in parts if part not in places]


def coarse_location(location: object) -> str | None:
    """The city or region and the country of a location, without street, number or postcode.

    "12 Baker Street, London, NW1 6XE, United Kingdom" -> "London, United Kingdom".
    """
    places, _ = _location_parts(location)
    return ", ".join(places[-2:]) or None


def _month_index(value: str) -> int:
    return int(value[:4]) * 12 + int(value[5:])


def total_experience_years(positions: Iterable[Mapping[str, Any]], as_of: date) -> float | None:
    """Years of work, with overlapping positions counted once. Same rule as the CV parser
    (B-13): None when a position has no usable start or end date."""
    intervals = []
    for position in positions:
        start = position.get("start")
        end = f"{as_of:%Y-%m}" if position.get("is_current") is True else position.get("end")
        if not (isinstance(start, str) and isinstance(end, str)):
            return None
        if not (_YEAR_MONTH.match(start) and _YEAR_MONTH.match(end)) or end < start:
            return None
        intervals.append((_month_index(start), _month_index(end)))
    if not intervals:
        return None
    total = previous_end = 0
    for start_month, end_month in sorted(intervals):
        total += max(0, end_month - max(start_month, previous_end))
        previous_end = max(previous_end, end_month)
    return round(total / 12, 1)


def _valid_years(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, int | float) and value >= 0


# --- Record -----------------------------------------------------------------------------


def _mappings(value: object) -> list[Mapping[str, Any]]:
    if not isinstance(value, list | tuple):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _texts(value: object, clean: Callable[[str], str]) -> list[str]:
    if not isinstance(value, list | tuple):
        return []
    cleaned = (clean(item) for item in value if isinstance(item, str))
    return [item for item in cleaned if item]


def _optional_text(value: object, clean: Callable[[str], str]) -> str | None:
    return (clean(value) or None) if isinstance(value, str) else None


def _skill(item: object, scrub: _Scrubber) -> Any:
    if isinstance(item, str):
        return scrub.identity(item)
    if not isinstance(item, Mapping) or not isinstance(item.get("raw"), str):
        return None
    raw = scrub.identity(item["raw"])
    if not raw:
        return None
    skill = {"raw": raw, "normalized": item.get("normalized")}
    if "suggestion" in item:
        skill["suggestion"] = item["suggestion"]
    return skill


def _position(position: Mapping[str, Any], scrub: _Scrubber) -> dict[str, Any] | None:
    title = _optional_text(position.get("title"), scrub.text)
    if title is None:
        return None
    result: dict[str, Any] = {"title": title}
    if isinstance(position.get("company"), str):
        result["company"] = position["company"]
    if isinstance(position.get("is_current"), bool):
        result["is_current"] = position["is_current"]
    if "summary" in position:
        result["summary"] = _optional_text(position["summary"], scrub.text)
    if "bullets" in position:
        result["bullets"] = _texts(position["bullets"], scrub.text)
    if _valid_years(position.get("years")):  # the draft shape's length of one position
        result["years"] = position["years"]
    return result


def _education(entry: Mapping[str, Any], scrub: _Scrubber) -> dict[str, Any] | None:
    degree = _optional_text(entry.get("degree"), scrub.text)
    if degree is None:
        return None
    result: dict[str, Any] = {"degree": degree}
    if isinstance(entry.get("institution"), str):
        result["institution"] = entry["institution"]
    return result


def redact(parsed_cv: Mapping[str, Any], *, as_of: date | None = None) -> dict[str, Any]:
    """A copy of the parsed CV without identity details, dates or gender-coded words.

    Reads schema 1.x (`experiences`) and the draft 0.1 (`work_history`, skills as strings),
    and returns the same shape: a valid 1.x record stays valid. `as_of` is the date a current
    position runs to when years of experience are computed (default: today). The input is
    not changed.
    """
    contact = parsed_cv.get("contact")
    contact = contact if isinstance(contact, Mapping) else {}
    _, street = _location_parts(contact.get("location"))
    scrub = _Scrubber(_identity_patterns(contact, street))

    record: dict[str, Any] = {
        key: parsed_cv[key] for key in ("schema_version", "source") if key in parsed_cv
    }
    if "contact" in parsed_cv:
        record["contact"] = {"location": coarse_location(contact.get("location"))}
    for key in ("headline", "summary"):
        if key in parsed_cv:
            record[key] = _optional_text(parsed_cv[key], scrub.text)

    skills = parsed_cv.get("skills")
    if isinstance(skills, list | tuple):
        kept = (_skill(item, scrub) for item in skills)
        record["skills"] = [skill for skill in kept if skill]
    elif "skills" in parsed_cv:
        record["skills"] = []

    positions_key = "experiences" if "experiences" in parsed_cv else "work_history"
    positions = _mappings(parsed_cv.get(positions_key))
    years = parsed_cv.get("experience_years")
    if not _valid_years(years):
        years = total_experience_years(positions, as_of or date.today())
    if years is not None or "experience_years" in parsed_cv:
        record["experience_years"] = years
    if positions_key in parsed_cv:
        record[positions_key] = [
            entry for entry in (_position(item, scrub) for item in positions) if entry
        ]

    if "education" in parsed_cv:
        entries = (_education(item, scrub) for item in _mappings(parsed_cv["education"]))
        record["education"] = [entry for entry in entries if entry]
    if "languages" in parsed_cv:
        languages = parsed_cv["languages"]
        record["languages"] = copy.deepcopy(languages) if isinstance(languages, list) else []
    if "certifications" in parsed_cv:
        record["certifications"] = _texts(parsed_cv["certifications"], scrub.text)
    return record
