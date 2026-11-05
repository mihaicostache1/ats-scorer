"""Find required and nice-to-have skills, minimum experience and seniority in a job description.

Rule-based, no model (L-12). The text is cut into clauses (lines, then sentences), and each
clause gets a kind from the heading above it or from a phrase inside it:

- required: under a heading such as "Requirements", "What you bring" or "Must have:"
- preferred: under "Nice to have" or "Bonus", or with a phrase such as "is a plus" or "ideally"
- duties: under "Responsibilities" or "What you'll do", or a sentence starting "You will ..."
- other: about the company, benefits, location
- unknown: anything else, read as required

If the description has no required or nice-to-have section and no nice-to-have phrase, every
skill counts as required, including those in the duties. Otherwise duties are read only when
the rest names no skill. Output format for the backend: docs/ml/job-description-parsing.md
"""

import re
from collections.abc import Collection
from dataclasses import asdict, dataclass, replace
from typing import Any, Literal

from ats_scoring.skill_normalizer import SkillNormalizer, default_normalizer
from ats_scoring.skills import clean_skill

# Stored with a parsed job. Change it whenever the same text could give a different result.
PARSER_VERSION = "jd-parser-0.1.0"

Requirement = Literal["required", "preferred"]
Seniority = Literal["junior", "mid", "senior", "lead"]
SenioritySource = Literal["title", "text", "experience"]
_Kind = Literal["required", "preferred", "duties", "other", "unknown"]

# Longest list item taken as a skill without being recognized by the normalizer.
MAX_ITEM_WORDS = 4

# Headings and line labels ("Must have: ..."), compared after _heading_key().
_HEADINGS: dict[_Kind, tuple[str, ...]] = {
    "required": (
        "requirements",
        "required",
        "required skills",
        "required qualifications",
        "required experience",
        "minimum requirements",
        "minimum qualifications",
        "basic qualifications",
        "qualifications",
        "job requirements",
        "must have",
        "must-have",
        "must haves",
        "must-haves",
        "essential",
        "essentials",
        "essential skills",
        "what you bring",
        "what you'll bring",
        "what you will bring",
        "what we're looking for",
        "what we are looking for",
        "what we look for",
        "who we're looking for",
        "who we are looking for",
        "who you are",
        "about you",
        "your profile",
        "profile",
        "the ideal candidate",
        "ideal candidate",
        "what you need",
        "what you'll need",
        "what you will need",
        "you have",
        "skills",
        "key skills",
        "technical skills",
        "your skills",
        "skills and experience",
        "skills & experience",
        "experience",
        "your experience",
        "tech stack",
        "our tech stack",
        "our stack",
        "stack",
        "technologies",
        "tools",
    ),
    "preferred": (
        "nice to have",
        "nice-to-have",
        "nice to haves",
        "nice-to-haves",
        "good to have",
        "good-to-have",
        "great to have",
        "bonus",
        "bonus points",
        "bonus skills",
        "pluses",
        "plus",
        "preferred",
        "preferred skills",
        "preferred qualifications",
        "preferred experience",
        "desirable",
        "desirable skills",
        "desired skills",
        "even better",
        "even better if",
        "extra points",
        "optional",
    ),
    "duties": (
        "responsibilities",
        "key responsibilities",
        "your responsibilities",
        "main responsibilities",
        "duties",
        "tasks",
        "your tasks",
        "what you will do",
        "what you'll do",
        "what you will be doing",
        "what you'll be doing",
        "what you'll work on",
        "the role",
        "your role",
        "role",
        "about the role",
        "about the job",
        "job description",
        "the job",
        "in this role",
        "day to day",
        "day-to-day",
        "your mission",
        "overview",
    ),
    "other": (
        "about us",
        "about the company",
        "about the team",
        "who we are",
        "the company",
        "company",
        "our team",
        "the team",
        "benefits",
        "perks",
        "perks and benefits",
        "what we offer",
        "we offer",
        "why join us",
        "why us",
        "compensation",
        "salary",
        "location",
        "how to apply",
        "equal opportunity",
        "our values",
        "hiring process",
        "interview process",
        "employment type",
        "start date",
    ),
}
_HEADING_KIND: dict[str, _Kind] = {
    label: kind for kind, labels in _HEADINGS.items() for label in labels
}

