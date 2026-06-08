"""The LOCKED trajectory data contract consumed by the DKT pipeline plan.

Long format, one row per interaction, sorted by (student_id, step_idx).
See docs/data/TRAJECTORY_SCHEMA.md for prose.
"""
from __future__ import annotations

import pandas as pd

from scripts.eval.knowledge_graph import NUM_SKILLS, SKILL_IDS, skill_index

SCHEMA_VERSION = 1
MAX_SEQ_LEN = 50  # DKT pads/truncates to this; informational here.

# Difficulty bin encoding (mirrors decisionLayer.nextDifficulty bins).
DIFFICULTY = {"easy": 0, "medium": 1, "hard": 2}

COLUMNS = [
    "student_id",
    "step_idx",
    "skill_id",
    "skill_idx",
    "correct",
    "difficulty",
    "response_time_ms",
    "latent_ability",
    "dkt_input_idx",
]

DTYPES = {
    "student_id": "int32",
    "step_idx": "int16",
    "skill_id": "string",
    "skill_idx": "int8",
    "correct": "int8",
    "difficulty": "int8",
    "response_time_ms": "int32",
    "latent_ability": "float32",
    "dkt_input_idx": "int16",
}


def dkt_input_index(skill_idx: int, correct: int) -> int:
    """Standard DKT one-hot index into a 2*NUM_SKILLS vector."""
    return int(skill_idx) * 2 + int(correct)


def build_frame(rows: list[dict]) -> pd.DataFrame:
    """Take raw simulator rows (without derived cols) and produce a typed, ordered frame."""
    df = pd.DataFrame(rows)
    df["skill_idx"] = df["skill_id"].map(skill_index).astype("int8")
    df["dkt_input_idx"] = (df["skill_idx"].astype(int) * 2 + df["correct"].astype(int))
    df = df[COLUMNS]
    return df.astype(DTYPES)


def validate(df: pd.DataFrame) -> None:
    """Raise ValueError if the frame breaks the locked contract."""
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"trajectory missing columns: {missing}")
    bad_skill = ~df["skill_id"].isin(SKILL_IDS)
    if bad_skill.any():
        raise ValueError(f"unknown skill_id values: {sorted(df.loc[bad_skill, 'skill_id'].unique())}")
    expected = df["skill_idx"].astype(int) * 2 + df["correct"].astype(int)
    if not (df["dkt_input_idx"].astype(int) == expected).all():
        raise ValueError("dkt_input_idx must equal skill_idx*2 + correct")
    if not df["correct"].isin([0, 1]).all():
        raise ValueError("correct must be 0/1")
    if not df["difficulty"].between(0, 2).all():
        raise ValueError("difficulty must be 0/1/2")
