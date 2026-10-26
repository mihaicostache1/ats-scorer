"""Map skill strings to canonical names and ESCO concepts, and find skills in free text.

Follows the L-6 decision (docs/ml/embedding-model-and-skill-matching.md). For each skill,
the first step that succeeds wins:

1. Clean: Unicode form, case, spacing, list bullets and trailing punctuation.
2. Alias table: abbreviations and tech terms ("JS", "k8s", "Docker"). Accepted.
3. Exact match on an ESCO label, also without the bracketed qualifier. Accepted.
4. Fuzzy match on ESCO labels (rapidfuzz). A suggestion only.
5. Embedding match on ESCO concepts, above a threshold. A suggestion only.
6. Otherwise the skill stays as free text.

Usage for the CV parser (B-13): docs/ml/skill-normalization.md
"""

import os
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path
from typing import Literal, Protocol

import numpy as np
from numpy.typing import NDArray
from rapidfuzz import fuzz, process

from ats_scoring.esco import EscoIndex, EscoLabel, load_esco
from ats_scoring.skills import clean_skill

Method = Literal["alias", "exact", "fuzzy", "embedding", "none"]

# Edit-distance similarity (0-100) needed for a fuzzy suggestion, and the shortest string it
# is tried on. Two- and three-letter strings are one typo away from each other.
FUZZY_CUTOFF = 90.0
FUZZY_MIN_LENGTH = 4

# The CV embedding model (L-6). Its cosine scale is high: even unrelated skills score about
# 0.85, so the threshold only filters out the worst suggestions.
DEFAULT_EMBEDDING_MODEL = "intfloat/multilingual-e5-small"
DEFAULT_EMBEDDING_THRESHOLD = 0.90

# Paths of ESCO skills files for default_normalizer(), separated by os.pathsep.
ESCO_SKILLS_ENV = "ESCO_SKILLS_CSV"

# Longest phrase extract_skills() looks for, in words.
MAX_PHRASE_WORDS = 6

# Rows compared at once, to bound memory: 64 strings x ~100,000 ESCO labels.
_FUZZY_CHUNK = 64
_EMBEDDING_CHUNK = 256
_CACHE_LIMIT = 50_000