_BULLET = re.compile(r"^(?:[•●▪◦‣–—]\s*|[-*+>]\s+|\d{1,2}[.)]\s+)")
# Sentence ends, also ";". "e.g. Python" and "i.e. SQL" do not end a sentence.
_SENTENCE_END = re.compile(r"(?<!\be\.g\.)(?<!\bi\.e\.)(?<=[.!?;])\s+")

# The rest of the clause is nice-to-have: "Python, ideally also Go".
_FORWARD_CUE = re.compile(
    r"\b(?:ideally|preferably|optionally|bonus(?:\s+points)?\s+(?:if|for)|extra\s+points\s+for"
    r"|even\s+better\s+if|(?:nice|good|great)[- ]to[- ]haves?\s*:|plus\s*:|bonus\s*:)",
    re.I,
)
_PLUS = (
    r"(?:is|are|would be|will be)\s+(?:considered\s+)?"
    r"(?:(?:a|an|also|very|big|huge|strong|real|definite|nice|great|added)\s+)*"
    r"(?:plus|advantage|asset|bonus|welcome)\b"
)
# The whole clause is nice-to-have: "Kafka is a plus", "5+ years preferred".
_PREFERRED_CUE = re.compile(
    r"\b(?:nice[- ]to[- ]haves?|good[- ]to[- ]have|great[- ]to[- ]have|preferred|preferably"
    r"|ideally|desirable|desired|optional|advantageous|beneficial"
    rf"|not (?:required|mandatory|essential|a must)\b|{_PLUS})",
    re.I,
)
# Cut from the end of a list: "Go and SQL is a plus." -> "Go and SQL".
_PREFERRED_TAIL = re.compile(rf"\s*,?\s*(?:which\s+|that\s+)?{_PLUS}.*$", re.I)
# A sentence about the work, not the candidate. "You'll need ..." and "You will have ..."
# describe the candidate, so they are not duties.
_DUTY_CUE = re.compile(
    r"(?:in this role,?\s+)?(?:you will|you'll|you are going to|you're going to"
    r"|your (?:main |key |daily )?(?:responsibilities|tasks|duties|day))\b"
    r"(?!\s+(?:need|have|bring|already|ideally|be (?:comfortable|familiar|expected|required"
    r"|proficient|skilled|experienced|confident|fluent|able)))",
    re.I,
)

# What introduces a list of skills: "experience with", "knowledge of", "confident with".
_LEAD_IN = re.compile(
    r"\b(?:(?:experience|expertise|proficiency|knowledge|familiarity|fluency|understanding"
    r"|background|command|competence)\s+(?:with|in|of|on|using)|exposure\s+to"
    r"|(?:experienced|proficient|skilled|versed|familiar|fluent|comfortable|confident|competent"
    r"|hands-on)\s+(?:with|in|using|on))\b:?",
    re.I,
)
# A short label before a list: "Languages: Python, Go".
_LIST_LABEL = re.compile(r"^[\w .&/+#-]{1,30}:\s*")
_CHUNK = re.compile(r"[,;]|\b(?:such as|including|e\.g\.|i\.e\.|etc\.?|like)(?=\W|$)", re.I)
_CONNECTOR = re.compile(r"\s+(?:and/or|and|or|&|as well as|plus|nor)\s+", re.I)
_PREPOSITION = re.compile(
    r"\s+(?:in|for|on|at|to|within|across|using|with|from|when|via|into|by)\s+", re.I
)
_ITEM_PREFIX = re.compile(
    r"^(?:and|or|also|plus|both|either|with|in|of|strong|solid|good|excellent|proven|deep"
    r"|great|basic|advanced|working|practical|hands-on|professional|relevant|modern|some"
    r"|fluent|sound|extensive|in-depth|thorough|very|any|other)\s+",
    re.I,
)
_ITEM_SUFFIX = re.compile(
    r"\s+(?:experience|knowledge|expertise|proficiency|background|certification|certificate"
    r"|etc\.?)$",
    re.I,
)
_ITEM_PUNCTUATION = " \t,;:!?\"'*-–—"
_SMALL_WORDS = frozenset({"a", "an", "and", "as", "for", "in", "of", "on", "the", "to", "&"})
_PRONOUNS = frozenset({"i", "you", "we", "they", "it", "our", "your", "this", "that"})
_NOT_A_SKILL = re.compile(r"\d\s*\+?\s*(?:years?|yrs?|months?)\b|\b(?:experience|degree)\b", re.I)

