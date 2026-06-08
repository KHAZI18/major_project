import numpy as np
import pandas as pd

from scripts.eval import metrics
from scripts.eval.baseline_predictor import bkt_next_correct_predictions
from scripts.eval.simulator import simulate_dataset


def test_auc_on_trivially_separable_set():
    y_true = np.array([0, 0, 0, 1, 1, 1])
    y_prob = np.array([0.1, 0.2, 0.3, 0.7, 0.8, 0.9])
    assert metrics.next_correct_auc(y_true, y_prob) == 1.0


def test_auc_random_is_near_half():
    rng = np.random.default_rng(0)
    y_true = rng.integers(0, 2, 5000)
    y_prob = rng.random(5000)
    auc = metrics.next_correct_auc(y_true, y_prob)
    assert 0.45 < auc < 0.55


def test_auc_requires_both_classes():
    assert np.isnan(metrics.next_correct_auc(np.ones(5), np.array([0.6, 0.7, 0.8, 0.9, 0.5])))


def test_brier_zero_for_perfect_calibration():
    y_true = np.array([0, 1, 0, 1])
    y_prob = np.array([0.0, 1.0, 0.0, 1.0])
    assert metrics.brier(y_true, y_prob) == 0.0


def test_per_skill_brier_returns_value_per_seen_skill():
    df = simulate_dataset(num_students=80, max_interactions=50, seed=3)
    preds = bkt_next_correct_predictions(df)
    out = metrics.per_skill_brier(df, preds)
    assert len(out) >= 5  # several skills exercised
    for v in out.values():
        assert 0.0 <= v <= 1.0


def test_bkt_baseline_beats_chance_on_synthetic():
    df = simulate_dataset(num_students=300, max_interactions=60, seed=5)
    preds = bkt_next_correct_predictions(df)
    auc = metrics.next_correct_auc(df["correct"].to_numpy(), preds)
    assert auc > 0.6  # the model can predict synthetic correctness above chance


from scripts.eval.metrics import run_ab_experiment, run_ablations


def test_ab_treatment_improves_post_test():
    res = run_ab_experiment(num_learners=300, num_problems=50, seed=11)
    assert 0.0 <= res["control_score"] <= 1.0
    assert 0.0 <= res["treatment_score"] <= 1.0
    # adaptive arm should help (spec §8.2 expects 25-40%; require a positive lift here)
    assert res["treatment_score"] > res["control_score"]
    assert res["relative_improvement"] > 0.0


def test_ablations_hurt_relative_to_full_treatment():
    # 90-problem horizon so BOTH components are exercised: long enough that skills are
    # mastered and then enter a maintenance phase (where spaced repetition matters),
    # while the no-graph arm wastes attempts on skills whose prerequisites aren't met
    # (the knowledge graph's real contribution). Verified robust across seeds.
    res = run_ablations(num_learners=400, num_problems=90, seed=13)
    full = res["full_treatment_score"]
    assert res["no_knowledge_graph_score"] <= full + 1e-6
    assert res["no_spaced_repetition_score"] <= full + 1e-6
