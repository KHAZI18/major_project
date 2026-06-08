# Adaptive Learning Engine — Synthetic Data Generator + Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python side of the Adaptive Learning Engine: (1) a generative **BKT student simulator** (`scripts/simulate_students.py`) that emits a trajectory dataset for DKT training, and (2) an **evaluation harness** (`scripts/evaluate.py` + helpers) covering model AUC (§8.1), simulated A/B learning gains (§8.2), and component ablations (§8.4). Everything is `pytest`-tested. **This plan ships NO trained model and NO DKT** — it produces the data the DKT plan consumes and the metrics the report needs.

**Architecture:** A small, dependency-light Python package under `scripts/eval/` plus two CLI entry-point scripts. The simulator re-encodes the 13-skill knowledge graph from `src/engine/knowledgeGraph.js` in pure Python (`scripts/eval/knowledge_graph.py`) — it MUST stay in sync (flagged as an open question; a sync-check test guards the skill count). The A/B harness **reimplements** the JS decision logic (`decisionLayer.js`) in Python rather than calling Node — justified below — so the whole evaluation runs in one `python` process with no Node bridge. The simulator writes a columnar **Parquet** trajectory file (with a CSV fallback) whose schema is locked here for the separate DKT plan (`2026-05-22-dkt-pipeline.md`) to consume.

**Tech Stack:** Python 3.9 (existing `venv/` reports `3.9.6`; the system `python3` is 3.12 but the venv is what we use), `numpy` (RNG + arrays), `pandas` + `pyarrow` (trajectory I/O), `scikit-learn` (`roc_auc_score`, `brier_score_loss`), `pytest` (tests). All NEW — the venv currently has only `PyPDF2`. No TensorFlow/PyTorch in this plan (training lives in the DKT plan).

> **Python 3.9 compatibility (LOAD-BEARING):** the venv is **3.9.6**, NOT 3.12. Every module below begins with `from __future__ import annotations`, which makes builtin-generic annotations (`list[str]`, `dict[str, float]`) and PEP-604 unions (`dict | None`) legal *as annotations* on 3.9 (they are stored as strings, never evaluated). The DKT plan reads the same `.npz` on the same venv. The pinned wheels (numpy 1.26.4, pandas 2.2.2, pyarrow 16.1.0, scikit-learn 1.5.0) all publish cp39 wheels, so they install on 3.9.6. Do NOT use 3.10-only runtime constructs (e.g. `match`, `X | Y` in a non-annotation runtime position, `int | None` passed to `isinstance`).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — this plan implements §5.3 (synthetic learners / BKT simulator), §8.1 (model accuracy/AUC + ASSISTments-2009 hook), §8.2 (simulated A/B learning gains), and §8.4 (ablations). It does **not** implement §5.1–5.2/5.4 (DKT architecture/training/export) or §8.3 (on-device latency).

**Engine Core reference:** `docs/superpowers/plans/2026-05-22-adaptive-engine-core.md` — the JS engine (`src/engine/knowledgeGraph.js`, `decisionLayer.js`, BKT `masteryModel.js`) is ALREADY BUILT. This plan mirrors its graph and decision constants in Python.

**Explicitly OUT of scope for this plan** (each is a later plan or already built): the JS engine core (built); DKT model definition / Keras training / `tfjs` export (DKT plan); on-device performance benchmarking §8.3 (separate); any UI, backend, or `src/` changes.

---

## File Structure

| File | Responsibility |
|---|---|
| `requirements.txt` | Pinned Python deps for the eval/sim stack (new) |
| `scripts/__init__.py` | Marks `scripts` as a package so `scripts.eval` imports cleanly (new) |
| `scripts/eval/__init__.py` | Package marker for the eval helpers (new) |
| `scripts/eval/knowledge_graph.py` | Python re-encoding of the 13-skill graph + decision-layer constants/helpers (new) |
| `scripts/eval/bkt.py` | Pure-Python BKT belief math, mirrors `masteryModel.js` (new) |
| `scripts/eval/decision.py` | Python port of `decisionLayer.js` (difficulty, suggestNextSkill, SM-2) for the treatment arm (new) |
| `scripts/eval/simulator.py` | Core BKT generative simulator: latent abilities, prereq gate, policy walk, trajectory rows (new) |
| `scripts/eval/schema.py` | Column names, dtypes, and (skill,correct) one-hot encoding helpers — the locked trajectory contract (new) |
| `scripts/eval/metrics.py` | `next_correct_auc`, `per_skill_brier`, A/B post-test scoring, ablation runners (new) |
| `scripts/eval/io.py` | Parquet/CSV read/write of trajectory datasets (new) |
| `scripts/eval/sequences.py` | Long-format → padded DKT `.npz` builder (the locked `data/dkt_sequences.npz` contract) (new) |
| `scripts/build_dkt_sequences.py` | CLI: trajectory Parquet/CSV → `data/dkt_sequences.npz` for the DKT plan (new) |
| `tests/test_sequences.py` | `.npz` array names/shapes/dtypes, shift correctness, padding/mask, encoding round-trip (new) |
| `scripts/simulate_students.py` | CLI: generate N students × ~M interactions → trajectory file (new) |
| `scripts/evaluate.py` | CLI: run §8.1 AUC, §8.2 A/B, §8.4 ablations; print a metrics report (new) |
| `scripts/eval/baseline_predictor.py` | A reference next-correct predictor (BKT one-step) so §8.1 AUC is testable WITHOUT a trained DKT model (new) |
| `tests/__init__.py` | Test package marker (new) |
| `tests/test_knowledge_graph.py` | Graph sync, acyclicity, prereq helper (new) |
| `tests/test_simulator.py` | Distribution ranges, prereq constraint, output shape, determinism (new) |
| `tests/test_schema_io.py` | Round-trip Parquet/CSV, encoding correctness (new) |
| `tests/test_metrics.py` | AUC on a trivially separable toy set, Brier, A/B direction (new) |
| `tests/test_decision.py` | Python decision port matches JS semantics on golden cases (new) |
| `pytest.ini` | pytest config (testpaths, quiet) (new) |
| `docs/data/TRAJECTORY_SCHEMA.md` | The locked schema doc the DKT plan imports (new) |

**Trajectory data contract (LOCKED once this plan is reviewed — the DKT plan reads only this):**

One row per interaction, ordered by `(student_id, step_idx)`. Long format (not padded) — the DKT pipeline groups by `student_id` and pads to `MAX_SEQ_LEN=50` at training time.

| Column | Dtype | Meaning |
|---|---|---|
| `student_id` | `int32` | 0-based synthetic student index |
| `step_idx` | `int16` | 0-based interaction index within the student (chronological) |
| `skill_id` | `category`/`string` | one of the 13 skill ids (e.g. `addition`) |
| `skill_idx` | `int8` | index of `skill_id` into the canonical `SKILL_IDS` order (0..12) |
| `correct` | `int8` | 1 if the simulated answer was correct, else 0 |
| `difficulty` | `int8` | 0=easy, 1=medium, 2=hard (the bin the policy served) |
| `response_time_ms` | `int32` | simulated latency (lognormal; lower when mastered) |
| `latent_ability` | `float32` | ground-truth latent mastery of this skill at this step (P(known)); training MUST NOT use this as a feature — diagnostics/calibration only |
| `dkt_input_idx` | `int16` | one-hot index `skill_idx * 2 + correct` into a `2 * NUM_SKILLS = 26`-dim DKT input vector |

Sidecar `*.meta.json` records: `num_skills`, `skill_ids` (ordered), `num_students`, `seed`, `max_interactions`, `git_sha_of_knowledge_graph_js`, `schema_version`. The DKT plan asserts `num_skills == 13` and `dkt_input_idx == skill_idx*2 + correct` on load.

**Training-ready `data/dkt_sequences.npz` contract (LOCKED — the DKT plan loads THIS, do not let DKT re-derive its own encoding):**

This plan ALSO emits a padded, training-ready NumPy archive that the DKT pipeline's `load_dataset()` reads directly. Per-student sequences are sorted by `step_idx`, **truncated to the LAST `SEQ_LEN=50` interactions** (keep the most recent), and padded at the FRONT with zero-vectors. The standard DKT input/target SHIFT is baked in here so the DKT plan trains exactly as its `make_toy_dataset` fixture does: at timestep `t`, the input is the one-hot of the **previous** interaction and the target is the **current** interaction.