# Written forms (cleaned) -> the canonical name. Runs before ESCO, so it fixes ESCO's
# wrong exact matches ("ML" is also a programming language in ESCO) and names the tech
# terms ESCO lacks (Docker, Kubernetes, FastAPI). A canonical name is looked up in ESCO
# for its concept, so keep the spelling ESCO uses where ESCO has the skill. Changing the
# table changes what the parser writes, so add tests for new entries.
ALIASES: dict[str, str] = {
    # Abbreviations and nicknames
    "js": "JavaScript",
    "es6": "JavaScript",
    "ts": "TypeScript",
    "py": "Python",
    "python3": "Python",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mongo": "MongoDB",
    "k8s": "Kubernetes",
    "ml": "machine learning",
    "nlp": "natural language processing",
    "golang": "Go",
    "c sharp": "C#",
    "cpp": "C++",
    "node": "Node.js",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "react": "React",
    "reactjs": "React",
    "react.js": "React",
    "react native": "React Native",
    "vue": "Vue.js",
    "vuejs": "Vue.js",
    "vue.js": "Vue.js",
    "nextjs": "Next.js",
    "next.js": "Next.js",
    "angular": "Angular",
    "aws": "Amazon Web Services",
    "gcp": "Google Cloud Platform",
    "azure": "Microsoft Azure",
    "sklearn": "scikit-learn",
    "scikit learn": "scikit-learn",
    "scikit-learn": "scikit-learn",
    "html5": "HTML",
    "css3": "CSS",
    "tailwind": "Tailwind CSS",
    "tailwind css": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "ms excel": "Excel",
    "microsoft excel": "Excel",
    "excel": "Excel",
    "powerbi": "Power BI",
    "power bi": "Power BI",
    "jira": "Jira",
    "ci/cd": "CI/CD",
    "ci cd": "CI/CD",
    "rest api": "REST APIs",
    "rest apis": "REST APIs",
    "restful apis": "REST APIs",
    "oop": "object-oriented programming",
    "qa": "quality assurance",
    "seo": "search engine optimisation",
    "springboot": "Spring Boot",
    "spring boot": "Spring Boot",
    "github actions": "GitHub Actions",
    "gh actions": "GitHub Actions",
    # Tech terms that ESCO lacks, or files under a broader concept (L-6: "Docker" got
    # "dock operations", "Playwright" got "work with playwrights"). Listing them stops
    # the fuzzy and embedding steps from guessing.
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "helm": "Helm",
    "terraform": "Terraform",
    "ansible": "Ansible",
    "jenkins": "Jenkins",
    "argocd": "Argo CD",
    "argo cd": "Argo CD",
    "nginx": "Nginx",
    "prometheus": "Prometheus",
    "grafana": "Grafana",
    "linux": "Linux",
    "git": "Git",
    "bash": "Bash",
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "celery": "Celery",
    "redis": "Redis",
    "kafka": "Kafka",
    "rabbitmq": "RabbitMQ",
    "grpc": "gRPC",
    "graphql": "GraphQL",
    "microservices": "Microservices",
    "pandas": "pandas",
    "numpy": "NumPy",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "xgboost": "XGBoost",
    "hugging face": "Hugging Face Transformers",
    "hugging face transformers": "Hugging Face Transformers",
    "mlflow": "MLflow",
    "airflow": "Airflow",
    "spark": "Spark",
    "apache spark": "Spark",
    "jupyter": "Jupyter",
    "snowflake": "Snowflake",
    "bigquery": "BigQuery",
    "dbt": "dbt",
    "tableau": "Tableau",
    "looker": "Looker",
    "mongodb": "MongoDB",
    "sqlite": "SQLite",
    "firebase": "Firebase",
    "redux": "Redux",
    "webpack": "Webpack",
    "vite": "Vite",
    "storybook": "Storybook",
    "sass": "Sass",
    "jest": "Jest",
    "pytest": "pytest",
    "playwright": "Playwright",
    "cypress": "Cypress",
    "selenium": "Selenium",
    "appium": "Appium",
    "postman": "Postman",
    "jmeter": "JMeter",
    "k6": "k6",
    "cucumber": "Cucumber",
    "testrail": "TestRail",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "swiftui": "SwiftUI",
    "jetpack compose": "Jetpack Compose",
    "flutter": "Flutter",
    "dart": "Dart",
    "fastlane": "Fastlane",
    "figma": "Figma",
    "sketch": "Sketch",
    "adobe xd": "Adobe XD",
    "canva": "Canva",
    "hubspot": "HubSpot",
    "google ads": "Google Ads",
    "google analytics": "Google Analytics",
    "scrum": "Scrum",
    "kanban": "Kanban",
}

# Cleaned single words that are also everyday English. extract_skills() takes them from
# free text only when they are capitalized ("Go", not "go to"). Two-letter words and ESCO
# names that need a qualifier ("Java (computer programming)") are treated the same way.
AMBIGUOUS_WORDS = frozenset(
    {
        "go",
        "node",
        "react",
        "spark",
        "swift",
        "sketch",
        "flask",
        "jest",
        "helm",
        "bash",
        "excel",
        "angular",
        "vite",
        "sass",
        "dart",
        "redux",
        "celery",
        "cucumber",
        "snowflake",
        "looker",
        "postman",
        "canva",
        "kanban",
    }
)

# A word: starts with a letter or digit and keeps inner ".", "/" and "-" and trailing "+"
# and "#": "C++", "C#", "Node.js", "CI/CD", "e-learning". A sentence's final dot is left out.
_TOKEN = re.compile(r"\w[\w+#]*(?:[./-]\w[\w+#]*)*")