_NUMBER_WORDS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "fifteen": 15,
    "twenty": 20,
}
_NUMBER = r"(?:\d{1,2}(?:[.,]\d)?|" + "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True)) + ")"
# "5+ years", "3-5 years", "three (3) years", "18 months". A range keeps its lower end.
_YEARS = re.compile(
    rf"\b(?P<low>{_NUMBER})(?:\s*\(\d{{1,2}}\))?\s*\+?\s*"
    rf"(?:(?:-|–|—|to|or)\s*{_NUMBER}\s*\+?\s*)?(?P<unit>years?|yrs?|months?)\b",
    re.I,
)
_EXPERIENCE_WORD = re.compile(r"\b(?:experience|experienced|track record|background)\b", re.I)
_AFTER_YEARS = re.compile(
    r"\s*(?:'|(?:of|in|as|with|working|building|developing|designing|programming|coding"
    r"|managing|leading|hands-on|professional|commercial|industry|relevant)\b)",
    re.I,
)
_NOT_EXPERIENCE = re.compile(
    r"\b(?:ago|old|founded|anniversary|contract|fixed[- ]term|within|warranty|probation)\b", re.I
)
_NO_EXPERIENCE = re.compile(
    r"\bno\s+(?:(?:prior|previous|professional|formal|commercial|work|industry|relevant)\s+)*"
    r"experience\s+(?:is\s+)?(?:needed|required|necessary)\b"
    r"|\bentry[- ]level\b|\b0\s*\+?\s*years?\b",
    re.I,
)

# Checked in order, so "Senior Team Lead" is lead. "Lead Generation" is a field, not a level.
_TITLE_LEVELS: tuple[tuple[Seniority, re.Pattern[str]], ...] = (
    (
        "lead",
        re.compile(
            r"\blead\b(?![- ]gen)"
            r"|\b(?:leader|head of|principal|director|vp|vice president|chief)\b"
            r"|\bstaff\s+(?:\w+\s+)?(?:engineer|developer|scientist|designer|architect)\b",
            re.I,
        ),
    ),
    ("senior", re.compile(r"\b(?:senior|sr)\b", re.I)),
    ("mid", re.compile(r"\b(?:mid|medior|intermediate)\b", re.I)),
    (
        "junior",
        re.compile(
            r"\b(?:junior|jr|graduate|entry[- ]level|intern|internship|trainee|apprentice)\b",
            re.I,
        ),
    ),
)
_LEVEL_PHRASE = re.compile(r"\b(junior|mid|senior|entry)[- ]level\b", re.I)
_PHRASE_LEVEL: dict[str, Seniority] = {
    "entry": "junior",
    "junior": "junior",
    "mid": "mid",
    "senior": "senior",
}
_HIRING = re.compile(
    r"\b(?:looking for|hiring|seeking|searching for|recruiting)\s+(?:an?\s+)?"
    r"(?P<role>[^.,;:()\n]{3,60})",
    re.I,
)
# A team's name is not a skill: "Our Quality Assurance team is growing".
_TEAM = re.compile(r"\bour\s+[\w&/+#. -]{1,40}?\s+(?:team|department|squad|group)\b", re.I)
# Minimum years for each level, highest first. Matches the synthetic generator (L-9).
_YEARS_LEVELS: tuple[tuple[int, Seniority], ...] = (
    (8, "lead"),
    (5, "senior"),
    (2, "mid"),
    (0, "junior"),
)

_Found = tuple[str, str | None]  # (as written, normalized name or None)


@dataclass(frozen=True)
class JobSkill:
    raw: str  # as written in the description
    normalized: str | None  # canonical name from the skill normalizer, or None if unknown
    requirement: Requirement


