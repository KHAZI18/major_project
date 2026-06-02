#!/usr/bin/env python3
"""Evaluation harness for the Adaptive Learning Engine (spec §8.1, §8.2, §8.4).

Examples:
  ./venv/bin/python3 -m scripts.evaluate                                   # all sections, synthetic
  ./venv/bin/python3 -m scripts.evaluate --traj data/synthetic/trajectories.parquet
  ./venv/bin/python3 -m scripts.evaluate --assistments data/assistments_2009.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from scripts.eval import io as traj_io
from scripts.eval import metrics
from scripts.eval.baseline_predictor import bkt_next_correct_predictions
from scripts.eval.simulator import simulate_dataset

ASSISTMENTS_HELP = """
ASSISTments-2009 not provided. To run the external sanity check (spec §8.1):
  1. Request/download "skill_builder_data09-10" from the ASSISTments dataset page
     (https://sites.google.com/site/assistmentsdata/home). It is gated; cite Feng
     et al. 2009 in the report.
  2. Reduce to columns: user_id, skill_id (or skill_name), correct, order_id.
  3. Save as CSV and pass --assistments PATH. The harness maps user_id->student_id,
     skill_name->skill_id, order_id->step ordering, then reuses the BKT baseline +
     next_correct_auc. Expected AUC >= 0.80 (Piech et al. 2015).
"""


def _section_81_synthetic(df: pd.DataFrame) -> None:
    print("\n=== §8.1 Model accuracy (synthetic, held-out 20% of students) ===")
    train, test = metrics.train_test_split_by_student(df, test_frac=0.2)
    preds = bkt_next_correct_predictions(test)
    auc = metrics.next_correct_auc(test["correct"].to_numpy(), preds)
    print(f"Held-out students: {test['student_id'].nunique()}  rows: {len(test):,}")
    print(f"BKT-baseline next-correct AUC: {auc:.4f}   (target >= 0.85 for DKT)")
    brier = metrics.brier(test["correct"].to_numpy(), preds)
    print(f"Overall Brier: {brier:.4f}   (target < 0.20)")
    per_skill = metrics.per_skill_brier(test, preds)
    worst = sorted(per_skill.items(), key=lambda kv: -kv[1])[:3]
    print("Worst-calibrated skills (Brier):", ", ".join(f"{s}={b:.3f}" for s, b in worst))


def _section_81_assistments(path: Path) -> None:
    print("\n=== §8.1 External sanity check (ASSISTments-2009) ===")
    if not path.exists():
        print(ASSISTMENTS_HELP)
        return
    raw = pd.read_csv(path)
    df = pd.DataFrame({
        "student_id": raw["user_id"].astype("category").cat.codes.astype("int32"),
        "skill_id": raw.get("skill_name", raw.get("skill_id")).astype("string"),
        "correct": raw["correct"].astype("int8"),
        "step_idx": raw.groupby("user_id").cumcount().astype("int16"),
    })
    # NOTE: real ASSISTments skills won't match our 13-skill graph; the baseline
    # predictor here is a per-skill BKT keyed by the dataset's own skills.
    df = df.sort_values(["student_id", "step_idx"])
    preds = _assistments_bkt(df)
    auc = metrics.next_correct_auc(df["correct"].to_numpy(), preds)
    print(f"ASSISTments rows: {len(df):,}  skills: {df['skill_id'].nunique()}")
    print(f"BKT-baseline AUC: {auc:.4f}   (target >= 0.80)")


def _assistments_bkt(df: pd.DataFrame) -> np.ndarray:
    """Per-skill BKT keyed by the dataset's own skill labels (graph-agnostic)."""
    from scripts.eval import bkt
    preds = np.empty(len(df), dtype=float)
    pos = 0
    for _, g in df.groupby("student_id", sort=False):
        belief: dict[str, float] = {}
        for _, row in g.iterrows():
            s = row["skill_id"]
            pL = belief.get(s, bkt.DEFAULT_PARAMS.pL0)
            preds[pos] = bkt.prob_correct(pL)
            belief[s] = bkt.update_belief(pL, bool(row["correct"]))
            pos += 1
    return preds


def _section_82(num_learners: int, seed: int) -> None:
    print("\n=== §8.2 Simulated A/B learning gains ===")
    res = metrics.run_ab_experiment(num_learners=num_learners, num_problems=50, seed=seed)
    print(f"Learners/arm: {res['num_learners']}  problems: {res['num_problems']}")
    print(f"Control post-test:   {res['control_score']:.4f}")
    print(f"Treatment post-test: {res['treatment_score']:.4f}")
    print(f"Relative improvement: {res['relative_improvement'] * 100:.1f}%   (spec target 25-40%)")


def _section_84(num_learners: int, seed: int) -> None:
    print("\n=== §8.4 Component ablations ===")
    res = metrics.run_ablations(num_learners=num_learners, num_problems=50, seed=seed)
    full = res["full_treatment_score"]
    print(f"Full treatment:        {full:.4f}")
    print(f"-- no knowledge graph: {res['no_knowledge_graph_score']:.4f}  "
          f"(Δ {res['no_knowledge_graph_score'] - full:+.4f})")
    print(f"-- no spaced repetition:{res['no_spaced_repetition_score']:.4f}  "
          f"(Δ {res['no_spaced_repetition_score'] - full:+.4f})")


def main() -> None:
    ap = argparse.ArgumentParser(description="Adaptive Learning Engine evaluation harness.")
    ap.add_argument("--traj", type=str, default=None,
                    help="Trajectory parquet/csv for §8.1; if omitted, simulate on the fly.")
    ap.add_argument("--assistments", type=str, default=None,
                    help="Path to a reduced ASSISTments-2009 CSV (external check).")
    ap.add_argument("--ab-learners", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--skip", nargs="*", default=[], choices=["81", "82", "84"],
                    help="Sections to skip.")
    args = ap.parse_args()

    if "81" not in args.skip:
        if args.traj:
            df, _ = traj_io.read_trajectories(args.traj)
        else:
            print("No --traj given; simulating 2000 students for §8.1 ...")
            df = simulate_dataset(num_students=2000, max_interactions=80, seed=args.seed)
        _section_81_synthetic(df)
        if args.assistments:
            _section_81_assistments(Path(args.assistments))
        else:
            _section_81_assistments(Path("__missing__"))  # prints help

    if "82" not in args.skip:
        _section_82(args.ab_learners, args.seed)
    if "84" not in args.skip:
        _section_84(args.ab_learners, args.seed)


if __name__ == "__main__":
    main()
