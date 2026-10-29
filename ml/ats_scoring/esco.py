"""ESCO skills: load the classification from its CSV download and index the labels.

ESCO is not shipped with the package. Download it as described in
docs/ml/skill-normalization.md and pass the path to `load_esco`. ESCO is (c) European Union
and licensed under CC BY 4.0, so anything that shows ESCO labels must show ESCO_ATTRIBUTION.
"""

import csv
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

from ats_scoring.skills import clean_skill

# Credit required by CC BY 4.0. Show it wherever ESCO labels reach a user, for example
# next to the skill suggestions on the review screen or on an "about" page.
ESCO_ATTRIBUTION = (
    "Skill names from ESCO (European Skills, Competences, Qualifications and Occupations), "
    "(c) European Union, https://esco.ec.europa.eu, licensed under CC BY 4.0 "
    "(https://creativecommons.org/licenses/by/4.0/). Labels are cleaned and indexed for "
    "matching; the classification itself is not changed."
)


@dataclass(frozen=True)
class EscoConcept:
    uri: str
    preferred_label: str  # as ESCO spells it, e.g. "Python (computer programming)"

    @property
    def name(self) -> str:
        """The preferred label without its bracketed qualifier: "Python"."""
        return strip_qualifier(self.preferred_label)


@dataclass(frozen=True)
class EscoLabel:
    """One way of writing a concept, found under a cleaned key."""

    text: str  # what to show: the label as ESCO spells it, without a bracketed qualifier
    concept: EscoConcept
    kind: str  # "preferred", "alternative" or "hidden"
    primary: bool  # from the first file loaded (the main language)
    qualified: bool = False  # the key is the label without its qualifier: "java"

    @property
    def display(self) -> str:
        """The name to show for a match on this label.

        Hidden labels are misspellings and old names, and labels in another language are
        not what the app shows, so both fall back to the concept's preferred name.
        Alternative labels are kept: ESCO lists narrower terms there ("Scrum" under "ICT
        project management methodologies"), and the narrower term is what the CV said.
        """
        if self.kind == "hidden" or not self.primary:
            return self.concept.name
        return self.text


@dataclass
class EscoIndex:
    concepts: list[EscoConcept] = field(default_factory=list)
    # cleaned label -> label. Preferred labels win over alternative and hidden ones.
    labels: dict[str, EscoLabel] = field(default_factory=dict)

    def add_concept(self, uri: str, preferred_label: str) -> EscoConcept:
        concept = EscoConcept(uri, preferred_label.strip())
        self.concepts.append(concept)
        self.add_label(preferred_label, concept, "preferred", primary=True)
        return concept

    def add_label(self, label: str, concept: EscoConcept, kind: str, primary: bool) -> None:
        full = label.strip()
        for variant in dict.fromkeys((full, strip_qualifier(label))):
            key = clean_skill(variant)
            if key:
                self.labels.setdefault(
                    key,
                    EscoLabel(strip_qualifier(variant), concept, kind, primary, variant != full),
                )

    def lookup(self, text: str) -> EscoLabel | None:
        """Exact match on a cleaned label."""
        return self.labels.get(clean_skill(text))

    def preferred_keys(self) -> set[str]:
        """Cleaned preferred labels of every loaded language, with and without the qualifier."""
        return {key for key, label in self.labels.items() if label.kind == "preferred"}


def strip_qualifier(label: str) -> str:
    """'Python (computer programming)' -> 'Python'."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", label.strip())


def _split_labels(cell: str | None) -> list[str]:
    return [label.strip() for label in re.split(r"[\n|]+", cell or "") if label.strip()]


def _read_rows(path: Path) -> list[Mapping[str, str]]:
    csv.field_size_limit(10_000_000)
    with open(path, encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = {"conceptUri", "preferredLabel"} - set(reader.fieldnames or [])
        if missing:
            raise ValueError(
                f"{path} does not look like ESCO's skills file: no {sorted(missing)} column"
            )
        return [row for row in reader if row["conceptUri"] and row["preferredLabel"]]


def load_esco(*paths: str | Path) -> EscoIndex:
    """Load ESCO skills files (`skills_en.csv` and, optionally, other languages).

    The first file is the main language: its preferred labels become the names the app
    shows. Later files only add labels to the same concepts, so a Romanian or German CV
    can match, and the match is still shown in the main language. Concepts that appear
    in a later file only are ignored. The download lists some concepts twice; the
    first row wins.
    """
    if not paths:
        raise ValueError("load_esco needs at least one ESCO skills file")
    index = EscoIndex()
    by_uri: dict[str, EscoConcept] = {}
    for position, path in enumerate(paths):
        primary = position == 0
        rows = _read_rows(Path(path))
        if primary:
            for row in rows:
                if row["conceptUri"] not in by_uri:
                    by_uri[row["conceptUri"]] = index.add_concept(
                        row["conceptUri"], row["preferredLabel"]
                    )
        else:
            for row in rows:
                concept = by_uri.get(row["conceptUri"])
                if concept is not None:
                    index.add_label(row["preferredLabel"], concept, "preferred", primary)
        _add_other_labels(index, rows, by_uri, primary)
    return index


def _add_other_labels(
    index: EscoIndex,
    rows: Iterable[Mapping[str, str]],
    by_uri: dict[str, EscoConcept],
    primary: bool,
) -> None:
    # After all preferred labels of the file, so that a preferred label always wins a key.
    for row in rows:
        concept = by_uri.get(row["conceptUri"])
        if concept is None:
            continue
        for column, kind in (("altLabels", "alternative"), ("hiddenLabels", "hidden")):
            for label in _split_labels(row.get(column)):
                index.add_label(label, concept, kind, primary)