@dataclass(frozen=True)
class ParsedJob:
    """What parse_job_description() found. `to_dict()` gives the JSON for the backend."""

    required_skills: list[str]  # as written, in order of first mention
    preferred_skills: list[str]  # never also in required_skills
    min_experience_years: int | None  # None: not stated
    seniority: Seniority | None
    seniority_source: SenioritySource | None
    # False: no required or nice-to-have section and no nice-to-have phrase was found, so
    # every skill counts as required.
    sections_detected: bool
    skills: list[JobSkill]  # the same skills with their normalized names
    parser_version: str = PARSER_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class _Clause:
    text: str
    kind: _Kind


def parse_job_description(
    text: str, title: str | None = None, normalizer: SkillNormalizer | None = None
) -> ParsedJob:
    """Read the skills, minimum experience and seniority of a job description.

    `title` is the job's title, when it is known apart from the text. Without it, a short
    first line is taken as the title. Skill names are compared, and recognized, with
    `normalizer` (by default the shared one, see skill_normalizer.default_normalizer).
    """
    normalizer = normalizer or default_normalizer()
    clauses, title_line = _clauses(text.replace("’", "'").replace("‘", "'"), title)
    sections_detected = any(clause.kind in ("required", "preferred") for clause in clauses)

    title = title or title_line
    kinds = {"required", "preferred", "unknown"}
    if not sections_detected:
        kinds.add("duties")
    skills = _collect(clauses, kinds, title, normalizer)
    if not skills and sections_detected:
        skills = _collect(clauses, kinds | {"duties"}, title, normalizer)

    years = _min_experience(clauses)
    seniority, source = _seniority(title, clauses, years)
    return ParsedJob(
        required_skills=[skill.raw for skill in skills if skill.requirement == "required"],
        preferred_skills=[skill.raw for skill in skills if skill.requirement == "preferred"],
        min_experience_years=years,
        seniority=seniority,
        seniority_source=source,
        sections_detected=sections_detected,
        skills=skills,
    )


# --- Clauses ---------------------------------------------------------------------------


def _clauses(text: str, title: str | None) -> tuple[list[_Clause], str | None]:
    """Cut the text into clauses with their kind, and find the title line if there is one.

    A heading sets the kind of the lines below it. A label on a bullet ("- Bonus: Kafka") or
    in a sentence ("Location: Paris.") applies to that bullet or sentence only.
    """
    clauses: list[_Clause] = []
    title_line = None
    section: _Kind = "unknown"
    first = True
    for raw_line in text.splitlines():
        line, bullet = _strip_line(raw_line)
        if not line:
            continue
        heading = _heading(line)
        if heading is not None:
            kind, line = heading
            if not bullet:
                section = kind
        else:
            kind = section
            if first and _is_title_line(line, title):
                title_line, line = line, ""
        first = False
        for sentence in _SENTENCE_END.split(line):
            labeled = _heading(sentence)
            sentence_kind, sentence = labeled if labeled is not None else (kind, sentence)
            clauses += _classify(sentence, sentence_kind)
    return clauses, title_line


def _strip_line(line: str) -> tuple[str, bool]:
    """The line without markdown and its bullet, and whether it had a bullet."""
    line = re.sub(r"^#+\s*", "", line.replace("**", "").replace("__", "").strip())
    stripped = _BULLET.sub("", line)
    return stripped.strip(), stripped != line


def _heading_key(label: str) -> str:
    key = re.sub(r"\([^)]*\)", " ", label.casefold())  # "Requirements (must have)"
    key = re.sub(r"[^\w'&/ -]+", " ", key)
    return " ".join(key.split()).strip(" -")


def _heading(line: str) -> tuple[_Kind, str] | None:
    """The kind of a heading ("Nice to have") or a label ("Must have: Python, SQL"), with
    the text after the label."""
    label, _, rest = line.partition(":")
    kind = _HEADING_KIND.get(_heading_key(label))
    return None if kind is None else (kind, rest.strip())


def _is_title_line(line: str, title: str | None) -> bool:
    if title:
        return " ".join(line.casefold().split()).startswith(" ".join(title.casefold().split()))
    return len(line.split()) <= 10 and not line.endswith((".", "!", "?", ":"))


