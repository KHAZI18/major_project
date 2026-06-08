"""Read/write trajectory datasets as Parquet (preferred) or CSV (fallback)."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from scripts.eval import schema


def _meta_path(path: Path) -> Path:
    return path.with_suffix(".meta.json")


def write_trajectories(df: pd.DataFrame, path, meta: dict | None = None) -> None:
    path = Path(path)
    schema.validate(df)
    df = df.sort_values(["student_id", "step_idx"]).reset_index(drop=True)
    if path.suffix == ".csv":
        df.to_csv(path, index=False)
    else:
        df.to_parquet(path, index=False)  # requires pyarrow
    full_meta = {
        "schema_version": schema.SCHEMA_VERSION,
        "num_skills": schema.NUM_SKILLS,
        "skill_ids": schema.SKILL_IDS,
        "max_seq_len": schema.MAX_SEQ_LEN,
    }
    full_meta.update(meta or {})
    _meta_path(path).write_text(json.dumps(full_meta, indent=2))


def read_trajectories(path, validate: bool = True) -> tuple[pd.DataFrame, dict]:
    path = Path(path)
    if path.suffix == ".csv":
        df = pd.read_csv(path)
    else:
        df = pd.read_parquet(path)
    df = df.astype({k: v for k, v in schema.DTYPES.items() if k in df.columns})
    meta_p = _meta_path(path)
    meta = json.loads(meta_p.read_text()) if meta_p.exists() else {}
    if validate:
        schema.validate(df)
    return df, meta