`np.savez_compressed("data/dkt_sequences.npz", ...)` writes EXACTLY these arrays (names are load-bearing — DKT's `load_dataset` does `d[k] for k in ("X","Y_skill","Y_correct","mask")`, plus reads `skill_ids`/`num_skills`):

| Array name | Shape | Dtype | Meaning |
|---|---|---|---|
| `X` | `(N, 50, 26)` | `float32` | dense one-hot of the **previous** interaction at each step; `X[i,0]` is all-zeros (no prior). One-hot index = `dkt_input_idx = skill_idx*2 + correct`. |
| `Y_skill` | `(N, 50, 13)` | `float32` | one-hot of the **current** step's skill index (the skill the next-correct prediction targets). |
| `Y_correct` | `(N, 50)` | `float32` | current step's correctness (0.0/1.0) — the next-step BCE label. |
| `mask` | `(N, 50)` | `float32` | 1.0 for real steps, 0.0 for front-padding. |
| `input_idx` | `(N, 50)` | `int16` | redundant index form of `X`: the `dkt_input_idx` of the previous interaction (-1 / 0-masked at padded steps; equals `argmax(X)` on real steps). Convenience for index-based encoders; `X` is canonical. |
| `target_skill_idx` | `(N, 50)` | `int16` | `argmax(Y_skill)` per real step (current skill index); 0 at padded steps (use `mask`). |
| `skill_ids` | `(13,)` | `<U16` (unicode str) | ordered skill ids echoed from the meta sidecar — the single source of skill ordering. |
| `num_skills` | scalar `()` | `int64` | `13`, echoed from meta. |
| `seq_len` | scalar `()` | `int64` | `50`. |

`N` = number of students. The DKT plan's `load_dataset` uses only `X, Y_skill, Y_correct, mask`; `input_idx`/`target_skill_idx`/`skill_ids`/`num_skills`/`seq_len` are extra metadata it MAY assert against (`num_skills == 13`, `skill_ids` order matches its graph). Padding is FRONT (left) so the last real interaction is always at `t=49` when a student has ≥50 steps; students with `<50` steps are padded on the left and masked.

---

### Task 1: Python environment + requirements

The venv currently has only `PyPDF2`. Add the sim/eval stack and make `scripts` importable as a package.

**Files:**
- Create: `requirements.txt`
- Create: `scripts/__init__.py`, `scripts/eval/__init__.py`, `tests/__init__.py`
- Create: `pytest.ini`
- Modify: `.gitignore` (ensure `venv/` and generated data are ignored)

- [ ] **Step 1: Confirm the starting state**

Run:
```bash
./venv/bin/python3 --version
./venv/bin/pip list
```
Expected: **Python 3.9.6** (the venv is 3.9, NOT the system 3.12); only `pip` (21.2.4), `PyPDF2` (3.0.1), `setuptools` (58.0.4), `typing_extensions` (4.15.0). (Confirms numpy/scipy/pandas/scikit-learn are NOT yet installed.) If `--version` instead reports 3.12, you are accidentally using the system interpreter — always invoke `./venv/bin/python3`, never bare `python3`.

- [ ] **Step 2: Write `requirements.txt`**

Create `requirements.txt`:
```text
# Synthetic data generator + evaluation harness (scripts/). Python 3.9 (venv is 3.9.6).
# All pins below ship cp39 wheels.
numpy==1.26.4
pandas==2.2.2
pyarrow==16.1.0
scikit-learn==1.5.0
pytest==8.2.2
```

> `pyarrow` provides the Parquet engine for pandas. `scipy` is intentionally NOT required — all distributions we need (`Beta`, `lognormal`) are in `numpy.random.Generator`. If a later step needs `scipy.special` it can be added then.

- [ ] **Step 3: Install into the existing venv**

Run:
```bash
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```
Expected: all five packages install. The venv ships **pip 21.2.4**, which is too old to reliably resolve modern manylinux/macos wheels — the `--upgrade pip` line is REQUIRED (target pip ≥ 23); record the resulting pip version in the commit message. On 3.9.6 the resolver must pick the cp39 wheels of every pin above. Verify:
```bash
./venv/bin/python3 -c "import numpy, pandas, pyarrow, sklearn; print(numpy.__version__, pandas.__version__, pyarrow.__version__, sklearn.__version__)"
```
Expected: prints four version strings, no ImportError.

- [ ] **Step 4: Create package markers**

Create `scripts/__init__.py`:
```python
```
Create `scripts/eval/__init__.py`:
```python
"""Synthetic-data + evaluation helpers for the Adaptive Learning Engine."""
```
Create `tests/__init__.py`:
```python
```

- [ ] **Step 5: Create `pytest.ini`**

Create `pytest.ini`:
```ini
[pytest]
testpaths = tests
addopts = -q
filterwarnings =
    ignore::DeprecationWarning
```

- [ ] **Step 6: Ensure generated artifacts and venv are ignored**

Read `.gitignore` first. If `venv/` is not present, append this block (do not duplicate lines that already exist):
```gitignore

# Python (synthetic data + evaluation harness)
venv/
__pycache__/
*.pyc
.pytest_cache/
data/synthetic/
*.parquet
*.npz
data/dkt_sequences.npz
```

- [ ] **Step 7: Smoke-test pytest discovery**

Run:
```bash
./venv/bin/python3 -m pytest --collect-only
```
Expected: "no tests ran" / 0 collected (no test files yet) and **exit code 5** (pytest's "no tests collected"), NOT an import error. This confirms config + package layout are valid.

- [ ] **Step 8: Commit**
```bash
git add requirements.txt pytest.ini scripts/__init__.py scripts/eval/__init__.py tests/__init__.py .gitignore
git commit -m "chore(eval): add python sim/eval deps and package scaffold"
```

---

### Task 2: Python knowledge graph (mirror of `knowledgeGraph.js`)

Re-encode the 13-skill graph + decision constants in Python. A test asserts the skill count and prereq edges match the JS source so drift is caught early.

**Files:**
- Create: `scripts/eval/knowledge_graph.py`
- Test: `tests/test_knowledge_graph.py`

> The JS graph at `src/engine/knowledgeGraph.js` is the source of truth. This is a manual transcription — there is no build-time codegen. The sync-check test parses the JS file's `PREREQS` block and compares; if the JS graph changes, this test fails and forces a re-transcription. Flagged as Open Question #1.

- [ ] **Step 1: Write the failing test**

Create `tests/test_knowledge_graph.py`:
```python
import re
from pathlib import Path

from scripts.eval import knowledge_graph as kg

JS_PATH = Path(__file__).resolve().parents[1] / "src" / "engine" / "knowledgeGraph.js"


def test_thirteen_skills_in_canonical_order():
    assert len(kg.SKILL_IDS) == 13
    assert kg.SKILL_IDS[0] == "counting"
    assert "algebra-basics" in kg.SKILL_IDS
    # canonical index lookup is consistent
    for i, sid in enumerate(kg.SKILL_IDS):
        assert kg.skill_index(sid) == i


def test_prereqs_only_reference_valid_skills():
    for sid in kg.SKILL_IDS:
        for p in kg.get_prereqs(sid):
            assert p in kg.SKILL_IDS


def test_graph_is_acyclic():
    order = kg.topological_order()
    assert len(order) == len(kg.SKILL_IDS)
    assert set(order) == set(kg.SKILL_IDS)


def test_prereqs_met_respects_cutoff():
    assert kg.are_prereqs_met("addition", {"counting": 0.8}, 0.75) is True
    assert kg.are_prereqs_met("addition", {"counting": 0.5}, 0.75) is False
    assert kg.are_prereqs_met("counting", {}, 0.75) is True  # no prereqs


def test_descendants_and_leverage():
    desc = kg.get_descendants("subtraction")
    assert "multiplication" in desc and "division" in desc
    assert "subtraction" not in desc
    assert kg.get_leverage("subtraction") > kg.get_leverage("patterns")
    assert kg.get_leverage("coord-geometry") == 0  # leaf


def test_python_graph_matches_js_source():
    """Guard against drift: parse PREREQS from knowledgeGraph.js and compare."""
    src = JS_PATH.read_text()
    block = re.search(r"const PREREQS = \{(.*?)\n\};", src, re.S).group(1)
    js_prereqs = {}
    for line in block.splitlines():
        m = re.match(r"\s*'([\w-]+)':\s*\[(.*?)\],", line)
        if not m:
            continue
        key = m.group(1)
        deps = re.findall(r"'([\w-]+)'", m.group(2))
        js_prereqs[key] = deps
    assert set(js_prereqs) == set(kg.SKILL_IDS)
    for sid in kg.SKILL_IDS:
        assert sorted(js_prereqs[sid]) == sorted(kg.get_prereqs(sid)), sid
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_knowledge_graph.py
```
Expected: FAIL (ModuleNotFoundError: scripts.eval.knowledge_graph). Run from repo root so `scripts` resolves.

- [ ] **Step 3: Write the implementation**

Create `scripts/eval/knowledge_graph.py`:
```python
"""Python re-encoding of src/engine/knowledgeGraph.js (the JS source is canonical).

13 skills, prerequisite DAG, plus the decision-layer constants the eval harness needs.
Kept manually in sync; tests/test_knowledge_graph.py guards against drift.
"""
from __future__ import annotations

# Ordered exactly as Object.keys(SKILLS) in knowledgeGraph.js — this order defines
# every skill_idx / one-hot index used in the trajectory dataset.
SKILL_IDS: list[str] = [
    "counting",
    "addition",
    "subtraction",
    "multiplication",
    "division",
    "patterns",
    "fractions-basic",
    "equiv-fractions",
    "decimals",
    "integers",
    "geometry-shapes",
    "coord-geometry",
    "algebra-basics",
]

NUM_SKILLS: int = len(SKILL_IDS)  # 13
DKT_INPUT_DIM: int = 2 * NUM_SKILLS  # 26 — see knowledgeGraph.js header note

# prereq -> skills that must be mastered first (transcribed from PREREQS in the JS).
PREREQS: dict[str, list[str]] = {
    "counting": [],
    "addition": ["counting"],
    "subtraction": ["addition"],
    "multiplication": ["subtraction"],
    "division": ["multiplication"],
    "patterns": ["addition", "subtraction"],
    "integers": ["multiplication"],
    "fractions-basic": ["division"],
    "equiv-fractions": ["fractions-basic"],
    "decimals": ["fractions-basic"],
    "coord-geometry": ["decimals"],
    "algebra-basics": ["patterns"],
    "geometry-shapes": ["algebra-basics"],
}

# Decision-layer constants mirrored from decisionLayer.js.
MASTERY_CUTOFF: float = 0.75   # "mastered" for unlock/prereq/breadth
PREREQ_LEARN_GATE: float = 0.5  # spec §5.3: cannot LEARN a skill until prereqs > 0.5

_SKILL_INDEX = {sid: i for i, sid in enumerate(SKILL_IDS)}


def skill_index(skill_id: str) -> int:
    return _SKILL_INDEX[skill_id]


def get_prereqs(skill_id: str) -> list[str]:
    return PREREQS.get(skill_id, [])


def are_prereqs_met(skill_id: str, mastery: dict[str, float], cutoff: float = MASTERY_CUTOFF) -> bool:
    return all(mastery.get(p, 0.0) >= cutoff for p in get_prereqs(skill_id))


def prereqs_learnable(skill_id: str, mastery: dict[str, float], gate: float = PREREQ_LEARN_GATE) -> bool:
    """spec §5.3 learn gate: a skill cannot be LEARNED until every prereq > `gate`."""
    return all(mastery.get(p, 0.0) > gate for p in get_prereqs(skill_id))


# children[skill] = skills that list `skill` as a prerequisite.
_CHILDREN: dict[str, list[str]] = {
    sid: [other for other in SKILL_IDS if sid in get_prereqs(other)] for sid in SKILL_IDS
}


def get_children(skill_id: str) -> list[str]:
    return _CHILDREN.get(skill_id, [])


def get_descendants(skill_id: str) -> list[str]:
    seen: set[str] = set()
    stack = list(_CHILDREN.get(skill_id, []))
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(_CHILDREN.get(cur, []))
    return sorted(seen)


def get_leverage(skill_id: str) -> int:
    return len(get_descendants(skill_id))


def topological_order() -> list[str]:
    """Kahn's algorithm — raises on a cycle."""
    indeg = {sid: len(get_prereqs(sid)) for sid in SKILL_IDS}
    queue = [sid for sid in SKILL_IDS if indeg[sid] == 0]
    order: list[str] = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for child in _CHILDREN[node]:
            indeg[child] -= 1
            if indeg[child] == 0:
                queue.append(child)
    if len(order) != len(SKILL_IDS):
        raise ValueError("knowledge_graph: prerequisite cycle detected")
    return order
```

- [ ] **Step 4: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_knowledge_graph.py
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**
```bash
git add scripts/eval/knowledge_graph.py tests/test_knowledge_graph.py
git commit -m "feat(eval): python knowledge graph mirror with JS sync-check"
```

---

### Task 3: BKT belief math (mirror of `masteryModel.js`)

A tiny, pure BKT module reused by both the simulator's policy and the §8.1 baseline predictor.

**Files:**
- Create: `scripts/eval/bkt.py`
- Test: extend `tests/test_metrics.py` later; for now a focused doctest-style test in `tests/test_decision.py` is added in Task 5. Add a minimal test inline here.
- Test: `tests/test_bkt.py`

> Same parameter names and update equation as `masteryModel.js`: posterior conditional on the observation, then apply the learn transition. Defaults are the JS defaults (`pL0=0.2, pT=0.15, pG=0.2, pS=0.1`).

- [ ] **Step 1: Write the failing test**

Create `tests/test_bkt.py`:
```python
from scripts.eval import bkt


def test_correct_raises_belief():
    p2 = bkt.update_belief(bkt.DEFAULT_PARAMS.pL0, True)
    assert p2 > bkt.DEFAULT_PARAMS.pL0
    assert abs(p2 - 0.600) < 0.01  # matches masteryModel.js test


def test_incorrect_lowers_belief():
    p2 = bkt.update_belief(bkt.DEFAULT_PARAMS.pL0, False)
    assert p2 < bkt.DEFAULT_PARAMS.pL0
    assert abs(p2 - 0.176) < 0.01


def test_belief_stays_in_unit_interval():
    p = bkt.DEFAULT_PARAMS.pL0
    for c in [True, True, True, False, True, False]:
        p = bkt.update_belief(p, c)
        assert 0.0 <= p <= 1.0


def test_prob_correct_uses_guess_and_slip():
    # not known -> roughly the guess rate; fully known -> roughly 1 - slip
    assert abs(bkt.prob_correct(0.0) - bkt.DEFAULT_PARAMS.pG) < 1e-9
    assert abs(bkt.prob_correct(1.0) - (1 - bkt.DEFAULT_PARAMS.pS)) < 1e-9
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_bkt.py
```
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write the implementation**

Create `scripts/eval/bkt.py`:
```python
"""Pure-Python Bayesian Knowledge Tracing — mirrors src/engine/masteryModel.js.

Used for (a) the simulator's belief-tracking policy and (b) the §8.1 baseline
next-correct predictor so AUC is computable without a trained DKT model.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BKTParams:
    pL0: float = 0.2  # prior P(knows skill)
    pT: float = 0.15  # P(learn) transition per opportunity
    pG: float = 0.2   # P(guess correct | not known)
    pS: float = 0.1   # P(slip incorrect | known)


DEFAULT_PARAMS = BKTParams()


def update_belief(pL: float, correct: bool, params: BKTParams = DEFAULT_PARAMS) -> float:
    """One BKT step: condition belief on the observation, then apply learn transition."""
    pG, pS, pT = params.pG, params.pS, params.pT
    if correct:
        denom = pL * (1 - pS) + (1 - pL) * pG
        posterior = (pL * (1 - pS)) / denom if denom > 0 else pL
    else:
        denom = pL * pS + (1 - pL) * (1 - pG)
        posterior = (pL * pS) / denom if denom > 0 else pL
    return posterior + (1 - posterior) * pT


def prob_correct(pL: float, params: BKTParams = DEFAULT_PARAMS) -> float:
    """P(correct) given belief P(known): mixture of slip (known) and guess (unknown)."""
    return pL * (1 - params.pS) + (1 - pL) * params.pG
```

- [ ] **Step 4: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_bkt.py
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add scripts/eval/bkt.py tests/test_bkt.py
git commit -m "feat(eval): pure-python BKT belief math mirroring masteryModel.js"
```

---

### Task 4: Trajectory schema + I/O

Lock the column contract and provide Parquet (with CSV fallback) read/write. This is what the DKT plan imports.

**Files:**
- Create: `scripts/eval/schema.py`
- Create: `scripts/eval/io.py`
- Test: `tests/test_schema_io.py`

> One-hot index convention: `dkt_input_idx = skill_idx * 2 + correct`, so `(skill 0, wrong)=0`, `(skill 0, right)=1`, … `(skill 12, right)=25`. This is the standard DKT input encoding and is asserted on load.

- [ ] **Step 1: Write the failing test**

Create `tests/test_schema_io.py`:
```python
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
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_schema_io.py
```
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write `schema.py`**

Create `scripts/eval/schema.py`:
```python
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
```

- [ ] **Step 4: Write `io.py`**

Create `scripts/eval/io.py`:
```python
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
```

> `schema.NUM_SKILLS` and `schema.SKILL_IDS` are re-exported via the import at the top of `schema.py`; reference them as `schema.NUM_SKILLS` (they live on the module because of the `from ... import` binding).

- [ ] **Step 5: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_schema_io.py
```
Expected: PASS (4 tests). If `assert_frame_equal` complains about category vs string, the `check_dtype=False` flag already covers it.

- [ ] **Step 6: Commit**
```bash
git add scripts/eval/schema.py scripts/eval/io.py tests/test_schema_io.py
git commit -m "feat(eval): lock trajectory schema + parquet/csv IO"
```

---

### Task 5: Python decision layer (port of `decisionLayer.js`)

The A/B treatment arm needs `nextDifficulty`, `suggestNextSkill`, and SM-2 in Python. Port them and golden-test against the JS semantics.

**Decision: reimplement in Python, not call Node.** Justification:
1. **Single process / no bridge.** The harness simulates 1,000–10,000 learners × 50+ steps, each step needing a decision. Shelling out to Node per step (or maintaining a long-lived Node subprocess + JSON IPC) adds latency and a fragile dependency on a Node toolchain inside a Python eval run.
2. **Determinism + testability.** A pure-Python port runs under the same `numpy` RNG and the same `pytest` run; reproducing a metric needs only `python`.
3. **The logic is tiny and stable.** `decisionLayer.js` is ~100 lines of pure functions already locked by the engine-core plan. Drift risk is mitigated by golden tests that encode the JS test cases verbatim (Task 7 of the engine-core plan). If the JS ever changes, these tests fail.

Trade-off accepted: two implementations to keep in sync. Mitigation: the golden test below mirrors the engine-core `decisionLayer.test.js` assertions exactly, and Open Question #2 proposes consolidating later via a shared JSON spec.

**Files:**
- Create: `scripts/eval/decision.py`
- Test: `tests/test_decision.py`

- [ ] **Step 1: Write the failing test (golden cases mirror decisionLayer.test.js)**

Create `tests/test_decision.py`:
```python
from scripts.eval import decision


def test_next_difficulty_bins():
    assert decision.next_difficulty("addition", {"addition": 0.2}) == "easy"
    assert decision.next_difficulty("addition", {"addition": 0.4}) == "medium"
    assert decision.next_difficulty("addition", {"addition": 0.75}) == "medium"
    assert decision.next_difficulty("addition", {"addition": 0.9}) == "hard"
    assert decision.next_difficulty("addition", {}) == "easy"


def test_suggest_next_skill_unlock_and_leverage():
    r = decision.suggest_next_skill({"counting": 0.8})
    assert r["skill_id"] == "addition"
    # counting+addition mastered -> subtraction beats patterns on leverage
    r2 = decision.suggest_next_skill({"counting": 0.8, "addition": 0.8})
    assert r2["skill_id"] == "subtraction"


def test_suggest_returns_none_when_all_mastered():
    from scripts.eval.knowledge_graph import SKILL_IDS
    allm = {sid: 0.99 for sid in SKILL_IDS}
    assert decision.suggest_next_skill(allm) is None


def test_sm2_grows_and_resets():
    DAY = 86_400_000
    r0 = decision.create_review(1_000_000)
    assert r0 == {"ease": 2.5, "interval": 1, "last_reviewed": 1_000_000, "reps": 0}
    r1 = decision.update_review(r0, True, 1_000_000)
    assert r1["interval"] == 3 and r1["ease"] == 2.5 and r1["reps"] == 1
    r2 = decision.update_review(r1, True, 1_000_000)
    assert r2["interval"] == 8
    lapsed = decision.update_review(
        {"ease": 2.5, "interval": 8, "last_reviewed": 0, "reps": 2}, False, 5
    )
    assert lapsed["interval"] == 1
    assert abs(lapsed["ease"] - 2.3) < 1e-9
    assert lapsed["reps"] == 0
    now = 10 * DAY
    assert decision.is_due({"ease": 2.5, "interval": 1, "last_reviewed": now - 2 * DAY, "reps": 0}, now)
    assert not decision.is_due({"ease": 2.5, "interval": 5, "last_reviewed": now - 2 * DAY, "reps": 0}, now)
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_decision.py
```
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write the implementation**

Create `scripts/eval/decision.py`:
```python
"""Python port of src/engine/decisionLayer.js for the A/B treatment arm.

Reimplemented (not bridged to Node) for a single-process, deterministic eval run.
Golden tests in tests/test_decision.py mirror decisionLayer.test.js verbatim.
"""
from __future__ import annotations

import math

from scripts.eval.knowledge_graph import (
    MASTERY_CUTOFF,
    SKILL_IDS,
    get_leverage,
    get_prereqs,
)

DAY_MS = 86_400_000


def next_difficulty(skill_id: str, mastery: dict[str, float]) -> str:
    """§6.1 ZPD bins. Boundary 0.75 -> medium (matches decisionLayer.js)."""
    m = mastery.get(skill_id, 0.0)
    if m < 0.4:
        return "easy"
    if m <= 0.75:
        return "medium"
    return "hard"


def suggest_next_skill(mastery: dict[str, float], last_practiced: dict[str, float] | None = None,
                       now: float = 0.0):
    """§6.2 highest-leverage unlocked, unmastered skill; tie-break to not-recent."""
    last_practiced = last_practiced or {}
    candidates = [
        sid for sid in SKILL_IDS
        if mastery.get(sid, 0.0) < MASTERY_CUTOFF
        and all(mastery.get(p, 0.0) >= MASTERY_CUTOFF for p in get_prereqs(sid))
    ]
    if not candidates:
        return None

    def sort_key(sid: str):
        recent = 1 if (now - last_practiced.get(sid, 0.0)) < DAY_MS else 0
        # higher leverage first (negate), then not-recent first
        return (-get_leverage(sid), recent)

    candidates.sort(key=sort_key)
    return {"skill_id": candidates[0]}


def create_review(now: float = 0.0) -> dict:
    return {"ease": 2.5, "interval": 1, "last_reviewed": now, "reps": 0}


def update_review(prev: dict, correct: bool, now: float = 0.0) -> dict:
    if correct:
        return {
            "ease": min(2.5, prev["ease"] + 0.1),
            # JS Math.round is half-UP; Python round() is banker's rounding
            # (round(2.5)==2). The SM-2 golden values (1*2.5 -> 3, 3*2.5 -> 8)
            # require half-up, so use floor(x + 0.5). Do NOT use bare round().
            "interval": math.floor(prev["interval"] * prev["ease"] + 0.5),
            "last_reviewed": now,
            "reps": prev["reps"] + 1,
        }
    return {
        "ease": max(1.3, prev["ease"] - 0.2),
        "interval": 1,
        "last_reviewed": now,
        "reps": 0,
    }


def is_due(review: dict, now: float = 0.0) -> bool:
    return now > review["last_reviewed"] + review["interval"] * DAY_MS


def due_for_review(review_map: dict[str, dict], now: float = 0.0) -> list[str]:
    return [sid for sid, r in review_map.items() if is_due(r, now)]
```

> **SM-2 rounding (already correct above).** Python's `round()` uses banker's rounding (`round(2.5)==2`) while JS `Math.round` rounds half-up (`Math.round(2.5)==3`). The golden values that actually occur (`1*2.5 -> 3`, `3*2.5 -> 8`) require half-up, so the implementation uses `math.floor(prev["interval"] * prev["ease"] + 0.5)` — NOT bare `round()`. The `interval == 3` test proves it.

- [ ] **Step 4: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_decision.py
```
Expected: PASS (4 tests), including `interval == 3` and `interval == 8`.

- [ ] **Step 5: Commit**
```bash
git add scripts/eval/decision.py tests/test_decision.py
git commit -m "feat(eval): python port of decision layer (difficulty/suggest/SM-2)"
```

---

### Task 6: BKT generative simulator (core)

The heart of §5.3: per-student latent abilities, prereq learn-gate, policy walk, trajectory rows.

**Files:**
- Create: `scripts/eval/simulator.py`
- Test: `tests/test_simulator.py`

> Per spec §5.3, each student samples per-skill `guess ~ Beta(2,8)`, `slip ~ Beta(2,8)`, `learn_rate ~ Beta(2,5)`, and a latent initial ability per skill. Mastery rises via BKT-style learning **only when prereqs are learnable** (`prereqs > 0.5`). The policy picks the next skill weighted toward the student's mid-mastery skills (ZPD-ish), serves a difficulty bin from current latent ability, and draws correctness from `P(correct) = ability*(1-slip) + (1-ability)*guess`, modulated by difficulty.

- [ ] **Step 1: Write the failing test**

Create `tests/test_simulator.py`:
```python
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
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_simulator.py
```
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write the implementation**

Create `scripts/eval/simulator.py`:
```python
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
```

- [ ] **Step 4: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_simulator.py
```
Expected: PASS (5 tests). `test_prereq_learn_gate_respected` is now deterministic-safe: gated skills are seeded strictly below the gate (`sample_student_params`), and the test only asserts the gate while the prereq's recorded value is more than `EPS=0.05` below the gate (covering the one-step PRE→POST lookahead at the boundary). It must not be flaky across seeds; if it is, that signals a real gate-logic regression, not test noise.

- [ ] **Step 5: Commit**
```bash
git add scripts/eval/simulator.py tests/test_simulator.py
git commit -m "feat(eval): BKT generative student simulator with prereq learn-gate"
```

---

### Task 7: `simulate_students.py` CLI

Wrap the simulator in a CLI that writes the trajectory file + meta sidecar.

**Files:**
- Create: `scripts/simulate_students.py`

> Default run: 10,000 students × 80 interactions → `data/synthetic/trajectories.parquet`. This is the spec §5.3 target volume (~800k rows). Smaller runs via flags for quick iteration.

- [ ] **Step 1: Write the CLI**

Create `scripts/simulate_students.py`:
```python
#!/usr/bin/env python3
"""Generate synthetic BKT student trajectories for DKT training (spec §5.3).

Examples:
  ./venv/bin/python3 -m scripts.simulate_students                       # 10k students
  ./venv/bin/python3 -m scripts.simulate_students -n 1000 -m 60 -o data/synthetic/small.parquet
"""
from __future__ import annotations

import argparse
import subprocess
import time
from pathlib import Path

from scripts.eval import io as traj_io
from scripts.eval.simulator import simulate_dataset


def _git_sha_of_kg() -> str:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%H", "--", "src/engine/knowledgeGraph.js"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate synthetic student trajectories.")
    ap.add_argument("-n", "--num-students", type=int, default=10_000)
    ap.add_argument("-m", "--max-interactions", type=int, default=80)
    ap.add_argument("-s", "--seed", type=int, default=2026)
    ap.add_argument("-o", "--out", type=str, default="data/synthetic/trajectories.parquet")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    df = simulate_dataset(
        num_students=args.num_students,
        max_interactions=args.max_interactions,
        seed=args.seed,
    )
    elapsed = time.time() - t0

    meta = {
        "num_students": args.num_students,
        "max_interactions": args.max_interactions,
        "seed": args.seed,
        "num_rows": int(len(df)),
        "git_sha_of_knowledge_graph_js": _git_sha_of_kg(),
        "generated_in_seconds": round(elapsed, 1),
    }
    traj_io.write_trajectories(df, out, meta=meta)

    print(f"Wrote {len(df):,} rows for {args.num_students:,} students to {out}")
    print(f"Mean interactions/student: {len(df) / args.num_students:.1f}")
    print(f"Overall accuracy: {df['correct'].mean():.3f}")
    print(f"Elapsed: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test a small run**
```bash
./venv/bin/python3 -m scripts.simulate_students -n 50 -m 30 -o data/synthetic/_smoke.parquet
```
Expected: prints row count (~1500), mean interactions, accuracy in (0,1); creates `data/synthetic/_smoke.parquet` + `.meta.json`. Then verify load:
```bash
./venv/bin/python3 -c "from scripts.eval import io; df,m=io.read_trajectories('data/synthetic/_smoke.parquet'); print(df.shape, m['num_skills'])"
```
Expected: prints `(<rows>, 9) 13`. Clean up: `rm data/synthetic/_smoke.parquet data/synthetic/_smoke.meta.json`.

- [ ] **Step 3: (Optional) full-scale timing check**

Only if iterating on performance: `./venv/bin/python3 -m scripts.simulate_students -n 10000 -m 80 -o data/synthetic/trajectories.parquet`. Expected: completes in well under a few minutes on a laptop (pure-Python loop over ~800k steps). If too slow, that is a perf follow-up — note it; correctness is what this plan locks.

- [ ] **Step 4: Commit**
```bash
git add scripts/simulate_students.py
git commit -m "feat(eval): simulate_students CLI -> parquet trajectories + meta"
```

---

### Task 8: Metrics — AUC, Brier, baseline predictor (§8.1)

Provide `next_correct_auc` + `per_skill_brier` and a BKT one-step baseline predictor so §8.1 is testable WITHOUT a trained DKT model. The DKT plan will plug its model's predictions into the same `next_correct_auc`.

**Files:**
- Create: `scripts/eval/baseline_predictor.py`
- Create: `scripts/eval/metrics.py`
- Test: `tests/test_metrics.py`

> `next_correct_auc(y_true, y_prob)` is a thin wrapper over `sklearn.roc_auc_score` with guards (needs both classes present). The baseline predictor replays BKT per student to produce a `P(correct)` for each step's actual outcome — exactly the quantity DKT predicts — giving a real, non-trivial AUC on synthetic data.

- [ ] **Step 1: Write the failing test**

Create `tests/test_metrics.py`:
```python
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
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_metrics.py
```
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write `baseline_predictor.py`**

Create `scripts/eval/baseline_predictor.py`:
```python
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
```

> Alignment is by ORIGINAL positional order: `preds[i]` corresponds to `df.iloc[i]`. This requires `df.index` to be unique (it is — `simulate_dataset`/`build_frame` produce a default RangeIndex, and `train_test_split_by_student` `.copy()`s a boolean slice that keeps unique labels). If a caller resets the index, alignment still holds because we map by label.

- [ ] **Step 4: Write `metrics.py`**

Create `scripts/eval/metrics.py`:
```python
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
```

- [ ] **Step 5: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_metrics.py
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**
```bash
git add scripts/eval/baseline_predictor.py scripts/eval/metrics.py tests/test_metrics.py
git commit -m "feat(eval): AUC/Brier metrics + BKT baseline next-correct predictor"
```

---

### Task 9: Simulated A/B + ablations (§8.2, §8.4)

Run learners through control (fixed difficulty) vs treatment (adaptive: ZPD difficulty + suggestNextSkill + SM-2), score a post-test, and run the two ablations.

**Files:**
- Modify: `scripts/eval/metrics.py` (append A/B + ablation runners)
- Test: extend `tests/test_metrics.py`

> Each arm reuses the same student-param sampler from the simulator, so control/treatment differ ONLY in the policy (which skill + difficulty) — a clean causal comparison. **Control:** random next-skill, fixed `medium` difficulty. **Treatment:** `suggest_next_skill` for skill choice, `next_difficulty` for the bin, plus SM-2 reviews interleaved when due. **Post-test:** after 50 problems, present one fixed-difficulty problem per skill and score mean P(correct) under the student's final latent ability. Ablation 1 = treatment minus the graph (random skill). Ablation 2 = treatment minus SM-2 (no review interleaving).

- [ ] **Step 1: Add the failing test**

Append to `tests/test_metrics.py`:
```python
from scripts.eval.metrics import run_ab_experiment, run_ablations


def test_ab_treatment_improves_post_test():
    res = run_ab_experiment(num_learners=300, num_problems=50, seed=11)
    assert 0.0 <= res["control_score"] <= 1.0
    assert 0.0 <= res["treatment_score"] <= 1.0
    # adaptive arm should help (spec §8.2 expects 25-40%; require a positive lift here)
    assert res["treatment_score"] > res["control_score"]
    assert res["relative_improvement"] > 0.0


def test_ablations_hurt_relative_to_full_treatment():
    res = run_ablations(num_learners=300, num_problems=50, seed=13)
    full = res["full_treatment_score"]
    assert res["no_knowledge_graph_score"] <= full + 1e-6
    assert res["no_spaced_repetition_score"] <= full + 1e-6
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_metrics.py -k "ab or ablation"
```
Expected: FAIL (run_ab_experiment / run_ablations undefined).

- [ ] **Step 3: Append the implementation to `metrics.py`**

Append to `scripts/eval/metrics.py`:
```python
# ─── Simulated A/B (spec §8.2) + ablations (spec §8.4) ───────────────────────────

from scripts.eval import bkt, decision  # noqa: E402
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
FORGET_PER_DAY = 0.01  # absolute ability lost per idle day per skill


def _run_arm(params, num_problems: int, rng, *, adaptive: bool, use_graph: bool,
             use_sm2: bool) -> float:
    ability = params.init_ability.copy()
    review: dict[str, dict] = {}
    now = 0.0
    DAY = decision.DAY_MS
    for _ in range(num_problems):
        now += DAY  # one problem per simulated day
        mastery = _ability_map(ability)

        # spaced-repetition interleave (treatment + use_sm2 only)
        due = decision.due_for_review(review, now) if (adaptive and use_sm2) else []
        if due:
            sid = due[0]
        elif adaptive and use_graph:
            rec = decision.suggest_next_skill(mastery, now=now)
            sid = rec["skill_id"] if rec else SKILL_IDS[int(rng.integers(NUM_SKILLS))]
        else:
            # control or no-graph ablation: random skill among learnable, else any
            learnable = [s for s in range(NUM_SKILLS) if _learnable(ability, s)]
            pool = learnable or list(range(NUM_SKILLS))
            sid = SKILL_IDS[int(rng.choice(pool))]

        k = skill_index(sid)
        if adaptive:
            difficulty = _DIFF_TO_INT[decision.next_difficulty(sid, mastery)]
        else:
            difficulty = 1  # control = fixed medium

        correct = _attempt(ability, params, k, difficulty, rng)

        # forgetting: every OTHER skill loses a little ground this day.
        for j in range(NUM_SKILLS):
            if j != k:
                ability[j] = float(np.clip(ability[j] - FORGET_PER_DAY, 0.0, 1.0))

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
```

> Note: `_run_arm` uses each arm's own child RNG so control/treatment share the SAME latent student params but draw independent coin flips. That isolates the policy effect while keeping the comparison paired by student ability.

- [ ] **Step 4: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_metrics.py
```
Expected: PASS (all metrics tests, including A/B and ablations). Two correctness notes:
- **A/B direction (`treatment > control`).** If marginal at n=300, the effect is real but noisy; do NOT weaken the assertion — confirm with a one-off larger run (`run_ab_experiment(num_learners=2000)`) and, if needed, raise the test's `num_learners` to 500. Document the chosen n in the commit.
- **SR ablation (`no_spaced_repetition_score <= full_treatment_score`).** This holds ONLY because `_run_arm` models forgetting (`FORGET_PER_DAY`): SR's job is to counteract decay on mastered skills. If you ever remove forgetting, this ablation will INVERT (a freed problem slot makes no-SR look better). Keep the forgetting term; it is load-bearing for §8.4. If the ablation is marginal, raise `num_learners` rather than weakening the inequality.

- [ ] **Step 5: Commit**
```bash
git add scripts/eval/metrics.py tests/test_metrics.py
git commit -m "feat(eval): simulated A/B learning gains + KG/SR ablations"
```

---

### Task 10: `evaluate.py` CLI + ASSISTments-2009 hook

Single entry point that prints the §8.1 / §8.2 / §8.4 report. Document the ASSISTments hook without assuming the file is present.

**Files:**
- Create: `scripts/evaluate.py`

> §8.1 runs on a held-out 20% of synthetic students using the BKT baseline predictor (the DKT plan swaps in its model). The ASSISTments-2009 path is a documented stub: if `--assistments PATH` is given and the file exists, run the same `next_correct_auc`; otherwise print download instructions and skip. We do NOT bundle the dataset (licensing + size).

- [ ] **Step 1: Write the CLI**

Create `scripts/evaluate.py`:
```python
#!/usr/bin/env python3
"""Evaluation harness for the Adaptive Learning Engine (spec §8.1, §8.2, §8.4).

Examples:
  ./venv/bin/python3 -m scripts.evaluate                                   # all sections, synthetic
  ./venv/bin/python3 -m scripts.evaluate --traj data/synthetic/trajectories.parquet
  ./venv/bin/python3 -m scripts.evaluate --assistments data/assistments_2009.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from scripts.eval import io as traj_io
from scripts.eval import metrics
from scripts.eval.baseline_predictor import bkt_next_correct_predictions
from scripts.eval.simulator import simulate_dataset

ASSISTMENTS_HELP = """
ASSISTments-2009 not provided. To run the external sanity check (spec §8.1):
  1. Request/download "skill_builder_data09-10" from the ASSISTments dataset page
     (https://sites.google.com/site/assistmentsdata/home). It is gated; cite Feng
     et al. 2009 in the report.
  2. Reduce to columns: user_id, skill_id (or skill_name), correct, order_id.
  3. Save as CSV and pass --assistments PATH. The harness maps user_id->student_id,
     skill_name->skill_id, order_id->step ordering, then reuses the BKT baseline +
     next_correct_auc. Expected AUC >= 0.80 (Piech et al. 2015).
"""


def _section_81_synthetic(df: pd.DataFrame) -> None:
    print("\n=== §8.1 Model accuracy (synthetic, held-out 20% of students) ===")
    train, test = metrics.train_test_split_by_student(df, test_frac=0.2)
    preds = bkt_next_correct_predictions(test)
    auc = metrics.next_correct_auc(test["correct"].to_numpy(), preds)
    print(f"Held-out students: {test['student_id'].nunique()}  rows: {len(test):,}")
    print(f"BKT-baseline next-correct AUC: {auc:.4f}   (target >= 0.85 for DKT)")
    brier = metrics.brier(test["correct"].to_numpy(), preds)
    print(f"Overall Brier: {brier:.4f}   (target < 0.20)")
    per_skill = metrics.per_skill_brier(test, preds)
    worst = sorted(per_skill.items(), key=lambda kv: -kv[1])[:3]
    print("Worst-calibrated skills (Brier):", ", ".join(f"{s}={b:.3f}" for s, b in worst))


def _section_81_assistments(path: Path) -> None:
    print("\n=== §8.1 External sanity check (ASSISTments-2009) ===")
    if not path.exists():
        print(ASSISTMENTS_HELP)
        return
    raw = pd.read_csv(path)
    df = pd.DataFrame({
        "student_id": raw["user_id"].astype("category").cat.codes.astype("int32"),
        "skill_id": raw.get("skill_name", raw.get("skill_id")).astype("string"),
        "correct": raw["correct"].astype("int8"),
        "step_idx": raw.groupby("user_id").cumcount().astype("int16"),
    })
    # NOTE: real ASSISTments skills won't match our 13-skill graph; the baseline
    # predictor here is a per-skill BKT keyed by the dataset's own skills.
    df = df.sort_values(["student_id", "step_idx"])
    preds = _assistments_bkt(df)
    auc = metrics.next_correct_auc(df["correct"].to_numpy(), preds)
    print(f"ASSISTments rows: {len(df):,}  skills: {df['skill_id'].nunique()}")
    print(f"BKT-baseline AUC: {auc:.4f}   (target >= 0.80)")


def _assistments_bkt(df: pd.DataFrame) -> np.ndarray:
    """Per-skill BKT keyed by the dataset's own skill labels (graph-agnostic)."""
    from scripts.eval import bkt
    preds = np.empty(len(df), dtype=float)
    pos = 0
    for _, g in df.groupby("student_id", sort=False):
        belief: dict[str, float] = {}
        for _, row in g.iterrows():
            s = row["skill_id"]
            pL = belief.get(s, bkt.DEFAULT_PARAMS.pL0)
            preds[pos] = bkt.prob_correct(pL)
            belief[s] = bkt.update_belief(pL, bool(row["correct"]))
            pos += 1
    return preds


def _section_82(num_learners: int, seed: int) -> None:
    print("\n=== §8.2 Simulated A/B learning gains ===")
    res = metrics.run_ab_experiment(num_learners=num_learners, num_problems=50, seed=seed)
    print(f"Learners/arm: {res['num_learners']}  problems: {res['num_problems']}")
    print(f"Control post-test:   {res['control_score']:.4f}")
    print(f"Treatment post-test: {res['treatment_score']:.4f}")
    print(f"Relative improvement: {res['relative_improvement'] * 100:.1f}%   (spec target 25-40%)")


def _section_84(num_learners: int, seed: int) -> None:
    print("\n=== §8.4 Component ablations ===")
    res = metrics.run_ablations(num_learners=num_learners, num_problems=50, seed=seed)
    full = res["full_treatment_score"]
    print(f"Full treatment:        {full:.4f}")
    print(f"-- no knowledge graph: {res['no_knowledge_graph_score']:.4f}  "
          f"(Δ {res['no_knowledge_graph_score'] - full:+.4f})")
    print(f"-- no spaced repetition:{res['no_spaced_repetition_score']:.4f}  "
          f"(Δ {res['no_spaced_repetition_score'] - full:+.4f})")


def main() -> None:
    ap = argparse.ArgumentParser(description="Adaptive Learning Engine evaluation harness.")
    ap.add_argument("--traj", type=str, default=None,
                    help="Trajectory parquet/csv for §8.1; if omitted, simulate on the fly.")
    ap.add_argument("--assistments", type=str, default=None,
                    help="Path to a reduced ASSISTments-2009 CSV (external check).")
    ap.add_argument("--ab-learners", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--skip", nargs="*", default=[], choices=["81", "82", "84"],
                    help="Sections to skip.")
    args = ap.parse_args()

    if "81" not in args.skip:
        if args.traj:
            df, _ = traj_io.read_trajectories(args.traj)
        else:
            print("No --traj given; simulating 2000 students for §8.1 ...")
            df = simulate_dataset(num_students=2000, max_interactions=80, seed=args.seed)
        _section_81_synthetic(df)
        if args.assistments:
            _section_81_assistments(Path(args.assistments))
        else:
            _section_81_assistments(Path("__missing__"))  # prints help

    if "82" not in args.skip:
        _section_82(args.ab_learners, args.seed)
    if "84" not in args.skip:
        _section_84(args.ab_learners, args.seed)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test the harness end to end**
```bash
./venv/bin/python3 -m scripts.evaluate --ab-learners 200 --skip
```
Expected: prints §8.1 (AUC + Brier on a freshly simulated 2000-student set), the ASSISTments help block (no dataset present), §8.2 (control < treatment, positive % improvement), §8.4 (both ablations ≤ full treatment). No exceptions.

- [ ] **Step 3: Commit**
```bash
git add scripts/evaluate.py
git commit -m "feat(eval): evaluate.py harness (AUC, A/B, ablations, ASSISTments hook)"
```

---

### Task 11: Training-ready `dkt_sequences.npz` builder (the DKT plan consumes THIS)

Convert the long-format trajectory frame into the padded, training-ready `.npz` the DKT pipeline loads directly. The encoding/shift/padding is locked HERE so the DKT plan never re-derives it. A hardening test parses `SKILL_IDS`/`PREREQS` out of `knowledgeGraph.js` and asserts the Python re-encoding matches (JS↔Python drift guard).

**Files:**
- Create: `scripts/eval/sequences.py`
- Create: `scripts/build_dkt_sequences.py`
- Test: `tests/test_sequences.py`

> The `.npz` array names/shapes/dtypes are the LOCKED contract in the data-contract section above. `X` carries the one-hot of the **previous** interaction (shift), `Y_skill`/`Y_correct` carry the **current** step (the next-correct target), `mask` zeros padded steps. Padding is at the FRONT (left), truncation keeps the LAST 50 interactions. This matches the DKT plan's `make_toy_dataset` semantics exactly so real and toy data train identically.

- [ ] **Step 1: Write the failing test**

Create `tests/test_sequences.py`:
```python
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
```

- [ ] **Step 2: Run to verify it fails**
```bash
./venv/bin/python3 -m pytest tests/test_sequences.py
```
Expected: FAIL (ModuleNotFoundError: scripts.eval.sequences).

- [ ] **Step 3: Write `sequences.py`**

Create `scripts/eval/sequences.py`:
```python
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
```

- [ ] **Step 4: Write the CLI `build_dkt_sequences.py`**

Create `scripts/build_dkt_sequences.py`:
```python
#!/usr/bin/env python3
"""Build the training-ready DKT .npz from a long-format trajectory file.

Examples:
  ./venv/bin/python3 -m scripts.build_dkt_sequences \
      --traj data/synthetic/trajectories.parquet -o data/dkt_sequences.npz
"""
from __future__ import annotations

import argparse
from pathlib import Path

from scripts.eval import io as traj_io
from scripts.eval import schema
from scripts.eval.sequences import build_sequences, write_npz


def main() -> None:
    ap = argparse.ArgumentParser(description="Long-format trajectories -> DKT .npz")
    ap.add_argument("--traj", type=str, default="data/synthetic/trajectories.parquet")
    ap.add_argument("-o", "--out", type=str, default="data/dkt_sequences.npz")
    ap.add_argument("--seq-len", type=int, default=schema.MAX_SEQ_LEN)
    args = ap.parse_args()

    df, meta = traj_io.read_trajectories(args.traj)
    # echo skill ordering from the sidecar so npz and meta agree
    if meta.get("skill_ids") and list(meta["skill_ids"]) != schema.SKILL_IDS:
        raise SystemExit("meta skill_ids disagree with knowledge_graph.SKILL_IDS — drift!")
    seqs = build_sequences(df, seq_len=args.seq_len)
    write_npz(seqs, Path(args.out))
    n = seqs["X"].shape[0]
    print(f"Wrote {args.out}: X{seqs['X'].shape} Y_skill{seqs['Y_skill'].shape} "
          f"for {n} students, seq_len={args.seq_len}, num_skills={int(seqs['num_skills'])}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run to verify it passes**
```bash
./venv/bin/python3 -m pytest tests/test_sequences.py
```
Expected: PASS (5 tests), including the JS↔Python drift guard.

- [ ] **Step 6: Smoke-test the CLI end to end**
```bash
./venv/bin/python3 -m scripts.simulate_students -n 50 -m 60 -o data/synthetic/_smoke.parquet
./venv/bin/python3 -m scripts.build_dkt_sequences --traj data/synthetic/_smoke.parquet -o data/_smoke_seq.npz
./venv/bin/python3 -c "import numpy as np; d=np.load('data/_smoke_seq.npz'); print({k:d[k].shape for k in ('X','Y_skill','Y_correct','mask')}, int(d['num_skills']))"
```
Expected: prints `{'X': (50, 50, 26), 'Y_skill': (50, 50, 13), 'Y_correct': (50, 50), 'mask': (50, 50)} 13`. Clean up the `_smoke*` files afterward.

- [ ] **Step 7: Commit**
```bash
git add scripts/eval/sequences.py scripts/build_dkt_sequences.py tests/test_sequences.py
git commit -m "feat(eval): training-ready dkt_sequences.npz builder + JS sync guard"
```

---

### Task 12: Schema doc + full verification

Write the prose schema doc the DKT plan imports, then run the whole suite.

**Files:**
- Create: `docs/data/TRAJECTORY_SCHEMA.md`

- [ ] **Step 1: Write the schema doc**

Create `docs/data/TRAJECTORY_SCHEMA.md`:
```markdown
# Synthetic Trajectory Dataset — Schema (v1)

Produced by `scripts/simulate_students.py`. Consumed by the DKT pipeline
(`docs/superpowers/plans/2026-05-22-dkt-pipeline.md`). This contract is LOCKED;
bump `schema_version` in `scripts/eval/schema.py` for any breaking change.

## Files
- `<name>.parquet` (or `.csv`) — the trajectory rows.
- `<name>.meta.json` — sidecar with `schema_version`, `num_skills` (13),
  `skill_ids` (ordered), `num_students`, `seed`, `max_interactions`,
  `git_sha_of_knowledge_graph_js`.

## Row format (long; one row per interaction)
Sorted by `(student_id, step_idx)`.

| Column | Dtype | Meaning |
|---|---|---|
| `student_id` | int32 | 0-based synthetic student |
| `step_idx` | int16 | 0-based chronological index within the student |
| `skill_id` | string | one of the 13 skill ids |
| `skill_idx` | int8 | index into canonical `SKILL_IDS` (0..12) |
| `correct` | int8 | 1 correct / 0 incorrect |
| `difficulty` | int8 | 0 easy / 1 medium / 2 hard (served bin) |
| `response_time_ms` | int32 | simulated latency (lognormal) |
| `latent_ability` | float32 | ground-truth P(known) BEFORE this step — diagnostics only, NOT a training feature |
| `dkt_input_idx` | int16 | `skill_idx * 2 + correct` (one-hot index into a 26-dim DKT input) |

## DKT consumption recipe (long format — informational)
1. Load, group by `student_id`, sort by `step_idx`.
2. Input at step t = one-hot(`dkt_input_idx[t]`) in R^26 (`2 * num_skills`).
3. Target at step t = `correct[t+1]` for the skill at t+1 (next-correct).
4. Pad/truncate each student to `MAX_SEQ_LEN = 50`; mask padded steps in the loss.
5. NEVER feed `latent_ability` to the model (it is the oracle label for calibration only).

## Training-ready `data/dkt_sequences.npz` (what the DKT plan actually loads)
The long format above is the canonical interchange, but the DKT plan does NOT
re-derive its own padding/encoding. `scripts/build_dkt_sequences.py` emits a
padded NumPy archive with the input/target SHIFT and FRONT-padding baked in.
`scripts/train_dkt.py:load_dataset()` reads exactly `X, Y_skill, Y_correct, mask`.

| Array | Shape | Dtype | Meaning |
|---|---|---|---|
| `X` | `(N, 50, 26)` | float32 | one-hot of the **previous** interaction (`X[:,0]` all-zeros) |
| `Y_skill` | `(N, 50, 13)` | float32 | one-hot of the **current** step's skill (the prediction target's skill) |
| `Y_correct` | `(N, 50)` | float32 | current step's correctness (next-step BCE label) |
| `mask` | `(N, 50)` | float32 | 1.0 real / 0.0 front-padding |
| `input_idx` | `(N, 50)` | int16 | index form of `X` (`dkt_input_idx` of prev step; -1 at pad) |
| `target_skill_idx` | `(N, 50)` | int16 | `argmax(Y_skill)` per real step |
| `skill_ids` | `(13,)` | `<U16` | ordered skill ids (single source of ordering) |
| `num_skills` | `()` | int64 | 13 |
| `seq_len` | `()` | int64 | 50 |

One-hot index convention (LOCKED, identical in Python encoder, JS encoder, tests):
`dkt_input_idx = skill_idx * 2 + correct`. Padding is at the FRONT; truncation
keeps the LAST 50 interactions. The DKT plan MAY assert `num_skills == 13` and
`skill_ids` order against its own graph.

## Held-out split
Split by STUDENT (not row): see `metrics.train_test_split_by_student(df, 0.2)`.
```

- [ ] **Step 2: Run the full test suite**
```bash
./venv/bin/python3 -m pytest
```
Expected: PASS — all of `test_knowledge_graph`, `test_bkt`, `test_schema_io`, `test_decision`, `test_simulator`, `test_metrics`, `test_sequences` green, 0 failures.

- [ ] **Step 3: Lint-style sanity (import all modules)**
```bash
./venv/bin/python3 -c "import scripts.eval.knowledge_graph, scripts.eval.bkt, scripts.eval.decision, scripts.eval.schema, scripts.eval.io, scripts.eval.simulator, scripts.eval.sequences, scripts.eval.metrics, scripts.eval.baseline_predictor; import scripts.simulate_students, scripts.build_dkt_sequences, scripts.evaluate; print('all imports OK')"
```
Expected: `all imports OK` (catches syntax/import errors the test discovery might mask).

- [ ] **Step 4: Commit**
```bash
git add docs/data/TRAJECTORY_SCHEMA.md
git commit -m "docs(eval): lock trajectory schema doc for the DKT plan"
```

---

## Self-Review

**1. Spec coverage (Synthetic Data + Evaluation slice):**
- §5.3 BKT simulator (latent ability; guess/slip ~Beta(2,8); learn ~Beta(2,5); prereq learn-gate >0.5; 10k×~80; policy walk; trajectory output) → Tasks 6, 7. ✅
- §8.1 AUC on held-out 20% of synthetic students; Brier calibration; ASSISTments-2009 hook (documented, not assumed present) → Tasks 8, 10. ✅
- Training-ready `data/dkt_sequences.npz` (padded, shifted, front-padded; `X/Y_skill/Y_correct/mask/input_idx/target_skill_idx/skill_ids/num_skills/seq_len`) emitted for the DKT plan to load directly — DKT does NOT re-derive the encoding → Task 11. ✅
- §8.2 simulated A/B (control fixed-difficulty vs treatment adaptive: ZPD difficulty + suggestNextSkill + SM-2; post-test after 50; relative improvement) → Task 9. ✅
- §8.4 ablations (no knowledge graph; no spaced repetition) → Task 9. ✅
- Trajectory schema precisely defined for the DKT plan → Task 4 (long-format) + Task 11 (`.npz`) + Task 12 doc. ✅
- §8.3 on-device latency, §5.1–5.2/5.4 DKT model/training/export → intentionally OUT of scope (other plans). ✅

**2. Placeholder scan:** No "TBD"/"similar to above"/"add error handling". Every code step is complete and runnable. The SM-2 half-up rounding (`math.floor(x+0.5)`, NOT Python's banker's `round`) is implemented inline with an explaining comment and a test that proves it. ✅

**3. Type/name consistency:**
- `SKILL_IDS` order is the single source of `skill_idx`, `dkt_input_idx`, and the one-hot dim (26) — defined once in `knowledge_graph.py`, re-used everywhere. ✅
- Trajectory `COLUMNS`/`DTYPES` defined once in `schema.py`; `io.py`, `simulator.py`, tests, and the schema doc all reference them. ✅
- BKT param names (`pL0/pT/pG/pS`) match `masteryModel.js`; decision constants (`MASTERY_CUTOFF=0.75`, ZPD bins, SM-2 ease/interval) match `decisionLayer.js`; golden tests mirror the JS test cases. ✅
- A/B `_attempt`/`_post_test` reuse the SAME success-probability formula and `DIFFICULTY_PENALTY` as the simulator (imported, not duplicated) so control/treatment differ only by policy. ✅

**4. Test approach:** `pytest` + `numpy` (+ `scikit-learn` for AUC/Brier). Simulator tests assert distribution ranges, prereq constraint, output shape, determinism, and ability↔correctness correlation. Metric tests assert AUC=1.0 on a trivially separable toy set, ~0.5 on random, NaN on single-class, Brier=0 on perfect calibration, baseline-beats-chance on synthetic, and A/B/ablation directionality. ✅

**Decision recorded — A/B reuses Python, not the JS engine:** The treatment arm REIMPLEMENTS `decisionLayer.js` in Python (`scripts/eval/decision.py`) rather than bridging to Node. Justified by single-process determinism, no Node dependency inside the eval run, per-step decision volume (≥10k×50), and golden tests that pin the port to the JS test cases. Trade-off (dual maintenance) is mitigated by the JS-source sync-check (graph) and golden tests (decisions), and flagged for future consolidation.

---

## Open Questions

1. **Graph sync (JS ↔ Python).** `knowledge_graph.py` is a manual transcription of `knowledgeGraph.js`. Two drift guards now exist: `test_knowledge_graph.py` parses `PREREQS`, and `test_sequences.py::test_python_encoding_matches_js_source` parses BOTH `SKILLS` (skill ORDER) and `PREREQS` from the JS and asserts the Python re-encoding matches — this is what protects the `dkt_input_idx = skill_idx*2 + correct` convention from silent JS↔Python drift. `GAME_SKILLS` is still not mirrored (the simulator does not need it). **Recommended v2:** emit a single `knowledge_graph.json` from the JS at build time (e.g. a small Node script) and have BOTH runtimes read it, retiring the regex parsers. Flagged now; the regex guards are the interim safety net.
2. **Decision logic duplication.** We chose to reimplement `decisionLayer.js` in Python. If the engine-core decision logic changes, two files move. A shared JSON spec (constants) + thin language-specific wrappers would remove the duplication of constants at least. Decide before the DKT plan locks.
3. **Simulator policy realism.** The `_choose_skill` ZPD-weighted policy and the `DIFFICULTY_PENALTY` magnitudes are plan-chosen, not from the spec. They affect the A/B effect size and the synthetic AUC ceiling. Should the guide (Dr. Krishnaraj) sign off on the policy, or do we calibrate it to roughly reproduce the 25–40% lift the spec cites?
4. **ASSISTments skill mapping.** The external check runs a per-skill BKT on the dataset's OWN skills (110+ skills), not our 13-skill graph — so it validates the predictor, not the graph. Is that the intended "external sanity check," or do we want a crosswalk from ASSISTments skills to our 13? (A crosswalk is lossy and probably out of scope.)
5. **Post-test definition.** §8.2 says "post-test score after 50 problems" but does not define the test. We use mean P(correct) at medium difficulty across all 13 skills under final latent ability. Alternative: a fresh held-out problem set per skill, scored as accuracy. Confirm the metric the report will quote.
6. **Full-scale runtime.** The simulator is a pure-Python per-step loop (~800k steps at 10k×80). If generation is too slow for iteration, a vectorized/numba rewrite is a perf follow-up — out of scope here, where correctness is locked. Should we set a runtime budget?
7. **Forgetting model in the A/B (`FORGET_PER_DAY`).** The A/B/ablation arms apply a fixed `0.01`/day decay to idle skills. This is REQUIRED for the spaced-repetition ablation to be sound (without forgetting, removing SR frees a problem slot and the ablation inverts), but the magnitude is plan-chosen and not in the spec. It affects both the §8.2 effect size and the §8.4 ablation gaps. Confirm with the guide whether to keep `0.01`, calibrate it to the cited 25–40% lift, or model forgetting more realistically (e.g. exponential, per-skill rate).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md`.

This plan depends on the already-built JS engine (graph + decision constants it mirrors) and the spec. The dependent plan is **`2026-05-22-dkt-pipeline.md`**, which consumes (a) the LOCKED long-format trajectory schema (Task 4 / `docs/data/TRAJECTORY_SCHEMA.md`) and (b) the training-ready **`data/dkt_sequences.npz`** (Task 11) — its `load_dataset()` reads `X, Y_skill, Y_correct, mask` from THIS file, and may assert `num_skills == 13` / `skill_ids` order. It also plugs its model predictions into `metrics.next_correct_auc`. The DKT plan must NOT re-derive the one-hot encoding/shift — it is locked here. Confirm the DKT plan's `load_dataset` array names match Task 11's contract before it locks.
