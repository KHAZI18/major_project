"""Long-format trajectory frame -> padded, training-ready DKT .npz.

LOCKED contract (see the plan's data-contract section). The DKT pipeline's
load_dataset() reads X, Y_skill, Y_correct, mask from this file directly; this
module is the SINGLE place the (skill, correct) one-hot encoding + DKT input/
target shift + front-padding is defined. The DKT plan does NOT re-derive it.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from scripts.eval import schema
from scripts.eval.knowledge_graph import NUM_SKILLS, SKILL_IDS

DEFAULT_SEQ_LEN = schema.MAX_SEQ_LEN  # 50


def build_sequences(df: pd.DataFrame, seq_len: int = DEFAULT_SEQ_LEN) -> dict:
    """Group by student, sort by step, keep the LAST `seq_len`, front-pad, encode.

    Returns a dict of arrays exactly matching the locked .npz contract.
    """
    schema.validate(df)
    df = df.sort_values(["student_id", "step_idx"])
    student_ids = sorted(df["student_id"].unique().tolist())
    n = len(student_ids)
    input_dim = 2 * NUM_SKILLS

    X = np.zeros((n, seq_len, input_dim), dtype="float32")
    Y_skill = np.zeros((n, seq_len, NUM_SKILLS), dtype="float32")
    Y_correct = np.zeros((n, seq_len), dtype="float32")
    mask = np.zeros((n, seq_len), dtype="float32")
    input_idx = np.full((n, seq_len), -1, dtype="int16")
    target_skill_idx = np.zeros((n, seq_len), dtype="int16")

    groups = {sid: g for sid, g in df.groupby("student_id", sort=False)}
    for i, sid in enumerate(student_ids):
        g = groups[sid].sort_values("step_idx")
        skills = g["skill_idx"].to_numpy(dtype=np.int64)
        corrects = g["correct"].to_numpy(dtype=np.int64)
        dkt_idx = g["dkt_input_idx"].to_numpy(dtype=np.int64)  # = skill*2 + correct
        # keep the LAST seq_len interactions
        if len(skills) > seq_len:
            skills = skills[-seq_len:]
            corrects = corrects[-seq_len:]
            dkt_idx = dkt_idx[-seq_len:]
        L = len(skills)
        start = seq_len - L  # FRONT padding
        for j in range(L):
            t = start + j
            # target = CURRENT interaction at j
            target_skill_idx[i, t] = skills[j]
            Y_skill[i, t, skills[j]] = 1.0
            Y_correct[i, t] = float(corrects[j])
            mask[i, t] = 1.0
            # input = PREVIOUS interaction (DKT shift); first real step has none
            if j > 0:
                X[i, t, dkt_idx[j - 1]] = 1.0
                input_idx[i, t] = np.int16(dkt_idx[j - 1])
    return {
        "X": X,
        "Y_skill": Y_skill,
        "Y_correct": Y_correct,
        "mask": mask,
        "input_idx": input_idx,
        "target_skill_idx": target_skill_idx,
        "skill_ids": np.array(SKILL_IDS, dtype="<U16"),
        "num_skills": np.int64(NUM_SKILLS),
        "seq_len": np.int64(seq_len),
    }


def write_npz(seqs: dict, path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, **seqs)
