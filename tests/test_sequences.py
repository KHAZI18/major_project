import re
from pathlib import Path

import numpy as np

from scripts.eval import schema
from scripts.eval.knowledge_graph import NUM_SKILLS, SKILL_IDS
from scripts.eval.sequences import build_sequences, write_npz
from scripts.eval.simulator import simulate_dataset

JS_PATH = Path(__file__).resolve().parents[1] / "src" / "engine" / "knowledgeGraph.js"
SEQ_LEN = 50


def test_npz_arrays_have_locked_shapes_and_dtypes():
    df = simulate_dataset(num_students=12, max_interactions=30, seed=2)
    seqs = build_sequences(df, seq_len=SEQ_LEN)
    n = df["student_id"].nunique()
    assert seqs["X"].shape == (n, SEQ_LEN, 2 * NUM_SKILLS)
    assert seqs["Y_skill"].shape == (n, SEQ_LEN, NUM_SKILLS)
    assert seqs["Y_correct"].shape == (n, SEQ_LEN)
    assert seqs["mask"].shape == (n, SEQ_LEN)
    assert seqs["input_idx"].shape == (n, SEQ_LEN)
    assert seqs["target_skill_idx"].shape == (n, SEQ_LEN)
    assert seqs["X"].dtype == np.float32
    assert seqs["Y_skill"].dtype == np.float32
    assert seqs["Y_correct"].dtype == np.float32
    assert seqs["mask"].dtype == np.float32
    assert seqs["input_idx"].dtype == np.int16
    assert seqs["target_skill_idx"].dtype == np.int16
    assert list(seqs["skill_ids"]) == SKILL_IDS
    assert int(seqs["num_skills"]) == NUM_SKILLS
    assert int(seqs["seq_len"]) == SEQ_LEN


def test_input_target_shift_and_onehot_convention():
    df = simulate_dataset(num_students=20, max_interactions=40, seed=4)
    seqs = build_sequences(df, seq_len=SEQ_LEN)
    X, Y_skill, Y_correct, mask = seqs["X"], seqs["Y_skill"], seqs["Y_correct"], seqs["mask"]
    for i in range(X.shape[0]):
        real = np.where(mask[i] > 0)[0]
        assert len(real) > 0
        first = real[0]
        # X at the first REAL step is all-zeros (no previous interaction in-window).
        assert X[i, first].sum() == 0.0
        # Y_skill is one-hot at every real step.
        assert np.allclose(Y_skill[i, real].sum(axis=1), 1.0)
        # For consecutive real steps, X[t] one-hot index == prev step's dkt_input_idx
        for t in real[1:]:
            prev_skill = int(seqs["target_skill_idx"][i, t - 1])
            prev_correct = int(Y_correct[i, t - 1])
            expected_idx = prev_skill * 2 + prev_correct  # LOCKED convention
            assert X[i, t].argmax() == expected_idx
            assert X[i, t].sum() == 1.0


def test_front_padding_and_truncation_keep_last_50():
    df = simulate_dataset(num_students=15, max_interactions=80, seed=6)
    seqs = build_sequences(df, seq_len=SEQ_LEN)
    mask = seqs["mask"]
    # students with >=50 steps must be fully unmasked and end at t=49.
    counts = df.groupby("student_id").size()
    full_students = [i for i, sid in enumerate(sorted(df["student_id"].unique()))
                     if counts[sid] >= SEQ_LEN]
    for i in full_students:
        assert mask[i].sum() == SEQ_LEN
        assert mask[i, -1] == 1.0
    # padding is at the FRONT: once a step is real, all later steps are real (no gaps).
    for i in range(mask.shape[0]):
        m = mask[i]
        real = np.where(m > 0)[0]
        if len(real):
            assert (real == np.arange(real[0], SEQ_LEN)).all()


def test_npz_round_trip(tmp_path):
    df = simulate_dataset(num_students=10, max_interactions=30, seed=8)
    seqs = build_sequences(df, seq_len=SEQ_LEN)
    p = tmp_path / "dkt_sequences.npz"
    write_npz(seqs, p)
    d = np.load(p, allow_pickle=False)
    # DKT load_dataset reads exactly these four:
    for k in ("X", "Y_skill", "Y_correct", "mask"):
        assert k in d.files
        assert np.array_equal(d[k], seqs[k])
    assert list(d["skill_ids"]) == SKILL_IDS
    assert int(d["num_skills"]) == NUM_SKILLS


def test_python_encoding_matches_js_source():
    """JS↔Python drift guard: parse SKILL_IDS + PREREQS from knowledgeGraph.js."""
    src = JS_PATH.read_text()
    # SKILL_IDS order = Object.keys(SKILLS); parse the SKILLS object keys in order.
    skills_block = re.search(r"export const SKILLS = \{(.*?)\n\};", src, re.S).group(1)
    js_skill_ids = re.findall(r"^\s*'([\w-]+)':", skills_block, re.M)
    assert js_skill_ids == SKILL_IDS, "skill order drift between JS and Python"
    # PREREQS edges must match.
    prereq_block = re.search(r"const PREREQS = \{(.*?)\n\};", src, re.S).group(1)
    from scripts.eval.knowledge_graph import get_prereqs
    for line in prereq_block.splitlines():
        m = re.match(r"\s*'([\w-]+)':\s*\[(.*?)\],?", line)
        if not m:
            continue
        key, deps = m.group(1), re.findall(r"'([\w-]+)'", m.group(2))
        assert sorted(deps) == sorted(get_prereqs(key)), key
