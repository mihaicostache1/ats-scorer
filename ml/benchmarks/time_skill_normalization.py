"""Time the skill normalizer on 1,000 skill strings against the full ESCO skills file.

Needs ESCO's skills_en.csv (see docs/ml/skill-normalization.md). The strings are distinct
and mostly misspelled, so each one goes through every step: the worst case. A real CV
repeats common skills, which the normalizer answers from its cache.

    python benchmarks/time_skill_normalization.py --esco embedding_spike/data/skills_en.csv
    python benchmarks/time_skill_normalization.py --esco ... --count 1000 --embeddings
"""

import argparse
import platform
import random
import statistics
import time
from pathlib import Path

from ats_scoring.esco import load_esco
from ats_scoring.skill_normalizer import ALIASES, SentenceTransformerEmbedder, SkillNormalizer

CACHE = Path(__file__).resolve().parent / "cache"


def skill_strings(count: int, seed: int = 7) -> list[str]:
    rng = random.Random(seed)
    known = sorted({*ALIASES, *ALIASES.values(), "project management", "communication"})
    strings: dict[str, None] = {}
    while len(strings) < count:
        word = rng.choice(known)
        cut = rng.randrange(len(word))
        strings[word[:cut] + word[cut + 1 :] + rng.choice(["", " dev", " skills", "ing"])] = None
    return list(strings)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--esco", type=Path, required=True, help="path to ESCO's skills_en.csv")
    parser.add_argument("--count", type=int, default=1000, help="skill strings per pass")
    parser.add_argument("--passes", type=int, default=3, help="timed passes, median reported")
    parser.add_argument(
        "--embeddings", action="store_true", help="also run step 5 (needs ml/[embeddings])"
    )
    args = parser.parse_args()

    started = time.perf_counter()
    esco = load_esco(args.esco)
    print(
        f"Loaded {len(esco.concepts)} concepts, {len(esco.labels)} labels in "
        f"{time.perf_counter() - started:.2f} s"
    )

    embedder = SentenceTransformerEmbedder() if args.embeddings else None
    # The file records the model and the ESCO concepts; it is rebuilt when either changes.
    cache = CACHE / "esco_labels.npz" if embedder else None
    if embedder:
        # Embedding the ESCO labels happens once per model; it is not part of the timing.
        started = time.perf_counter()
        SkillNormalizer(esco, embedder=embedder, label_embeddings_cache=cache).normalize_skills(
            ["warm-up string that matches nothing"]
        )
        print(f"ESCO label embeddings ready in {time.perf_counter() - started:.1f} s")

    strings = skill_strings(args.count)
    timings = []
    methods: dict[str, int] = {}
    for _ in range(max(1, args.passes)):
        # A new normalizer per pass, so the cache does not answer the second pass.
        normalizer = SkillNormalizer(esco, embedder=embedder, label_embeddings_cache=cache)
        started = time.perf_counter()
        results = normalizer.normalize_skills(strings)
        timings.append(time.perf_counter() - started)
        methods = {}
        for result in results:
            methods[result.method] = methods.get(result.method, 0) + 1

    seconds = statistics.median(timings)
    print(
        f"{args.count} skill strings in {seconds:.2f} s, {seconds / args.count * 1000:.2f} ms "
        f"each (median of {len(timings)} passes). Decided by: {methods}"
    )
    print(f"Python {platform.python_version()}, {platform.processor() or platform.machine()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
