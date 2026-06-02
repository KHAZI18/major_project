"""Generative BKT student simulator (spec §5.3).

Each student has per-skill latent ability that grows via a BKT-style learn step
ONLY when prerequisites are learnable (prereq ability > 0.5). A policy walks the
13-skill graph; each interaction draws correctness from the student's latent
ability under guess/slip, then (if learnable) advances that skill's ability.

Outputs the locked trajectory schema (scripts/eval/schema.py).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from scripts.eval import schema
from scripts.eval.knowledge_graph import (
    NUM_SKILLS,
    PREREQ_LEARN_GATE,
    SKILL_IDS,
    get_prereqs,
    skill_index,
)

# Difficulty modulates the effective success probability (harder => lower P(correct)).
DIFFICULTY_PENALTY = {0: 0.0, 1: 0.08, 2: 0.18}  # subtracted from P(correct)


@dataclass
class StudentParams:
    init_ability: np.ndarray  # (NUM_SKILLS,) prior latent P(known)
    guess: np.ndarray         # (NUM_SKILLS,) Beta(2,8)
    slip: np.ndarray          # (NUM_SKILLS,) Beta(2,8)
    learn_rate: np.ndarray    # (NUM_SKILLS,) Beta(2,5)


def sample_student_params(rng: np.random.Generator) -> StudentParams:
    # Low prior latent ability. A skill that HAS prerequisites cannot have been
    # learned yet (spec §5.3 gate), so its prior is capped strictly below the
    # learn gate — this also makes the gate invariant exact (no Beta(2,8) tail
    # occasionally seeding a gated skill above 0.5). Entry skills (no prereqs,
    # e.g. counting) keep the full Beta(2,8) prior.
    init = rng.beta(2, 8, NUM_SKILLS)
    for k in range(NUM_SKILLS):
        if get_prereqs(SKILL_IDS[k]):  # has at least one prerequisite
            init[k] = min(init[k], PREREQ_LEARN_GATE - 1e-6)
    return StudentParams(
        init_ability=np.clip(init, 0.0, 1.0),
        guess=rng.beta(2, 8, NUM_SKILLS),
        slip=rng.beta(2, 8, NUM_SKILLS),
        learn_rate=rng.beta(2, 5, NUM_SKILLS),
    )


def _prereq_indices(skill_idx: int) -> list[int]:
    return [skill_index(p) for p in get_prereqs(SKILL_IDS[skill_idx])]


def _difficulty_for(ability: float) -> int:
    """Mirror decisionLayer bins (easy<0.4, medium<=0.75, else hard) used as the served bin."""
    if ability < 0.4:
        return 0
    if ability <= 0.75:
        return 1
    return 2


def _choose_skill(ability: np.ndarray, rng: np.random.Generator) -> int:
    """Plausible policy: prefer learnable skills in the ZPD (ability ~0.2-0.8).

    Weight = (prereqs learnable ? 1 : 0.05) * peakedness around mid-mastery.
    """
    weights = np.empty(NUM_SKILLS)
    for k in range(NUM_SKILLS):
        prereqs = _prereq_indices(k)
        learnable = all(ability[p] > PREREQ_LEARN_GATE for p in prereqs)
        if ability[k] >= 0.95:
            base = 0.05  # mastered: occasionally revisit
        else:
            # triangular peak at 0.5 -> emphasise the ZPD
            base = 1.0 - abs(ability[k] - 0.5) * 1.5
            base = max(base, 0.1)
        weights[k] = base * (1.0 if learnable else 0.05)
    weights = weights / weights.sum()
    return int(rng.choice(NUM_SKILLS, p=weights))


def _response_time_ms(ability: float, correct: bool, rng: np.random.Generator) -> int:
    """Lognormal latency; faster when more mastered, slower on wrong answers."""
    mu = 8.2 - 0.9 * ability + (0.25 if not correct else 0.0)  # ~3.6s..1.8s band
    val = float(rng.lognormal(mean=mu, sigma=0.4))
    return int(np.clip(val, 300, 60_000))


def simulate_student(student_id: int, params: StudentParams, max_interactions: int,
                     rng: np.random.Generator) -> list[dict]:
    ability = params.init_ability.copy()
    rows: list[dict] = []
    for step in range(max_interactions):
        k = _choose_skill(ability, rng)
        a = float(ability[k])
        difficulty = _difficulty_for(a)
        p_correct = a * (1 - params.slip[k]) + (1 - a) * params.guess[k]
        p_correct = float(np.clip(p_correct - DIFFICULTY_PENALTY[difficulty], 0.01, 0.99))
        correct = int(rng.random() < p_correct)

        rows.append(dict(
            student_id=student_id,
            step_idx=step,
            skill_id=SKILL_IDS[k],
            correct=correct,
            difficulty=difficulty,
            response_time_ms=_response_time_ms(a, bool(correct), rng),
            latent_ability=a,  # ability BEFORE this step's learning update
        ))

        # Learning update — only if prereqs are learnable (spec §5.3 gate).
        prereqs = _prereq_indices(k)
        learnable = all(ability[p] > PREREQ_LEARN_GATE for p in prereqs)
        if learnable and correct:
            ability[k] = a + (1 - a) * float(params.learn_rate[k])
        elif learnable and not correct:
            # small forgetting/no-gain on wrong answers
            ability[k] = max(0.0, a - 0.02 * float(params.learn_rate[k]))
        # if not learnable, ability[k] stays near prior (gate enforced)
        ability[k] = float(np.clip(ability[k], 0.0, 1.0))
    return rows


def simulate_dataset(num_students: int = 10_000, max_interactions: int = 80,
                     seed: int = 2026) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    all_rows: list[dict] = []
    for sid in range(num_students):
        params = sample_student_params(rng)
        all_rows.extend(simulate_student(sid, params, max_interactions, rng))
    return schema.build_frame(all_rows)
