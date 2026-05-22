import json

import pandas as pd

from scripts.eval import io as traj_io
from scripts.eval import schema


def _toy_frame() -> pd.DataFrame:
    rows = [
        # student 0
        dict(student_id=0, step_idx=0, skill_id="counting", correct=1, difficulty=0,
             response_time_ms=2000, latent_ability=0.30),
        dict(student_id=0, step_idx=1, skill_id="addition", correct=0, difficulty=1,
             response_time_ms=3500, latent_ability=0.21),
        # student 1
        dict(student_id=1, step_idx=0, skill_id="multiplication", correct=1, difficulty=2,
             response_time_ms=1800, latent_ability=0.88),
    ]
    return schema.build_frame(rows)


def test_build_frame_adds_derived_columns():
    df = _toy_frame()
    assert list(df.columns) == schema.COLUMNS
    # skill_idx mirrors canonical SKILL_IDS order
    assert df.loc[0, "skill_idx"] == 0   # counting
    assert df.loc[1, "skill_idx"] == 1   # addition
    # one-hot index = skill_idx*2 + correct
    assert df.loc[0, "dkt_input_idx"] == 0 * 2 + 1
    assert df.loc[1, "dkt_input_idx"] == 1 * 2 + 0
    assert df.loc[2, "dkt_input_idx"] == 3 * 2 + 1


def test_parquet_round_trip(tmp_path):
    df = _toy_frame()
    p = tmp_path / "traj.parquet"
    meta = {"num_students": 2, "seed": 7}
    traj_io.write_trajectories(df, p, meta=meta)
    back, back_meta = traj_io.read_trajectories(p)
    pd.testing.assert_frame_equal(
        back.reset_index(drop=True), df.reset_index(drop=True), check_dtype=False
    )
    assert back_meta["num_skills"] == schema.NUM_SKILLS
    assert back_meta["seed"] == 7
    assert (p.with_suffix(".meta.json")).exists()


def test_csv_fallback_round_trip(tmp_path):
    df = _toy_frame()
    p = tmp_path / "traj.csv"
    traj_io.write_trajectories(df, p, meta={"num_students": 2})
    back, back_meta = traj_io.read_trajectories(p)
    assert len(back) == len(df)
    assert back_meta["num_skills"] == schema.NUM_SKILLS


def test_load_validates_one_hot_invariant(tmp_path):
    df = _toy_frame()
    df.loc[0, "dkt_input_idx"] = 99  # corrupt
    p = tmp_path / "bad.parquet"
    df.to_parquet(p, index=False)
    (p.with_suffix(".meta.json")).write_text(json.dumps({"num_skills": schema.NUM_SKILLS}))
    try:
        traj_io.read_trajectories(p, validate=True)
        assert False, "expected validation error"
    except ValueError as e:
        assert "dkt_input_idx" in str(e)
