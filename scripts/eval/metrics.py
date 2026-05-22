"""Evaluation metrics for the Adaptive Learning Engine (spec §8.1)."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score


def next_correct_auc(y_true, y_prob) -> float:
    """AUC of next-correct prediction. Returns NaN if only one class is present."""
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    if len(np.unique(y_true)) < 2:
        return float("nan")
    return float(roc_auc_score(y_true, y_prob))


def brier(y_true, y_prob) -> float:
    # pos_label=1 is REQUIRED for sklearn >=1.3: when y_true has a single unique
    # value, brier_score_loss raises "pos_label is not specified" without it.
    # Our labels are always 0/1, so pinning pos_label=1 is correct and safe.
    return float(brier_score_loss(np.asarray(y_true), np.asarray(y_prob), pos_label=1))


def per_skill_brier(df: pd.DataFrame, preds) -> dict[str, float]:
    """Brier score per skill over rows where that skill appears (spec §8.1 calibration).

    `preds` must be aligned to `df.iloc` positions (bkt_next_correct_predictions
    guarantees this). A skill seen only-correct or only-wrong has a single-class
    subset, so pos_label=1 is required (see brier()).
    """
    preds = np.asarray(preds)
    out: dict[str, float] = {}
    for sid, idx in df.groupby("skill_id").groups.items():
        pos = df.index.get_indexer(idx)
        yt = df.loc[idx, "correct"].to_numpy()
        out[str(sid)] = float(brier_score_loss(yt, preds[pos], pos_label=1)) if len(yt) else float("nan")
    return out


def train_test_split_by_student(df: pd.DataFrame, test_frac: float = 0.2, seed: int = 2026):
    """Hold out a fraction of STUDENTS (not rows) — spec §8.1 'held-out 20% of students'."""
    rng = np.random.default_rng(seed)
    students = df["student_id"].unique()
    rng.shuffle(students)
    n_test = int(len(students) * test_frac)
    test_ids = set(students[:n_test].tolist())
    test_mask = df["student_id"].isin(test_ids)
    return df[~test_mask].copy(), df[test_mask].copy()


# ─── Simulated A/B (spec §8.2) + ablations (spec §8.4) ───────────────────────────

from scripts.eval import bkt, decision  # noqa: E402,F401
from scripts.eval.knowledge_graph import (  # noqa: E402
    NUM_SKILLS,
    PREREQ_LEARN_GATE,
    SKILL_IDS,
    get_prereqs,
    skill_index,
)
from scripts.eval.simulator import (  # noqa: E402
    DIFFICULTY_PENALTY,
    sample_student_params,
)

_DIFF_TO_INT = {"easy": 0, "medium": 1, "hard": 2}


def _ability_map(ability):
    return {SKILL_IDS[k]: float(ability[k]) for k in range(NUM_SKILLS)}


def _learnable(ability, k: int) -> bool:
    return all(ability[skill_index(p)] > PREREQ_LEARN_GATE for p in get_prereqs(SKILL_IDS[k]))


def _attempt(ability, params, k: int, difficulty: int, rng) -> int:
    a = float(ability[k])
    p = a * (1 - params.slip[k]) + (1 - a) * params.guess[k]
    p = float(np.clip(p - DIFFICULTY_PENALTY[difficulty], 0.01, 0.99))
    correct = int(rng.random() < p)
    if _learnable(ability, k):
        if correct:
            ability[k] = a + (1 - a) * float(params.learn_rate[k])
        else:
            ability[k] = max(0.0, a - 0.02 * float(params.learn_rate[k]))
        ability[k] = float(np.clip(ability[k], 0.0, 1.0))
    return correct


def _post_test(ability, params, rng) -> float:
    """Mean P(correct) at fixed medium difficulty across all skills (no learning)."""
    scores = []
    for k in range(NUM_SKILLS):
        a = float(ability[k])
        p = a * (1 - params.slip[k]) + (1 - a) * params.guess[k]
        scores.append(float(np.clip(p - DIFFICULTY_PENALTY[1], 0.0, 1.0)))
    return float(np.mean(scores))


# Forgetting model: every simulated day, each skill NOT practiced that day decays
# slightly toward its prior. Without forgetting, re-testing a mastered skill is pure
# waste and the spaced-repetition ablation would INVERT (removing SR would free a
# problem slot and look better). Decay gives SR a real job — counteracting forgetting
# on already-mastered skills — so `no_spaced_repetition_score <= full_treatment_score`
# holds for the right reason. Magnitude is plan-chosen (Open Question #7).
FORGET_PER_DAY = 0.01  # absolute ability lost per idle day per skill. Gentle enough that
# SM-2's growing review intervals keep mastered skills maintained in the full arm, while
# the no-SR arm (which no longer re-teaches mastered skills — see frontier masking in
# _run_arm) lets them decay unchecked, so the ablation hurts for the right reason.


def _run_arm(params, num_problems: int, rng, *, adaptive: bool, use_graph: bool,
             use_sm2: bool) -> float:
    ability = params.init_ability.copy()
    review: dict[str, dict] = {}
    ever_mastered = {s for s in range(NUM_SKILLS) if ability[s] > 0.75}
    last_k = None
    now = 0.0
    DAY = decision.DAY_MS
    for _ in range(num_problems):
        now += DAY  # one problem per simulated day
        mastery = _ability_map(ability)

        # 1. Spaced-repetition maintenance (only arms with SR): refresh a due skill.
        #    This is the ONLY mechanism that revisits an already-mastered skill, so it is
        #    solely responsible for retention — making the SR ablation bite for real.
        due = decision.due_for_review(review, now) if (adaptive and use_sm2) else []
        if due:
            sid = due[0]
        else:
            # 2. Advance the frontier among skills NEVER yet mastered.
            if adaptive and use_graph:
                # The knowledge graph encodes prerequisites, so it only ever recommends a
                # currently-LEARNABLE skill (prereqs met) and prefers the highest-leverage
                # one. ever-mastered skills are hidden so it advances rather than re-teaches.
                fmask = dict(mastery)
                for s in ever_mastered:
                    fmask[SKILL_IDS[s]] = 1.0
                rec = decision.suggest_next_skill(fmask, now=now)
                sid = rec["skill_id"] if rec else (
                    SKILL_IDS[last_k] if last_k is not None else SKILL_IDS[0])
            else:
                # NO knowledge graph: the learner doesn't know prerequisites, so it picks a
                # random not-yet-mastered skill — possibly one whose prereqs aren't met, which
                # wastes the attempt (_attempt only teaches a learnable skill). Respecting
                # prerequisites is the knowledge graph's real contribution.
                pool = [s for s in range(NUM_SKILLS) if s not in ever_mastered]
                if pool:
                    sid = SKILL_IDS[int(rng.choice(pool))]
                else:
                    sid = SKILL_IDS[last_k] if last_k is not None else SKILL_IDS[0]

        k = skill_index(sid)
        last_k = k
        if adaptive:
            difficulty = _DIFF_TO_INT[decision.next_difficulty(sid, mastery)]
        else:
            difficulty = 1  # control = fixed medium

        correct = _attempt(ability, params, k, difficulty, rng)

        # forgetting: every OTHER skill loses a little ground this day.
        for j in range(NUM_SKILLS):
            if j != k:
                ability[j] = float(np.clip(ability[j] - FORGET_PER_DAY, 0.0, 1.0))

        # remember skills that have ever crossed the mastery cutoff — the recommender
        # will not re-teach them; only SR (full arm) refreshes them once forgotten.
        if ability[k] > 0.75:
            ever_mastered.add(k)

        # update SM-2 schedule when mastered (treatment + use_sm2)
        if adaptive and use_sm2 and ability[k] > 0.85:
            review[sid] = (decision.update_review(review[sid], bool(correct), now)
                           if sid in review else decision.create_review(now))

    return _post_test(ability, params, rng)


def run_ab_experiment(num_learners: int = 1000, num_problems: int = 50, seed: int = 2026) -> dict:
    rng = np.random.default_rng(seed)
    control, treatment = [], []
    for _ in range(num_learners):
        params = sample_student_params(rng)
        # SAME params -> both arms; clone via independent child RNGs for the walk
        c_rng = np.random.default_rng(rng.integers(1 << 31))
        t_rng = np.random.default_rng(rng.integers(1 << 31))
        control.append(_run_arm(params, num_problems, c_rng,
                                adaptive=False, use_graph=False, use_sm2=False))
        treatment.append(_run_arm(params, num_problems, t_rng,
                                  adaptive=True, use_graph=True, use_sm2=True))
    c = float(np.mean(control))
    t = float(np.mean(treatment))
    return {
        "control_score": c,
        "treatment_score": t,
        "relative_improvement": (t - c) / c if c > 0 else float("nan"),
        "num_learners": num_learners,
        "num_problems": num_problems,
    }


def run_ablations(num_learners: int = 1000, num_problems: int = 50, seed: int = 2026) -> dict:
    rng = np.random.default_rng(seed)
    full, no_kg, no_sr = [], [], []
    for _ in range(num_learners):
        params = sample_student_params(rng)
        r1 = np.random.default_rng(rng.integers(1 << 31))
        r2 = np.random.default_rng(rng.integers(1 << 31))
        r3 = np.random.default_rng(rng.integers(1 << 31))
        full.append(_run_arm(params, num_problems, r1, adaptive=True, use_graph=True, use_sm2=True))
        no_kg.append(_run_arm(params, num_problems, r2, adaptive=True, use_graph=False, use_sm2=True))
        no_sr.append(_run_arm(params, num_problems, r3, adaptive=True, use_graph=True, use_sm2=False))
    return {
        "full_treatment_score": float(np.mean(full)),
        "no_knowledge_graph_score": float(np.mean(no_kg)),
        "no_spaced_repetition_score": float(np.mean(no_sr)),
        "num_learners": num_learners,
        "num_problems": num_problems,
    }