def _classify(sentence: str, kind: _Kind) -> list[_Clause]:
    """Apply the nice-to-have and duty phrases of one sentence to its section's kind."""
    sentence = sentence.strip()
    if not sentence:
        return []
    if kind == "other":
        return [_Clause(sentence, kind)]
    cue = _FORWARD_CUE.search(sentence)
    if cue is not None:
        after = sentence[cue.end() :].strip()
        return _classify(sentence[: cue.start()], kind) + (
            [_Clause(after, "preferred")] if after else []
        )
    if _PREFERRED_CUE.search(sentence):
        return [_Clause(sentence, "preferred")]
    if kind == "unknown" and _DUTY_CUE.match(sentence):
        return [_Clause(sentence, "duties")]
    return [_Clause(sentence, kind)]


# --- Skills ----------------------------------------------------------------------------


def _collect(
    clauses: list[_Clause],
    kinds: Collection[str],
    title: str | None,
    normalizer: SkillNormalizer,
) -> list[JobSkill]:
    """Skills of the clauses of these kinds, once each, in order of first mention. A skill
    that is both required and nice-to-have is required."""
    found: dict[str, JobSkill] = {}
    for clause in clauses:
        if clause.kind not in kinds:
            continue
        if clause.kind in ("unknown", "duties"):
            clause = replace(clause, text=_without_names(clause.text, title))
        requirement: Requirement = "preferred" if clause.kind == "preferred" else "required"
        for raw, normalized in _clause_skills(clause, normalizer):
            key = clean_skill(normalized or raw)
            known = found.get(key)
            if known is None:
                found[key] = JobSkill(raw=raw, normalized=normalized, requirement=requirement)
            elif known.requirement == "preferred" and requirement == "required":
                found[key] = replace(known, requirement="required")
    return list(found.values())


def _without_names(text: str, title: str | None) -> str:
    """Intro and duty text without the job title and team names, which are not skills:
    "Our Quality Assurance team is looking for a Senior QA Automation Engineer"."""
    text = _TEAM.sub(" ", text)
    if title and title.strip():
        text = re.sub(r"\s+".join(map(re.escape, title.split())), " ", text, flags=re.I)
    return text


def _clause_skills(clause: _Clause, normalizer: SkillNormalizer) -> list[_Found]:
    """A list after a lead-in ("experience with A, B and C") is read item by item, and so
    is a whole clause under a required or nice-to-have heading. Other text is searched for
    skills the normalizer knows."""
    lead_in = _LEAD_IN.search(clause.text)
    if lead_in is not None:
        before, after = clause.text[: lead_in.start()], clause.text[lead_in.end() :]
        return _known_skills(before, normalizer) + _list_skills(after, normalizer)
    if clause.kind in ("required", "preferred"):
        return _list_skills(_LIST_LABEL.sub("", clause.text, count=1), normalizer)
    return _known_skills(clause.text, normalizer)


def _known_skills(text: str, normalizer: SkillNormalizer) -> list[_Found]:
    if not text.strip():
        return []
    return [(skill.raw, skill.normalized) for skill in normalizer.extract_skills(text)]


def _list_skills(text: str, normalizer: SkillNormalizer) -> list[_Found]:
    """Skills from a list such as "Python, Docker and AWS (S3, Lambda)".

    An item counts when the normalizer recognizes it, or when it reads like a name: at most
    MAX_ITEM_WORDS words, each capitalized ("Mobile UI Design", "A/B Testing"). A part of the
    list that is neither is searched for known skills instead, so a sentence that is not a
    list ("At least 2 years of experience") gives only the skills it mentions.
    """
    text = re.sub(r"[()\[\]]", ",", _PREFERRED_TAIL.sub("", text))
    found: list[_Found] = []
    for chunk in _CHUNK.split(text):
        items, complete = _chunk_items(chunk, normalizer)
        found += items
        if not complete:
            found += _known_skills(chunk, normalizer)
    return found


