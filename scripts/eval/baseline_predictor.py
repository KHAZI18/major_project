"""BKT one-step next-correct predictor over a trajectory frame.

Replays BKT per student in chronological order: BEFORE seeing step t's outcome,
predict P(correct at t) from the running belief; then update belief with the
actual outcome. This is the same prediction target a DKT model produces, so the
DKT plan can drop its predictions into metrics.next_correct_auc unchanged.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from scripts.eval import bkt
from scripts.eval.knowledge_graph import NUM_SKILLS, skill_index


def bkt_next_correct_predictions(df: pd.DataFrame, params: bkt.BKTParams = bkt.DEFAULT_PARAMS) -> np.ndarray:
    """Return P(correct) aligned to the INPUT df's positional row order.

    Robust to an unsorted input: we replay BKT in chronological (student_id,
    step_idx) order but scatter each prediction back to the row's ORIGINAL
    position, so `preds[i]` always corresponds to `df.iloc[i]`. This is what
    metrics.per_skill_brier (which indexes by position) relies on.
    """
    n = len(df)
    preds = np.empty(n, dtype=float)
    # original positional index of each row, in chronological order
    order = df.sort_values(["student_id", "step_idx"]).index
    pos_of = {label: i for i, label in enumerate(df.index)}
    sdf = df.loc[order]
    for _, g in sdf.groupby("student_id", sort=False):
        belief = np.full(NUM_SKILLS, params.pL0)
        for label, row in g.iterrows():
            k = skill_index(row["skill_id"])
            preds[pos_of[label]] = bkt.prob_correct(belief[k], params)
            belief[k] = bkt.update_belief(belief[k], bool(row["correct"]), params)
    return preds
