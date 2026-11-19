"""Evaluate each scorer component alone and the full scorer without each one.

Shows what every component adds on the evaluation set. With 30 pairs and one rater, use it
to spot a component that hurts, not to fine-tune weights (see docs/ml/hybrid-scorer.md).

    python evaluation/ablation.py
"""

import dataclasses
from collections.abc import Mapping
from typing import Any

from ats_scoring.config import COMPONENTS, DEFAULT_CONFIG, ScorerConfig
from ats_scoring.evaluate import DEFAULT_EVAL_DIR, EMBEDDINGS_FILE, evaluate, load_embeddings
from ats_scoring.scoring import score


def _with_weights(weights: Mapping[str, float]) -> ScorerConfig:
    total = sum(weights.values())
    return dataclasses.replace(
        DEFAULT_CONFIG, weights={name: weights.get(name, 0.0) / total for name in COMPONENTS}
    )


def variants() -> dict[str, ScorerConfig]:
    result = {"all (weights.yaml)": DEFAULT_CONFIG}
    for name in COMPONENTS:
        result[f"only {name}"] = _with_weights({name: 1.0})
    for name in COMPONENTS:
        rest = {other: w for other, w in DEFAULT_CONFIG.weights.items() if other != name}
        result[f"all but {name}"] = _with_weights(rest)
    return result


def run(config: ScorerConfig, embeddings: Mapping[str, Any]) -> Mapping[str, Any]:
    def scorer(candidate: Any, job: Any, **extra: Any) -> Any:
        return score(candidate, job, config=config, **extra)

    return evaluate(scorer, DEFAULT_EVAL_DIR, "ablation", embeddings)["metrics"]


def main() -> int:
    embeddings = load_embeddings(DEFAULT_EVAL_DIR / EMBEDDINGS_FILE)
    print(f"{'variant':34} {'rho all':>8} {'rho/job':>8} {'NDCG@10':>8}")
    for label, config in variants().items():
        metrics = run(config, embeddings)
        print(
            f"{label:34} {metrics['spearman_all_pairs']:8.3f} "
            f"{metrics['spearman_mean_per_job']:8.3f} {metrics['ndcg_at_10_mean_per_job']:8.3f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
