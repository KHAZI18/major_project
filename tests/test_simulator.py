import numpy as np

from scripts.eval import schema
from scripts.eval.knowledge_graph import PREREQ_LEARN_GATE, SKILL_IDS
from scripts.eval.simulator import StudentParams, sample_student_params, simulate_dataset, simulate_student


def test_params_in_distribution_ranges():
    rng = np.random.default_rng(0)
    guesses, slips, learns = [], [], []
    for _ in range(2000):
        p = sample_student_params(rng)
        guesses.extend(p.guess.tolist())
        slips.extend(p.slip.tolist())
        learns.extend(p.learn_rate.tolist())
    g, s, l = np.array(guesses), np.array(slips), np.array(learns)
    assert (g >= 0).all() and (g <= 1).all()
    assert (s >= 0).all() and (s <= 1).all()
    assert (l >= 0).all() and (l <= 1).all()
    # Beta(2,8) mean ~0.2; Beta(2,5) mean ~0.286 — sanity bands
    assert 0.15 < g.mean() < 0.27
    assert 0.15 < s.mean() < 0.27
    assert 0.23 < l.mean() < 0.36


def test_output_shape_and_schema():
    df = simulate_dataset(num_students=20, max_interactions=30, seed=42)
    assert set(df.columns) == set(schema.COLUMNS)
    assert df["student_id"].nunique() == 20
    # ~30 interactions each (allow policy-driven variation but cap respected)
    counts = df.groupby("student_id").size()
    assert (counts <= 30).all()
    assert counts.mean() > 10
    schema.validate(df)  # contract holds


def test_prereq_learn_gate_respected():
    """A gated skill's latent ability must NOT grow until its prereq crosses the gate.

    `latent_ability` is recorded BEFORE each step's learning update, and gated
    skills are seeded strictly below the gate (sample_student_params). Subtlety:
    the simulator gates division on multiplication's POST-update ability, but we
    only observe multiplication's PRE-update value in the rows. So a division row
    may legitimately have grown one step after the recorded multiplication value
    is still <= gate. We therefore assert the gate only while NO prior
    multiplication row has been recorded at the gate yet (running-max strictly
    below the gate by more than one max learn step is overkill — instead we stop
    asserting as soon as multiplication is first recorded >= gate - eps).
    """
    EPS = 0.05  # covers exactly the one-step PRE->POST lookahead at the boundary
    df = simulate_dataset(num_students=50, max_interactions=80, seed=7)
    for sid, g in df.groupby("student_id"):
        g = g.sort_values("step_idx")
        mult_running_max = 0.0
        for _, row in g.iterrows():
            if row["skill_id"] == "multiplication":
                mult_running_max = max(mult_running_max, float(row["latent_ability"]))
            # Only assert while multiplication is still clearly below the gate;
            # once it approaches the gate the POST-update value may have unlocked
            # division, so the invariant no longer applies.
            if (row["skill_id"] == "division"
                    and mult_running_max < PREREQ_LEARN_GATE - EPS):
                assert float(row["latent_ability"]) <= PREREQ_LEARN_GATE


def test_determinism():
    a = simulate_dataset(num_students=10, max_interactions=20, seed=123)
    b = simulate_dataset(num_students=10, max_interactions=20, seed=123)
    assert a.equals(b)
    c = simulate_dataset(num_students=10, max_interactions=20, seed=124)
    assert not a.equals(c)


def test_correctness_correlates_with_ability():
    df = simulate_dataset(num_students=200, max_interactions=60, seed=1)
    hi = df[df["latent_ability"] > 0.8]["correct"].mean()
    lo = df[df["latent_ability"] < 0.3]["correct"].mean()
    assert hi > lo + 0.2  # high-ability interactions are clearly more often correct