@dataclass(frozen=True)
class NormalizedSkill:
    """One skill and what the normalizer made of it.

    `normalized` is set only by the automatic steps (alias, exact). A fuzzy or embedding
    match leaves it empty and fills `suggestion` instead, for the recruiter to confirm on
    the review screen (US-05). The ESCO fields describe the matched or suggested concept.
    """

    raw: str  # as given, with outer spaces removed
    normalized: str | None
    method: Method
    score: float | None  # 0-1: 1 for alias and exact, ratio / 100 for fuzzy, cosine
    esco_uri: str | None = None
    esco_label: str | None = None  # ESCO's preferred label of that concept
    suggestion: str | None = None

    @property
    def accepted(self) -> bool:
        return self.normalized is not None

    def to_parsed_cv(self) -> dict[str, str | None]:
        """The `skills[]` entry of the parsed-CV schema 1.0."""
        return {"raw": self.raw, "normalized": self.normalized}


_UNMATCHED = NormalizedSkill(raw="", normalized=None, method="none", score=None)


class Embedder(Protocol):
    """Turns texts into unit-length vectors, one row per text."""

    name: str

    def encode(self, texts: Sequence[str]) -> NDArray[np.float32]: ...


class SentenceTransformerEmbedder:
    """Embedder backed by sentence-transformers: `pip install -e "ml/[embeddings]"`."""

    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL, prefix: str = "query: ") -> None:
        # Optional dependency: PyTorch and the model are large, and steps 1-4 do not need them.
        from sentence_transformers import SentenceTransformer

        self.name = model_name
        # E5 models are trained with prefixes. Skill-to-skill is symmetric, so both sides
        # use "query: ". Pass prefix="" for models without prefixes, such as MiniLM.
        self._prefix = prefix
        self._model = SentenceTransformer(model_name, device="cpu")

    def encode(self, texts: Sequence[str]) -> NDArray[np.float32]:
        vectors = self._model.encode(
            [self._prefix + text for text in texts],
            batch_size=128,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return np.asarray(vectors, dtype=np.float32)


class SkillNormalizer:
    """Normalizes skills against an alias table and, optionally, ESCO and an embedding model.

    Build one per process and reuse it: loading ESCO and embedding its labels is the slow
    part, and results are cached per cleaned string.
    """

    def __init__(
        self,
        esco: EscoIndex | None = None,
        *,
        aliases: Mapping[str, str] = ALIASES,
        embedder: Embedder | None = None,
        embedding_threshold: float = DEFAULT_EMBEDDING_THRESHOLD,
        label_embeddings_cache: Path | None = None,
    ) -> None:
        self.esco = esco if esco is not None else EscoIndex()
        self._aliases = {clean_skill(key): name for key, name in aliases.items()}
        # Canonical names are recognized as written too, after ESCO: "natural language
        # processing" without ESCO loaded.
        self._canonical = {clean_skill(name): name for name in self._aliases.values()}
        self._fuzzy_keys = list(self.esco.labels)
        self._fuzzy_labels = list(self.esco.labels.values())
        self._embedder = embedder
        self._embedding_threshold = embedding_threshold
        self._label_embeddings_cache = label_embeddings_cache
        self._label_embeddings: NDArray[np.float32] | None = None
        self._phrases: tuple[dict[str, bool], int] | None = None
        self._cache: dict[str, NormalizedSkill] = {}

    def normalize_skills(self, skills: Iterable[object]) -> list[NormalizedSkill]:
        """Normalize a list of skill strings, such as the skills section of a CV.

        Returns one result per input string, in order. Entries that are not text or are
        empty after cleaning are dropped. Duplicates are kept.
        """
        raws = [skill.strip() for skill in skills if isinstance(skill, str) and clean_skill(skill)]
        keys = [clean_skill(raw) for raw in raws]
        found = {key: self._cache[key] for key in keys if key in self._cache}

        unresolved = []
        for key in dict.fromkeys(keys):
            if key not in found:
                known = self._known(key)
                if known is None:
                    unresolved.append(key)
                else:
                    found[key] = known
        found.update(self._suggest(unresolved))

        if len(self._cache) + len(found) > _CACHE_LIMIT:
            self._cache.clear()
        self._cache.update(found)
        return [replace(found[key], raw=raw) for raw, key in zip(raws, keys, strict=True)]

    def extract_skills(self, text: str) -> list[NormalizedSkill]:
        """Find known skills in free text, such as a summary or job bullets.

        Looks for alias-table entries and ESCO preferred labels, longest phrase first,
        and returns each skill once, in order of first mention. Only exact matches are
        returned: fuzzy and embedding matching on every phrase of a text would mostly
        produce noise. `raw` is the phrase as written.
        """
        phrases, longest = self._phrase_index()
        tokens = list(_TOKEN.finditer(text))
        spans: list[str] = []
        position = 0
        while position < len(tokens):
            for length in range(min(longest, len(tokens) - position), 0, -1):
                start = tokens[position].start()
                surface = text[start : tokens[position + length - 1].end()]
                needs_capital = phrases.get(clean_skill(surface))
                if needs_capital is None or (needs_capital and surface.islower()):
                    continue
                spans.append(surface)
                position += length
                break
            else:
                position += 1

        unique: dict[str, NormalizedSkill] = {}
        for skill in self.normalize_skills(spans):
            if skill.normalized is not None:
                unique.setdefault(clean_skill(skill.normalized), skill)
        return list(unique.values())

    def _known(self, key: str) -> NormalizedSkill | None:
        """Steps 2 and 3: alias table, then exact ESCO label."""
        name = self._aliases.get(key)
        if name is not None:
            return _accepted(name, "alias", self.esco.lookup(name))
        label = self.esco.labels.get(key)
        if label is not None:
            return _accepted(label.display, "exact", label)
        name = self._canonical.get(key)
        if name is not None:
            return _accepted(name, "alias", None)
        return None

    def _suggest(self, keys: list[str]) -> dict[str, NormalizedSkill]:
        """Steps 4 to 6: fuzzy, then embedding, then free text."""
        fuzzy = self._fuzzy([key for key in keys if len(key) >= FUZZY_MIN_LENGTH])
        embedded = self._embed([key for key in keys if key not in fuzzy])
        return {key: fuzzy.get(key) or embedded.get(key) or _UNMATCHED for key in keys}

    def _fuzzy(self, keys: list[str]) -> dict[str, NormalizedSkill]:
        found: dict[str, NormalizedSkill] = {}
        if not keys or not self._fuzzy_keys:
            return found
        for start in range(0, len(keys), _FUZZY_CHUNK):
            chunk = keys[start : start + _FUZZY_CHUNK]
            # Scores under the cut-off come back as 0, which lets rapidfuzz skip most labels.
            scores = process.cdist(
                chunk, self._fuzzy_keys, scorer=fuzz.ratio, score_cutoff=FUZZY_CUTOFF, workers=-1
            )
            best = scores.argmax(axis=1)
            for row, key in enumerate(chunk):
                score = float(scores[row, best[row]])
                if score >= FUZZY_CUTOFF:
                    label = self._fuzzy_labels[int(best[row])]
                    found[key] = _suggested(label.display, "fuzzy", score / 100, label)
        return found

    def _embed(self, keys: list[str]) -> dict[str, NormalizedSkill]:
        found: dict[str, NormalizedSkill] = {}
        if self._embedder is None or not keys or not self.esco.concepts:
            return found
        labels = self._concept_embeddings()
        for start in range(0, len(keys), _EMBEDDING_CHUNK):
            chunk = keys[start : start + _EMBEDDING_CHUNK]
            similarities = self._embedder.encode(chunk) @ labels.T
            best = similarities.argmax(axis=1)
            for row, key in enumerate(chunk):
                score = float(similarities[row, best[row]])
                if score >= self._embedding_threshold:
                    concept = self.esco.concepts[int(best[row])]
                    found[key] = NormalizedSkill(
                        raw="",
                        normalized=None,
                        method="embedding",
                        score=round(score, 3),
                        esco_uri=concept.uri,
                        esco_label=concept.preferred_label,
                        suggestion=concept.name,
                    )
        return found

    def _concept_embeddings(self) -> NDArray[np.float32]:
        """One vector per ESCO concept, from its preferred label. Computed once."""
        if self._label_embeddings is None:
            assert self._embedder is not None
            cache = self._label_embeddings_cache
            count = len(self.esco.concepts)
            if cache is not None and cache.is_file():
                stored = np.load(cache)
                if stored.shape[0] == count:
                    self._label_embeddings = stored.astype(np.float32)
            if self._label_embeddings is None:
                texts = [concept.preferred_label for concept in self.esco.concepts]
                self._label_embeddings = self._embedder.encode(texts)
                if cache is not None:
                    cache.parent.mkdir(parents=True, exist_ok=True)
                    np.save(cache, self._label_embeddings)
        return self._label_embeddings

    def _phrase_index(self) -> tuple[dict[str, bool], int]:
        """Phrases extract_skills() looks for: cleaned phrase -> needs a capital letter."""
        if self._phrases is None:
            phrases: dict[str, bool] = {}
            for key in self.esco.preferred_keys():
                label = self.esco.labels[key]
                qualified = label.text != label.concept.preferred_label
                phrases[key] = _ambiguous(key) or (qualified and " " not in key)
            # Aliases override ESCO: "python" needs no capital, although ESCO qualifies it.
            for key in [*self._canonical, *self._aliases]:
                phrases[key] = _ambiguous(key)
            longest = max((len(key.split()) for key in phrases), default=1)
            self._phrases = (phrases, min(longest, MAX_PHRASE_WORDS))
        return self._phrases


def _ambiguous(key: str) -> bool:
    return len(key) <= 2 or key in AMBIGUOUS_WORDS


def _accepted(name: str, method: Method, label: EscoLabel | None) -> NormalizedSkill:
    return NormalizedSkill(
        raw="",
        normalized=name,
        method=method,
        score=1.0,
        esco_uri=label.concept.uri if label else None,
        esco_label=label.concept.preferred_label if label else None,
    )


def _suggested(name: str, method: Method, score: float, label: EscoLabel) -> NormalizedSkill:
    return NormalizedSkill(
        raw="",
        normalized=None,
        method=method,
        score=round(score, 3),
        esco_uri=label.concept.uri,
        esco_label=label.concept.preferred_label,
        suggestion=name,
    )


@lru_cache(maxsize=1)
def default_normalizer() -> SkillNormalizer:
    """A normalizer built once from the ESCO files listed in $ESCO_SKILLS_CSV.

    Without the variable it uses the alias table only: no ESCO concepts, no suggestions.
    No embedding model is loaded; build a SkillNormalizer yourself for that.
    """
    paths = [path for path in os.environ.get(ESCO_SKILLS_ENV, "").split(os.pathsep) if path]
    return SkillNormalizer(load_esco(*paths) if paths else None)


def normalize_skills(
    skills: Iterable[object], normalizer: SkillNormalizer | None = None
) -> list[NormalizedSkill]:
    """Normalize a list of skill strings. See SkillNormalizer.normalize_skills."""
    return (normalizer or default_normalizer()).normalize_skills(skills)


def extract_skills(text: str, normalizer: SkillNormalizer | None = None) -> list[NormalizedSkill]:
    """Find known skills in free text. See SkillNormalizer.extract_skills."""
    return (normalizer or default_normalizer()).extract_skills(text)