def _chunk_items(chunk: str, normalizer: SkillNormalizer) -> tuple[list[_Found], bool]:
    """The items of one comma-separated part, and whether every item was taken."""
    item = _clean_item(chunk)
    if not item:
        return [], True
    normalized = _normalize(item, normalizer)
    if normalized is not None:  # also keeps a known name that contains "and"
        return [(item, normalized)], True

    found: list[_Found] = []
    complete = True
    for part in filter(None, (_clean_item(part) for part in _CONNECTOR.split(item))):
        normalized = _normalize(part, normalizer)
        halves = [half.strip() for half in part.split("/")]
        known = [_normalize(half, normalizer) for half in halves]
        if normalized is not None:
            found.append((part, normalized))
        elif len(halves) > 1 and all(known):  # "Python/Go", but not "A/B Testing"
            found += list(zip(halves, known, strict=True))
        elif _name_like(part):
            found.append((part, None))
        else:
            complete = False
    return found, complete


def _clean_item(text: str) -> str:
    """Cut a list item down to the skill: "and solid Python in production." -> "Python".
    A leading dot is kept for ".NET"."""
    item = _PREPOSITION.split(text.strip(), maxsplit=1)[0]
    item = item.strip(_ITEM_PUNCTUATION).rstrip(".")
    while (shorter := _ITEM_PREFIX.sub("", item)) != item:
        item = shorter
    return _ITEM_SUFFIX.sub("", item).strip(_ITEM_PUNCTUATION).rstrip(".")


def _normalize(item: str, normalizer: SkillNormalizer) -> str | None:
    results = normalizer.normalize_skills([item])
    return results[0].normalized if results else None


def _name_like(item: str) -> bool:
    words = item.split()
    if not 1 <= len(words) <= MAX_ITEM_WORDS or _NOT_A_SKILL.search(item):
        return False
    if words[0].casefold() in _SMALL_WORDS | _PRONOUNS or not any(c.isupper() for c in item):
        return False
    return all(
        word.casefold() in _SMALL_WORDS or not word[0].isalpha() or any(c.isupper() for c in word)
        for word in words
    )


# --- Experience and seniority ----------------------------------------------------------


def _min_experience(clauses: list[_Clause]) -> int | None:
    """The highest minimum stated outside nice-to-have, company and benefits text, so that
    "5+ years, 2 of them with Kubernetes" gives 5 and "5+ years preferred" is ignored."""
    years = [
        value
        for clause in clauses
        if clause.kind in ("required", "unknown", "duties")
        for value in _experience_years(clause.text, strict=clause.kind != "required")
    ]
    return max(years, default=None)


def _experience_years(text: str, strict: bool) -> list[int]:
    """Years of experience asked for in one clause. Under a requirements heading any number
    of years counts ("5+ yrs Python"); elsewhere the clause must be about experience."""
    found = [0] if _NO_EXPERIENCE.search(text) else []
    if _NOT_EXPERIENCE.search(text):
        return found
    for match in _YEARS.finditer(text):
        if strict and not (_EXPERIENCE_WORD.search(text) or _AFTER_YEARS.match(text, match.end())):
            continue
        low = match["low"].casefold()
        value = _NUMBER_WORDS.get(low) or float(low.replace(",", "."))
        if match["unit"].casefold().startswith("month"):
            value /= 12
        found.append(int(value))
    return found


def _title_level(title: str) -> Seniority | None:
    for level, pattern in _TITLE_LEVELS:
        if pattern.search(title):
            return level
    return None


def _seniority(
    title: str | None, clauses: list[_Clause], years: int | None
) -> tuple[Seniority | None, SenioritySource | None]:
    """From the title, then from the text ("we're hiring a senior ...", "mid-level"), then
    from the minimum years of experience."""
    level = _title_level(title) if title else None
    if level is not None:
        return level, "title"
    for clause in clauses:
        if clause.kind == "other":
            continue
        hiring = _HIRING.search(clause.text)
        level = _title_level(hiring["role"]) if hiring else None
        phrase = _LEVEL_PHRASE.search(clause.text)
        if level is None and phrase is not None:
            level = _PHRASE_LEVEL[phrase[1].casefold()]
        if level is not None:
            return level, "text"
    if years is None:
        return None, None
    return next(level for minimum, level in _YEARS_LEVELS if years >= minimum), "experience"
