# DKT Model Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Deep Knowledge Tracing (DKT) model pipeline end-to-end — a Keras LSTM trained off-device on synthetic learner trajectories, exported to TensorFlow.js, plus a JS backend (`src/engine/masteryModelDKT.js`) that satisfies the **exact same three-function contract** as the shipped BKT backend (`createInitialBelief`, `updateBelief`, `getMastery`). The DKT backend becomes a drop-in mastery estimator selectable in `engineAPI.js` via a single feature flag, with **zero** changes to the decision layer, the public API surface, or any game/dashboard.

**Architecture:** Two halves joined by a static model file.

```
  ── OFF-DEVICE (Python) ──────────────────         ── ON-DEVICE (JS) ─────────────────────────
  scripts/train_dkt.py                                src/engine/masteryModelDKT.js
   1. load synthetic trajectories (.parquet)           • loads public/models/dkt/model.json once
   2. build 1-layer LSTM (100u, dropout 0.2)           • keeps the interaction sequence in the
   3. train: BCE on next-step correctness                belief object (sequence-based, not scalar)
   4. validate: AUC ≥ 0.85 on held-out                  • re-runs LSTM inference -> per-skill P(correct)
   5. tfjs converter -> model.json + *.bin             • exposes createInitialBelief / updateBelief /
      (+ int8 quantization fallback)                     getMastery — identical signatures to BKT
         │                                                          ▲
         └──────── public/models/dkt/ (~1-3 MB) ────────────────────┘
                                                       engineAPI.js: MASTERY_BACKEND flag selects
                                                       BKT (default) or DKT — one import swap.
```

The Python half mirrors `src/engine/masteryModel.js` math semantics: belief = per-skill P(known), updated per interaction, read as a scalar in `[0,1]`. The JS half hides the LSTM's sequence/hidden-state nature behind the scalar-style contract by **carrying the raw interaction sequence inside the belief object and re-running stateless inference** on each `getMastery`/`updateBelief` (see Task 7 for the rationale and the stateful-LSTM alternative).

**Tech Stack:**
- **Python (training, off-device):** TensorFlow/Keras 2.x, `tensorflowjs` converter, NumPy, scikit-learn (AUC), pytest. None installed yet — Task 1 sets up the env.
- **JS (inference, on-device):** `@tensorflow/tfjs` (new dependency — added by this plan), Vitest (already present).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — implements §5.1 (model spec), §5.2 (DKT rationale, informational), §5.4 (deployment pipeline Colab→tfjs→browser), §8.1 (AUC ≥ 0.85), §8.3 (inference < 30 ms, model load < 2 s), and §10 (int8 quantization + BKT fallback). §5.3 (synthetic data generation) and §8.1's ASSISTments external check belong to a **separate plan** (see Dependencies).

**Existing contract this plan must satisfy (read before implementing):**
- `src/engine/masteryModel.js` — the BKT backend. Exports `DEFAULT_BKT_PARAMS`, `createInitialBelief(params?)`, `updateBelief(belief, skillId, correct, params?)`, `getMastery(belief, skillId, params?)`. The DKT backend must export the **same three functions with the same names and call signatures**.
- `src/engine/engineAPI.js` — imports the backend at lines 3 (`createInitialBelief`, `updateBelief`, `getMastery as bktMastery`). The feature flag (Task 8) changes only this import wiring.
- `src/engine/knowledgeGraph.js` — `SKILL_IDS` has **13** entries. **All model dimensions derive from this**: input one-hot dim = `2 × 13 = 26`, output dim = `13`. (See §"24→26 input-dim correction" below.)
- `src/lib/db.js` — already has `appendInteraction()` and `getInteractionLog(limit=50)` over the `interaction_log` store (engine-core plan, executed). The DKT backend reuses this log shape; no db changes in this plan.

---

## CRITICAL CORRECTION: input dim is 26, NOT the spec's 24

Spec §5.1 hard-codes the DKT input encoding as `2 × 12 = 24` and the output as "12 skills", because the §5.1 prose assumed **12** skills. The shipped knowledge graph (`src/engine/knowledgeGraph.js`, `SKILL_IDS`) has **13** skills (the §4 table lists 13; the "12 nodes" heading is the documented discrepancy already flagged in the engine-core plan). Therefore, for this codebase:

- **Input one-hot dimension = `2 × num_skills = 2 × 13 = 26`** (one-hot over the `(skill, correct)` pair). **The one-hot index convention is LOCKED by the data-producer plan as `dkt_input_idx = skill_idx * 2 + correct`** — i.e. `(skill 0, wrong)=0`, `(skill 0, right)=1`, … `(skill 12, right)=25`. This convention is identical in the Python encoder, the JS encoder, and every test (see "Canonical data contract" below). An earlier draft of this plan used `skill_index + correct*NUM_SKILLS`; that has been **removed** — do not reintroduce it.
- **Output dimension = `num_skills = 13`** (sigmoid, per-skill `P(correct | skill)` ≈ per-skill mastery).

Every dimension in both halves is computed from `NUM_SKILLS` / `SKILL_IDS.length` — **never hard-coded to 12, 24, or 13**. The Python side reads `num_skills` / `skill_ids` from the data-producer's `*.meta.json` sidecar (see below) so Python and JS agree on skill ordering. This is called out again in Open Questions.

---

## DECISION: `scripts/train_dkt.py` (not a Colab `.ipynb`)

The spec (§5.4, §7) names `notebooks/train_dkt.ipynb` as a Colab notebook. This plan ships a **plain Python script `scripts/train_dkt.py`** instead, for these reasons:

1. **No Colab guarantee locally.** The work happens on this machine (arm64 macOS, Python 3.9.6 venv). A `.py` script runs head-less, is diffable, is unit-testable with pytest (Task 3/4 import its functions directly), and is reproducible in CI. A notebook is not testable without `nbconvert`/`papermill` gymnastics.
2. **Determinism + review.** Code review and `git diff` on a script are clean; notebook JSON diffs are noise.
3. **Colab is still supported, for free.** The script's body is import-safe (`if __name__ == '__main__':`), so a 3-cell Colab notebook can `!pip install` then `from train_dkt import build_dkt_model, train, evaluate_auc; ...`. We document this in the script header. If the team prefers Colab GPU for the real 10k-student run, they paste the script into a cell — no rewrite. (Flagged in Open Questions.)
4. **macOS/Apple-Silicon TF caveat.** TensorFlow on Python 3.9 + arm64 is finicky (`tensorflow-macos` / `tensorflow` wheel availability varies). Task 1 makes env setup explicit and provides a CPU-only fallback + a Colab escape hatch if the local wheel won't install. The model is a tiny LSTM, so **CPU training of the toy/test set is fine locally**; the full 10k-student train may be run on Colab.

The directory will be `scripts/` (created in Task 2), matching `scripts/simulate_students.py` from spec §7.

---

## Canonical data contract — owned by the synthetic-data plan (HARD DEPENDENCY)

> **DEPENDS ON:** `docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md` (the **data producer**). That plan is now the **single source of truth** for the training data. **It MUST be implemented first** — this plan's real-training step (Task 5 Step 5) and trained artifact (Task 9) are BLOCKED until its dataset exists. The schema below is **read FROM the producer, not defined here**; if the two ever disagree, the producer wins and this plan is updated to match.

The data producer emits a **long-format columnar trajectory file** (Parquet preferred, CSV fallback) — **NOT** a NumPy `.npz` — plus a `*.meta.json` sidecar. There is **no `skills.json`**; skill ordering comes from the meta sidecar's `skill_ids`.

**File:** `data/synthetic/trajectories.parquet` (or `.csv`). One row per interaction, **sorted by `(student_id, step_idx)`** (long format — this plan groups by `student_id`, sorts by `step_idx`, and pads/truncates to `SEQ_LEN=50` at training time). Columns (from the producer's `scripts/eval/schema.py` `COLUMNS`/`DTYPES`):

| Column | Dtype | Meaning |
|---|---|---|
| `student_id` | `int32` | 0-based synthetic student index |
| `step_idx` | `int16` | 0-based chronological interaction index within the student |
| `skill_id` | `string` | one of the 13 skill ids (e.g. `addition`) |
| `skill_idx` | `int8` | index of `skill_id` into canonical `SKILL_IDS` order (0..12) |
| `correct` | `int8` | 1 correct / 0 incorrect |
| `difficulty` | `int8` | 0 easy / 1 medium / 2 hard (served bin) |
| `response_time_ms` | `int32` | simulated latency (lognormal) |
| `latent_ability` | `float32` | ground-truth P(known) BEFORE the step — **diagnostics only; MUST NOT be a model feature** |
| `dkt_input_idx` | `int16` | one-hot index `skill_idx * 2 + correct` into the 26-dim DKT input vector |

**Sidecar `data/synthetic/trajectories.meta.json`** records: `schema_version`, `num_skills` (13), `skill_ids` (ordered, the single source of skill ordering), `num_students`, `seed`, `max_interactions`, `git_sha_of_knowledge_graph_js`. **This plan derives `NUM_SKILLS`/`skill_ids` from this sidecar** and asserts `num_skills == 13`.

**One-hot index convention (LOCKED, load-bearing in all three places — Python encoder, JS encoder, tests):**

```
dkt_input_idx = skill_idx * 2 + correct
```

so `(skill 0, wrong)=0`, `(skill 0, right)=1`, `(skill 3, wrong)=6`, `(skill 3, right)=7`, … `(skill 12, right)=25`. (Equivalently: even indices = answered-incorrectly, odd indices = answered-correctly, interleaved per skill.) This is the standard DKT encoding and matches the producer's `schema.dkt_input_index(skill_idx, correct)` exactly. **The earlier `skill_index + correct*NUM_SKILLS` convention is removed everywhere in this plan.**

**DKT consumption recipe (from the producer's `docs/data/TRAJECTORY_SCHEMA.md`):**
1. Load the file, group by `student_id`, sort by `step_idx`.
2. Input at step t = one-hot(`dkt_input_idx[t]`) in R^26 (`2 * num_skills`).
3. Target at step t = `correct[t+1]` for the skill at t+1 (next-step correctness); the targeted skill = `skill_idx[t+1]`.
4. Pad/truncate each student to `SEQ_LEN = 50`; mask padded steps in the loss.
5. NEVER feed `latent_ability` to the model.

- `N` = number of student sequences (10,000 per spec §5.3; the toy fixture in Tasks 3–4 uses `N=8`, generated in-test in the SAME long-row shape via `make_toy_frame()`).
- `SEQ_LEN` = 50 (spec §5.1, = producer's `MAX_SEQ_LEN`).

Tasks 3–6 build a **self-contained toy long-format fixture** (a small list of interaction rows) inside the test, so this plan is executable and fully testable **before** the producer's full dataset is generated — but the real-training step still requires the producer to be implemented.

---

## File Structure

| File | Responsibility |
|---|---|
| `requirements-dkt.txt` | Pinned Python deps for training (new) |
| `scripts/train_dkt.py` | Build / train / evaluate / export the DKT LSTM (new) |
| `scripts/test_train_dkt.py` | pytest: shapes, one-step train, AUC on toy set, encoder round-trip (new) |
| `scripts/pytest.ini` | pytest config scoped to `scripts/` (new) |
| `scripts/README.md` | How to set up the env, train, and export (new) |
| `data/synthetic/.gitkeep` | Placeholder; real `trajectories.parquet` + `.meta.json` produced by the synthetic-data plan (new) |
| `public/models/dkt/model.json` + `group1-shard1of1.bin` | Exported tfjs model (generated artifact; committed, ~1-3 MB) |
| `src/engine/masteryModelDKT.js` | JS DKT backend: same 3 exports as BKT, sequence-state handling (new) |
| `src/engine/masteryModelDKT.test.js` | Vitest: contract parity with BKT, encoder, [0,1] bounds, mocked model (new) |
| `src/engine/backendConfig.js` | Feature flag: `MASTERY_BACKEND = 'bkt' | 'dkt'` (new) |
| `src/engine/masteryBackend.js` | Thin re-export shim that resolves the active backend from the flag (new) |
| `src/engine/engineAPI.js` | Swap backend import to the shim (modify — 1 import line) |
| `src/engine/perf-dkt.bench.test.js` | Inference-latency micro-benchmark, Node (new) |
| `src/engine/README.md` | Document backend swap + perf-verification method (modify) |
| `package.json` | Add `@tensorflow/tfjs` dependency (modify) |

**Backend contract (locked — both backends export exactly this):**

```js
createInitialBelief(params?)                 // -> belief object
updateBelief(belief, skillId, correct, params?)  // -> new belief (immutable)
getMastery(belief, skillId, params?)         // -> number in [0,1]
```

---

### Task 1: Python training environment

The `venv/` exists (Python 3.9.6, arm64) but has no ML libraries. Pin and install the training deps. Keep this separate from the JS toolchain.

**Files:**
- Create: `requirements-dkt.txt`

- [ ] **Step 1: Pin the Python dependencies**

Create `requirements-dkt.txt`:
```text
# DKT training pipeline (off-device). Install into the project venv:
#   venv/bin/pip install -r requirements-dkt.txt
# Apple-Silicon note: if the plain `tensorflow` wheel fails to install on
# Python 3.9/arm64, substitute the two macOS lines below (see scripts/README.md).
tensorflow==2.15.0 ; platform_system != "Darwin" or platform_machine != "arm64"
tensorflow-macos==2.15.0 ; platform_system == "Darwin" and platform_machine == "arm64"
tensorflowjs==4.17.0
numpy==1.26.4
scikit-learn==1.4.2
pandas==2.2.2
pyarrow==16.1.0
pytest==8.1.1
```

> Rationale: `tensorflowjs==4.17.0` pins a converter compatible with `tensorflow==2.15`. NumPy is held `<2` because TF 2.15 predates NumPy 2 ABI. The environment marker swaps to `tensorflow-macos` on this machine. **`pandas` + `pyarrow` are required to read the data-producer's Parquet trajectory file** (`load_dataset` in Task 4); they match the versions pinned in the data-producer plan's `requirements.txt`.

- [ ] **Step 2: Install into the venv**

Run:
```bash
venv/bin/python -m pip install --upgrade pip
venv/bin/pip install -r requirements-dkt.txt
```
Expected: installs succeed. **If the TF wheel fails on Python 3.9/arm64** (no compatible wheel): record the failure, and either (a) recreate the venv on Python 3.10/3.11 (`python3.11 -m venv venv311 && venv311/bin/pip install -r requirements-dkt.txt`) and use that for training, or (b) train on Colab (see `scripts/README.md`, Task 9). The toy-set tests (Tasks 3–4) only need TF + sklearn; they do not need GPU.

- [ ] **Step 3: Verify the toolchain imports**

Run:
```bash
venv/bin/python -c "import tensorflow as tf; import tensorflowjs as tfjs; import sklearn; print('tf', tf.__version__, '| tfjs', tfjs.__version__)"
```
Expected: prints versions with no ImportError. If it errors, resolve per Step 2 before continuing.

- [ ] **Step 4: Commit**

```bash
git add requirements-dkt.txt
git commit -m "chore(dkt): pin python training dependencies"
```

---

### Task 2: Scaffold dirs + pytest config

**Files:**
- Create: `scripts/pytest.ini`
- Create: `data/synthetic/.gitkeep`

- [ ] **Step 1: Create the directories**

Run:
```bash
mkdir -p scripts data/synthetic public/models/dkt
touch data/synthetic/.gitkeep
```

- [ ] **Step 2: Add pytest config**

Create `scripts/pytest.ini`:
```ini
[pytest]
testpaths = .
python_files = test_*.py
python_functions = test_*
addopts = -q
```

- [ ] **Step 3: Ignore generated data, keep the model artifact**

Append to the repo root `.gitignore` (create the lines if absent):
```gitignore
# DKT: large synthetic datasets are generated by the synthetic-data plan, not committed
data/synthetic/*.parquet
data/synthetic/*.csv
data/synthetic/*.meta.json
# (public/models/dkt/* IS committed — it is the shipped runtime asset)
```

> Note: the data-producer plan already adds `data/synthetic/` and `*.parquet` to `.gitignore`. These lines are idempotent — skip any that already exist (don't duplicate).

- [ ] **Step 4: Commit**

```bash
git add scripts/pytest.ini data/synthetic/.gitkeep .gitignore
git commit -m "chore(dkt): scaffold scripts/ + data/ dirs and pytest config"
```

---

### Task 3: DKT model builder + encoder (Python) — TDD

Build the Keras model and the one-hot encoder. Test first.

**Files:**
- Create: `scripts/train_dkt.py`
- Create: `scripts/test_train_dkt.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/test_train_dkt.py`:
```python
import numpy as np
import pytest

from train_dkt import (
    build_dkt_model,
    encode_interaction,
    NUM_SKILLS,
    SEQ_LEN,
    INPUT_DIM,
)


def test_dims_derive_from_num_skills():
    # 13 skills in the shipped knowledge graph -> input 26, output 13. NOT 24/12.
    assert NUM_SKILLS == 13
    assert INPUT_DIM == 2 * NUM_SKILLS == 26
    assert SEQ_LEN == 50


def test_model_has_correct_io_shapes():
    model = build_dkt_model()
    # Input: (batch, SEQ_LEN, 2*NUM_SKILLS)
    assert model.input_shape == (None, SEQ_LEN, INPUT_DIM)
    # Output: (batch, SEQ_LEN, NUM_SKILLS) sigmoid per-skill P(correct)
    assert model.output_shape == (None, SEQ_LEN, NUM_SKILLS)


def test_model_has_one_lstm_layer_with_100_units():
    model = build_dkt_model()
    lstm_layers = [l for l in model.layers if l.__class__.__name__ == "LSTM"]
    assert len(lstm_layers) == 1
    assert lstm_layers[0].units == 100
    # return_sequences must be True so we get a prediction at every timestep
    assert lstm_layers[0].return_sequences is True


def test_encode_interaction_one_hot_convention():
    # LOCKED convention (data-producer): dkt_input_idx = skill_idx*2 + correct.
    # skill index 3, correct -> hot at 3*2 + 1 = 7
    v_correct = encode_interaction(3, True)
    assert v_correct.shape == (INPUT_DIM,)
    assert v_correct[3 * 2 + 1] == 1.0
    assert v_correct.sum() == 1.0
    # skill index 3, incorrect -> hot at 3*2 + 0 = 6
    v_wrong = encode_interaction(3, False)
    assert v_wrong[3 * 2 + 0] == 1.0
    assert v_wrong.sum() == 1.0


def test_encode_matches_producer_dkt_input_idx():
    # Exhaustive parity with the data-producer's schema.dkt_input_index.
    for s in range(NUM_SKILLS):
        for c in (0, 1):
            v = encode_interaction(s, bool(c))
            assert int(v.argmax()) == s * 2 + c
            assert v.sum() == 1.0


def test_model_predicts_in_unit_interval():
    model = build_dkt_model()
    x = np.zeros((1, SEQ_LEN, INPUT_DIM), dtype="float32")
    x[0, 0] = encode_interaction(0, True)
    p = model.predict(x, verbose=0)
    assert p.shape == (1, SEQ_LEN, NUM_SKILLS)
    assert p.min() >= 0.0 and p.max() <= 1.0
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
venv/bin/python -m pytest scripts/test_train_dkt.py -q
```
Expected: FAIL (`ModuleNotFoundError: No module named 'train_dkt'`).

- [ ] **Step 3: Write the model builder + encoder**

Create `scripts/train_dkt.py`:
```python
"""DKT training pipeline (off-device).

Builds, trains, evaluates and exports a 1-layer LSTM Deep Knowledge Tracing
model per spec §5.1, adapted to the SHIPPED 13-skill knowledge graph
(input dim = 2*13 = 26, output dim = 13 — NOT the spec's hard-coded 24/12).

Training data is the data-producer plan's LONG-format trajectory file
(data/synthetic/trajectories.parquet + .meta.json) — see
docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md. This script
reads it with load_dataset() and windows it to (N, 50, 26) tensors. There is NO
self-defined .npz schema.

Run locally (CPU is fine — the model is tiny):
    venv/bin/pip install -r requirements-dkt.txt
    venv/bin/python scripts/train_dkt.py \
        --data data/synthetic/trajectories.parquet \
        --out  public/models/dkt

Run on Colab (no local TF wheel needed):
    !pip install tensorflow tensorflowjs scikit-learn pandas pyarrow
    from train_dkt import build_dkt_model, train, evaluate_auc, export_tfjs, load_dataset
    ds = load_dataset("trajectories.parquet")  # producer's long-format file + .meta.json
    # ... split by student, train(...), check AUC >= 0.85, export_tfjs(...)
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np

# ── Dimensions: derive everything from the skill count. ──────────────────────
# Mirrors src/engine/knowledgeGraph.js SKILL_IDS (13 skills). At runtime,
# load_dataset() reads num_skills from the data-producer's trajectories.meta.json
# sidecar and asserts it == NUM_SKILLS; this constant is the default/fallback for
# tests and model-builder calls that don't load a dataset.
NUM_SKILLS = 13
SEQ_LEN = 50
INPUT_DIM = 2 * NUM_SKILLS  # 26
LSTM_UNITS = 100
DROPOUT = 0.2
LEARNING_RATE = 1e-3


def encode_interaction(skill_index: int, correct: bool) -> np.ndarray:
    """One-hot the (skill, correct) pair into a length-INPUT_DIM vector.

    LOCKED convention (data-producer plan, schema.dkt_input_index — MUST match
    masteryModelDKT.js encodeInteraction):
      hot_index = skill_index * 2 + correct
    i.e. even index = answered-incorrectly, odd index = answered-correctly,
    interleaved per skill: (skill 0, wrong)=0, (skill 0, right)=1, ... (skill 12, right)=25.
    """
    v = np.zeros(INPUT_DIM, dtype="float32")
    v[skill_index * 2 + (1 if correct else 0)] = 1.0
    return v


def build_dkt_model(
    num_skills: int = NUM_SKILLS,
    seq_len: int = SEQ_LEN,
    lstm_units: int = LSTM_UNITS,
    dropout: float = DROPOUT,
    learning_rate: float = LEARNING_RATE,
):
    """1-layer LSTM DKT model (Piech et al. 2015), per-timestep sigmoid output."""
    import tensorflow as tf
    from tensorflow.keras import layers, models

    input_dim = 2 * num_skills
    inp = layers.Input(shape=(seq_len, input_dim), name="interactions")
    # Masking lets padded (all-zero) timesteps be ignored by the LSTM.
    x = layers.Masking(mask_value=0.0)(inp)
    x = layers.LSTM(
        lstm_units,
        return_sequences=True,   # prediction at every timestep
        dropout=dropout,         # dropout on the hidden state (spec §5.1)
        name="dkt_lstm",
    )(x)
    out = layers.Dense(num_skills, activation="sigmoid", name="per_skill_p")(x)

    model = models.Model(inp, out, name="dkt")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="binary_crossentropy",
    )
    return model
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
venv/bin/python -m pytest scripts/test_train_dkt.py -q
```
Expected: PASS (6 passed). (First TF import is slow; allow ~30 s.)

- [ ] **Step 5: Commit**

```bash
git add scripts/train_dkt.py scripts/test_train_dkt.py
git commit -m "feat(dkt): add DKT LSTM model builder and one-hot encoder (26-dim)"
```

---

### Task 4: Masked loss, one-step training, AUC on a toy set (Python) — TDD

The DKT loss/metric must only score the **next-interaction** prediction for the **targeted skill**, ignoring padding. Add a masked-gather step + AUC, trained on a tiny synthetic fixture.

**Files:**
- Modify: `scripts/train_dkt.py`
- Modify: `scripts/test_train_dkt.py`

- [ ] **Step 1: Add the failing tests**

Append to `scripts/test_train_dkt.py`:
```python
import pandas as pd
from train_dkt import (
    gather_target_predictions,
    train,
    evaluate_auc,
    make_toy_frame,
    frame_to_windows,
    make_toy_dataset,
)


def test_frame_to_windows_builds_next_step_tensors():
    # Long-format rows for ONE student, 3 interactions, in the producer's schema.
    # Encoding/targets follow the DKT consumption recipe: input one-hots
    # dkt_input_idx[t]; the prediction slot for input t carries the NEXT step's
    # (skill_idx[t+1], correct[t+1]); the final input row has no next -> masked.
    # Sequences are LEFT-padded (newest at the last slot), so 3 real interactions
    # occupy slots start..start+2 with start = SEQ_LEN - 3.
    rows = pd.DataFrame([
        dict(student_id=0, step_idx=0, skill_idx=0, correct=1, dkt_input_idx=0 * 2 + 1),
        dict(student_id=0, step_idx=1, skill_idx=2, correct=0, dkt_input_idx=2 * 2 + 0),
        dict(student_id=0, step_idx=2, skill_idx=1, correct=1, dkt_input_idx=1 * 2 + 1),
    ])
    ds = frame_to_windows(rows, seq_len=SEQ_LEN, num_skills=NUM_SKILLS)
    assert ds["X"].shape == (1, SEQ_LEN, INPUT_DIM)
    assert ds["Y_skill"].shape == (1, SEQ_LEN, NUM_SKILLS)
    assert ds["Y_correct"].shape == (1, SEQ_LEN)
    assert ds["mask"].shape == (1, SEQ_LEN)
    start = SEQ_LEN - 3
    # Input at the first real slot one-hots row0's dkt_input_idx (skill 0, correct -> 1).
    assert ds["X"][0, start, 0 * 2 + 1] == 1.0
    # Prediction slot for input row0 targets the NEXT step row1 (skill 2, incorrect).
    assert ds["Y_skill"][0, start, 2] == 1.0
    assert ds["Y_correct"][0, start] == 0.0
    # First two real slots have next-step targets; the final real slot has no next.
    assert ds["mask"][0, start] == 1.0 and ds["mask"][0, start + 1] == 1.0
    assert ds["mask"][0, start + 2] == 0.0
    # Everything before the first real slot is padding (no input, no target).
    assert ds["X"][0, : start].sum() == 0.0
    assert ds["mask"][0, : start].sum() == 0.0


def test_gather_selects_targeted_skill_prediction():
    # preds: (1, 2, NUM_SKILLS); y_skill picks skill 0 at t0, skill 2 at t1.
    preds = np.zeros((1, 2, NUM_SKILLS), dtype="float32")
    preds[0, 0, 0] = 0.9
    preds[0, 1, 2] = 0.3
    y_skill = np.zeros((1, 2, NUM_SKILLS), dtype="float32")
    y_skill[0, 0, 0] = 1.0
    y_skill[0, 1, 2] = 1.0
    gathered = gather_target_predictions(preds, y_skill)  # (1, 2)
    assert gathered.shape == (1, 2)
    np.testing.assert_allclose(gathered[0], [0.9, 0.3], atol=1e-6)


def test_train_runs_one_epoch_and_reduces_loss():
    ds = make_toy_dataset(n=8, seed=0)  # toy long-format frame -> windowed tensors
    model = build_dkt_model()
    history = train(model, ds, epochs=2, batch_size=4, verbose=0)
    losses = history.history["loss"]
    assert len(losses) == 2
    assert np.isfinite(losses[-1])
    # Two epochs on a learnable toy set should not increase loss.
    assert losses[-1] <= losses[0] + 1e-6


def test_evaluate_auc_in_unit_range():
    ds = make_toy_dataset(n=8, seed=1)
    model = build_dkt_model()
    train(model, ds, epochs=3, batch_size=4, verbose=0)
    auc = evaluate_auc(model, ds)
    assert 0.0 <= auc <= 1.0  # toy set is too small to assert >= 0.85
```

> Note: the **AUC ≥ 0.85 acceptance gate (spec §8.1)** is asserted in Task 5's full-training run on the real synthetic dataset, not on this 8-sequence toy set (which is statistically meaningless). The toy test only proves the AUC plumbing works end-to-end.

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
venv/bin/python -m pytest scripts/test_train_dkt.py -q
```
Expected: FAIL (`ImportError: cannot import name 'gather_target_predictions'`).

- [ ] **Step 3: Add the implementation**

Append to `scripts/train_dkt.py`:
```python
# ── Masked next-step gather, training, evaluation ────────────────────────────

def gather_target_predictions(preds: np.ndarray, y_skill: np.ndarray) -> np.ndarray:
    """Select, at each timestep, the predicted P(correct) for the NEXT skill.

    preds:   (N, T, NUM_SKILLS) sigmoid outputs.
    y_skill: (N, T, NUM_SKILLS) one-hot mask of the next interaction's skill.
    Returns: (N, T) the prediction for the targeted skill (0 where no target).
    """
    return np.sum(preds * y_skill, axis=-1)


def _masked_bce_metric(model, ds):
    """Compute next-step BCE only over real (masked) timesteps — diagnostics."""
    preds = model.predict(ds["X"], verbose=0)
    p = gather_target_predictions(preds, ds["Y_skill"])
    y = ds["Y_correct"]
    m = ds["mask"].astype(bool)
    p, y = np.clip(p[m], 1e-7, 1 - 1e-7), y[m]
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def train(model, ds, epochs=10, batch_size=32, validation_split=0.0, verbose=1):
    """Fit the DKT model.

    Keras' built-in BCE would score all NUM_SKILLS outputs at every timestep.
    We want next-step-only loss, so we feed Y as a per-skill target where the
    targeted skill carries the correctness label and `sample_weight` (= mask
    broadcast through y_skill) zeroes out every non-targeted skill and padding.
    """
    import tensorflow as tf

    # Build dense per-skill targets + weights:
    #  target[n,t,k] = Y_correct[n,t]    if k is the targeted skill, else 0
    #  weight[n,t,k] = mask[n,t]         if k is the targeted skill, else 0
    target = ds["Y_skill"] * ds["Y_correct"][..., None]
    weight = ds["Y_skill"] * ds["mask"][..., None]

    return model.fit(
        ds["X"], target,
        sample_weight=weight,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=validation_split,
        verbose=verbose,
    )


def evaluate_auc(model, ds) -> float:
    """ROC-AUC of next-step correctness over real (unmasked) timesteps."""
    from sklearn.metrics import roc_auc_score

    preds = model.predict(ds["X"], verbose=0)
    p = gather_target_predictions(preds, ds["Y_skill"])
    y = ds["Y_correct"]
    m = ds["mask"].astype(bool)
    y_flat, p_flat = y[m], p[m]
    if len(np.unique(y_flat)) < 2:
        return float("nan")  # AUC undefined if only one class present
    return float(roc_auc_score(y_flat, p_flat))


def frame_to_windows(df, seq_len: int = SEQ_LEN, num_skills: int = NUM_SKILLS) -> dict:
    """Convert the data-producer's LONG-format trajectory frame into the padded,
    windowed tensors the LSTM trains on.

    Implements the DKT consumption recipe (docs/data/TRAJECTORY_SCHEMA.md):
      group by student_id, sort by step_idx; input[t] = one-hot(dkt_input_idx[t]);
      next-step target[t] targets skill_idx[t+1] with label correct[t+1]; pad/
      truncate to seq_len; mask = 1 only where a real NEXT step exists.

    df columns used: student_id, step_idx, skill_idx, correct, dkt_input_idx.
    `latent_ability` is intentionally NOT read (never a model feature).
    """
    input_dim = 2 * num_skills
    df = df.sort_values(["student_id", "step_idx"])
    students = list(df.groupby("student_id", sort=False))
    n = len(students)

    X = np.zeros((n, seq_len, input_dim), dtype="float32")
    Y_skill = np.zeros((n, seq_len, num_skills), dtype="float32")
    Y_correct = np.zeros((n, seq_len), dtype="float32")
    mask = np.zeros((n, seq_len), dtype="float32")

    for i, (_, g) in enumerate(students):
        idx = g["dkt_input_idx"].to_numpy()
        skl = g["skill_idx"].to_numpy()
        cor = g["correct"].to_numpy()
        # Keep the LAST seq_len interactions if a student is longer than the window.
        if len(idx) > seq_len:
            idx, skl, cor = idx[-seq_len:], skl[-seq_len:], cor[-seq_len:]
        L = len(idx)
        # Left-pad so the newest interaction sits at the last real slot (matches the
        # JS backend's right-aligned padding). start = seq_len - L.
        start = seq_len - L
        for t in range(L):
            X[i, start + t, int(idx[t])] = 1.0  # one-hot(dkt_input_idx) — LOCKED convention
            # next-step target lives at the PREVIOUS timestep
            if t > 0:
                Y_skill[i, start + t - 1, int(skl[t])] = 1.0
                Y_correct[i, start + t - 1] = float(cor[t])
                mask[i, start + t - 1] = 1.0
    return {"X": X, "Y_skill": Y_skill, "Y_correct": Y_correct, "mask": mask}


def make_toy_frame(n=8, seed=0, seq_len=SEQ_LEN, num_skills=NUM_SKILLS):
    """Deterministic, learnable LONG-format toy frame in the data-producer schema.

    Each student has a fixed per-skill ability; correctness is sampled from it, so
    a model CAN learn signal (loss decreases). Mirrors the producer's columns
    (incl. dkt_input_idx = skill_idx*2 + correct). Used only by tests, so this
    plan is runnable before the producer's real dataset is generated.
    """
    import pandas as pd

    rng = np.random.default_rng(seed)
    rows = []
    for sid in range(n):
        ability = rng.uniform(0.2, 0.9, size=num_skills)
        length = int(rng.integers(seq_len // 2, seq_len + 1))
        for step in range(length):
            skill = int(rng.integers(0, num_skills))
            correct = int(rng.random() < ability[skill])
            rows.append(dict(
                student_id=sid, step_idx=step, skill_idx=skill, correct=correct,
                dkt_input_idx=skill * 2 + correct,
            ))
    return pd.DataFrame(rows)


def make_toy_dataset(n=8, seed=0, seq_len=SEQ_LEN, num_skills=NUM_SKILLS):
    """Toy windowed tensors = make_toy_frame -> frame_to_windows (the real path)."""
    return frame_to_windows(make_toy_frame(n, seed, seq_len, num_skills),
                            seq_len=seq_len, num_skills=num_skills)


def load_dataset(path: str) -> dict:
    """Load the data-producer's LONG-format trajectory file and window it.

    Reads Parquet (default) or CSV; validates the locked one-hot invariant
    (dkt_input_idx == skill_idx*2 + correct) and num_skills from the *.meta.json
    sidecar, then returns the windowed tensors via frame_to_windows.
    """
    import json
    import pandas as pd

    df = pd.read_csv(path) if str(path).endswith(".csv") else pd.read_parquet(path)

    # Derive num_skills/skill ordering from the producer's meta sidecar.
    meta_path = os.path.splitext(path)[0] + ".meta.json"
    num_skills = NUM_SKILLS
    if os.path.exists(meta_path):
        meta = json.loads(open(meta_path).read())
        num_skills = int(meta.get("num_skills", NUM_SKILLS))
        if num_skills != NUM_SKILLS:
            raise ValueError(
                f"dataset num_skills={num_skills} != model NUM_SKILLS={NUM_SKILLS}; "
                "regenerate the model dims from the knowledge graph."
            )
    # Validate the LOCKED one-hot convention before training on it.
    expected = df["skill_idx"].astype(int) * 2 + df["correct"].astype(int)
    if not (df["dkt_input_idx"].astype(int) == expected).all():
        raise ValueError("dkt_input_idx must equal skill_idx*2 + correct (data contract violated)")

    return frame_to_windows(df, seq_len=SEQ_LEN, num_skills=num_skills)
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
venv/bin/python -m pytest scripts/test_train_dkt.py -q
```
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/train_dkt.py scripts/test_train_dkt.py
git commit -m "feat(dkt): add masked next-step training, AUC eval, toy dataset"
```

---

### Task 5: tfjs export + int8 quantization + CLI (Python)

Wire the train/eval/export pipeline behind a CLI, enforce the AUC gate on real data, and export to `public/models/dkt/`. Document the int8 fallback (spec §10).

**Files:**
- Modify: `scripts/train_dkt.py`
- Modify: `scripts/test_train_dkt.py`

- [ ] **Step 1: Add the export-shape test**

Append to `scripts/test_train_dkt.py`:
```python
import os
from train_dkt import export_tfjs


def test_export_writes_tfjs_artifacts(tmp_path):
    model = build_dkt_model()
    out = tmp_path / "dkt"
    export_tfjs(model, str(out))
    assert (out / "model.json").exists()
    # at least one weights shard
    shards = [p for p in os.listdir(out) if p.endswith(".bin")]
    assert len(shards) >= 1
    # model.json declares the tfjs format
    import json
    meta = json.loads((out / "model.json").read_text())
    assert "modelTopology" in meta or "format" in meta
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
venv/bin/python -m pytest scripts/test_train_dkt.py::test_export_writes_tfjs_artifacts -q
```
Expected: FAIL (`ImportError: cannot import name 'export_tfjs'`).

- [ ] **Step 3: Add export + CLI**

Append to `scripts/train_dkt.py`:
```python
# ── Export to TensorFlow.js + CLI ────────────────────────────────────────────

def export_tfjs(model, out_dir: str, quantize_int8: bool = False) -> None:
    """Convert a Keras model to the tfjs_layers_model format in `out_dir`.

    Writes out_dir/model.json + group1-shard*.bin. With quantize_int8=True the
    weights are quantized to 1 byte (spec §10 fallback) — ~4x smaller, tiny
    accuracy loss; use only if the float model exceeds the size/perf budget.
    """
    import tensorflowjs as tfjs

    os.makedirs(out_dir, exist_ok=True)
    kwargs = {}
    if quantize_int8:
        # quantize all weights to uint8
        kwargs["quantization_dtype_map"] = {"uint8": "*"}
    tfjs.converters.save_keras_model(model, out_dir, **kwargs)


def _dir_size_mb(path: str) -> float:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    return total / (1024 * 1024)


def main():
    ap = argparse.ArgumentParser(description="Train + export the DKT model.")
    ap.add_argument("--data", default="data/synthetic/trajectories.parquet",
                    help="data-producer long-format trajectory file (.parquet or .csv)")
    ap.add_argument("--out", default="public/models/dkt")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--val-split", type=float, default=0.2)
    ap.add_argument("--auc-gate", type=float, default=0.85,  # spec §8.1
                    help="fail the run if held-out AUC is below this")
    ap.add_argument("--quantize-int8", action="store_true",
                    help="export uint8-quantized weights (spec §10 size fallback)")
    args = ap.parse_args()

    ds = load_dataset(args.data)
    # Hold out the last val-split fraction of sequences for AUC.
    n = ds["X"].shape[0]
    cut = int(n * (1 - args.val_split))
    train_ds = {k: v[:cut] for k, v in ds.items()}
    val_ds = {k: v[cut:] for k, v in ds.items()}

    model = build_dkt_model()
    train(model, train_ds, epochs=args.epochs, batch_size=args.batch_size, verbose=1)

    auc = evaluate_auc(model, val_ds)
    print(f"[dkt] held-out next-step AUC = {auc:.4f}  (gate {args.auc_gate})")
    if not (auc >= args.auc_gate):
        raise SystemExit(
            f"AUC {auc:.4f} < gate {args.auc_gate}. Per spec §10: generate more "
            f"synthetic students (20k) or fall back to the BKT backend."
        )

    export_tfjs(model, args.out, quantize_int8=args.quantize_int8)
    size = _dir_size_mb(args.out)
    print(f"[dkt] exported to {args.out}  ({size:.2f} MB)")
    if size > 3.0 and not args.quantize_int8:
        print("[dkt] WARNING: > 3 MB. Re-run with --quantize-int8 (spec §10).")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify the export test passes**

Run:
```bash
venv/bin/python -m pytest scripts/test_train_dkt.py -q
```
Expected: PASS (11 passed).

- [ ] **Step 5: Train + export on real data (when the producer's `trajectories.parquet` exists)**

> BLOCKED-ON-DEPENDENCY: requires `data/synthetic/trajectories.parquet` (+ `trajectories.meta.json`) from the **data-producer plan** (`2026-05-22-synthetic-data-and-evaluation.md`), which MUST be implemented first. Until then this step is a no-op; the toy tests above prove the pipeline, and Task 9's placeholder model keeps the JS load/infer path runnable. When the data lands, run:

```bash
venv/bin/python scripts/train_dkt.py \
  --data data/synthetic/trajectories.parquet \
  --out  public/models/dkt \
  --epochs 30 --batch-size 64 --val-split 0.2 --auc-gate 0.85
```
Expected: prints `AUC = 0.8x` (≥ 0.85 gate), writes `public/models/dkt/model.json` + `.bin` (~1-3 MB). If size > 3 MB, re-run with `--quantize-int8`.

- [ ] **Step 6: Commit (script only; model artifact committed in Task 9 after real training)**

```bash
git add scripts/train_dkt.py scripts/test_train_dkt.py
git commit -m "feat(dkt): add tfjs export, int8 quantization, AUC-gated CLI"
```

---

### Task 6: Add `@tensorflow/tfjs` JS dependency

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the runtime inference library**

Run:
```bash
npm install @tensorflow/tfjs --legacy-peer-deps
```
> `--legacy-peer-deps` is required: this repo is on `vite@^8` / `react@^19`, and `@tensorflow/tfjs`'s transitive peer ranges trip npm's strict resolver. Record the exact command used in the commit. If it still fails, pin a version: `npm install @tensorflow/tfjs@4.22.0 --legacy-peer-deps`.

- [ ] **Step 2: Verify it imports under Node (Vitest environment)**

Run:
```bash
node -e "import('@tensorflow/tfjs').then(tf => console.log('tfjs', tf.version.tfjs))"
```
Expected: prints a version string, no error. (tfjs falls back to the CPU backend under Node — sufficient for inference and tests.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(dkt): add @tensorflow/tfjs runtime dependency"
```

---

### Task 7: JS DKT backend — contract parity with BKT — TDD

The crux. `masteryModelDKT.js` must export the **same three functions** as `masteryModel.js`, but the belief is sequence-based, not a per-skill scalar map.

**How sequence state lives behind the scalar-style contract:**

The LSTM needs the *history* of interactions to estimate mastery; BKT only needed a per-skill scalar. We reconcile this by making the **belief object carry the raw interaction sequence**, then re-running stateless inference:

```js
belief = {
  seq:    [{ skill, correct }, ...],  // last SEQ_LEN interactions, oldest -> newest
  cache:  Float32Array | null,        // last per-skill P(correct) vector (memoized)
}
```

- `createInitialBelief()` → `{ seq: [], cache: null }` (cold start — no history).
- `updateBelief(belief, skillId, correct)` → returns a **new** belief with the interaction appended (sliding window capped at `SEQ_LEN`), `cache` invalidated. Pure/immutable, exactly like BKT.
- `getMastery(belief, skillId)` → encodes `belief.seq` into a `(1, SEQ_LEN, 26)` padded tensor, runs `model.predict` **once**, reads `output[last_real_timestep][skillIndex]`, returns it. Result memoized into `belief.cache` so repeated `getMastery` calls over the same belief don't re-infer. Returns the prior `P(L0)=0.2` (matching BKT's cold start) when `seq` is empty or the model isn't loaded.

**Why re-run inference instead of carrying the LSTM hidden state?**
1. **Contract purity.** BKT's `updateBelief` is pure and immutable; the engine and tests rely on that (e.g. engine-core's "does not mutate the input belief" test). A persisted LSTM cell/hidden state is a mutable side-channel that breaks immutability and is awkward to serialize into IndexedDB (`mastery_state`).
2. **Statelessness matches persistence.** The app already persists the **interaction sequence** (`interaction_log`, `getInteractionLog(50)`). Reconstructing belief from the log on `initEngine` is trivial when belief == sequence; reconstructing an opaque LSTM hidden state is not.
3. **Cost is negligible.** `SEQ_LEN=50` over a 100-unit LSTM is < 30 ms per inference (verified in Task 10), and we memoize, so a single attempt costs one forward pass — well within the §8.3 budget.
4. **Determinism for tests.** Re-running from the full sequence yields identical output every time; carried hidden state depends on call order and dropout RNG state.

The stateful alternative (carry `tf` cell+hidden state, call the LSTM cell once per interaction) is faster *per step* but is documented as a v2 optimization in Open Questions, not implemented here.

**Files:**
- Create: `src/engine/masteryModelDKT.js`
- Create: `src/engine/masteryModelDKT.test.js`

- [ ] **Step 1: Write the failing test (mocked model — no real model file needed)**

Create `src/engine/masteryModelDKT.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SKILL_IDS } from './knowledgeGraph';
import {
  NUM_SKILLS,
  INPUT_DIM,
  SEQ_LEN,
  encodeInteraction,
  createInitialBelief,
  updateBelief,
  getMastery,
  __setModelForTest,
} from './masteryModelDKT';

// A fake tf.LayersModel whose predict() returns a known per-skill vector that
// depends on how many CORRECT interactions the sequence holds — enough to test
// "rises after correct, falls after incorrect" without training a real net.
function makeFakeModel() {
  return {
    predict(inputTensor) {
      // inputTensor is a tf.Tensor of shape [1, SEQ_LEN, INPUT_DIM].
      const data = inputTensor.dataSync(); // Float32Array length SEQ_LEN*INPUT_DIM
      // LOCKED one-hot convention: hot index = skill_idx*2 + correct, so a CORRECT
      // interaction is an ODD hot index; an incorrect one is EVEN.
      let correctCount = 0;
      let lastReal = -1;
      for (let t = 0; t < SEQ_LEN; t++) {
        const base = t * INPUT_DIM;
        let isReal = false;
        for (let k = 0; k < INPUT_DIM; k++) {
          if (data[base + k] === 1) {
            isReal = true;
            if (k % 2 === 1) correctCount += 1; // odd index == answered-correctly
          }
        }
        if (isReal) lastReal = t;
      }
      // Map correctCount -> a probability in (0,1), monotone increasing.
      const p = 1 / (1 + Math.exp(-(correctCount - 1)));
      // Build [1, SEQ_LEN, NUM_SKILLS], same p for every skill at every timestep.
      const out = new Float32Array(SEQ_LEN * NUM_SKILLS).fill(p);
      return {
        // getMastery reads [0, lastReal, skillIndex]; provide arraySync().
        arraySync: () => {
          const seq = [];
          for (let t = 0; t < SEQ_LEN; t++) {
            const row = new Array(NUM_SKILLS).fill(p);
            seq.push(row);
          }
          return [seq];
        },
        _lastReal: lastReal,
        dispose() {},
      };
    },
  };
}

describe('masteryModelDKT — dims', () => {
  it('derives 26-dim input and 13-dim output from SKILL_IDS (not 24/12)', () => {
    expect(NUM_SKILLS).toBe(SKILL_IDS.length);
    expect(NUM_SKILLS).toBe(13);
    expect(INPUT_DIM).toBe(26);
    expect(SEQ_LEN).toBe(50);
  });

  it('encodes (skill, correct) with the LOCKED one-hot convention idx*2 + correct', () => {
    const idx = SKILL_IDS.indexOf('addition');
    const v = encodeInteraction('addition', true);
    expect(v).toHaveLength(INPUT_DIM);
    expect(v[idx * 2 + 1]).toBe(1);            // correct -> odd slot
    expect(v.reduce((a, b) => a + b, 0)).toBe(1);
    const w = encodeInteraction('addition', false);
    expect(w[idx * 2 + 0]).toBe(1);            // incorrect -> even slot
  });

  it('encodeInteraction matches the data-producer dkt_input_idx for every skill', () => {
    SKILL_IDS.forEach((sid, idx) => {
      expect(encodeInteraction(sid, false).indexOf(1)).toBe(idx * 2 + 0);
      expect(encodeInteraction(sid, true).indexOf(1)).toBe(idx * 2 + 1);
    });
  });
});

describe('masteryModelDKT — backend contract parity with BKT', () => {
  beforeEach(() => __setModelForTest(makeFakeModel()));

  it('cold start returns the prior 0.2 for every skill (matches BKT pL0)', () => {
    const b = createInitialBelief();
    expect(getMastery(b, 'addition')).toBeCloseTo(0.2, 5);
  });

  it('mastery rises after a correct answer', () => {
    let b = createInitialBelief();
    const before = getMastery(b, 'addition');
    b = updateBelief(b, 'addition', true);
    const after = getMastery(b, 'addition');
    expect(after).toBeGreaterThan(before);
  });

  it('mastery falls (relative to all-correct) after an incorrect answer', () => {
    let correct = updateBelief(createInitialBelief(), 'addition', true);
    correct = updateBelief(correct, 'addition', true);
    let mixed = updateBelief(createInitialBelief(), 'addition', true);
    mixed = updateBelief(mixed, 'addition', false);
    expect(getMastery(mixed, 'addition')).toBeLessThan(getMastery(correct, 'addition'));
  });

  it('always returns a value in [0,1]', () => {
    let b = createInitialBelief();
    for (let i = 0; i < 60; i++) b = updateBelief(b, 'addition', i % 2 === 0);
    const m = getMastery(b, 'addition');
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });

  it('does not mutate the input belief (immutability, like BKT)', () => {
    const b = createInitialBelief();
    updateBelief(b, 'addition', true);
    expect(b.seq).toHaveLength(0);
  });

  it('caps the sequence window at SEQ_LEN interactions', () => {
    let b = createInitialBelief();
    for (let i = 0; i < SEQ_LEN + 10; i++) b = updateBelief(b, 'addition', true);
    expect(b.seq.length).toBe(SEQ_LEN);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npm test -- masteryModelDKT
```
Expected: FAIL (cannot resolve `./masteryModelDKT`).

- [ ] **Step 3: Write the DKT backend**

Create `src/engine/masteryModelDKT.js`:
```js
// Layer 2 alternative backend: Deep Knowledge Tracing (TF.js, inference only).
// Exports the SAME three functions as masteryModel.js (BKT) so it drops into
// engineAPI via the backend flag. Belief is sequence-based (the LSTM needs
// history), but the public read (getMastery) is still a scalar in [0,1].
//
// Dimensions derive from SKILL_IDS (13 skills): input 2*13=26, output 13.
import * as tf from '@tensorflow/tfjs';
import { SKILL_IDS } from './knowledgeGraph';

export const NUM_SKILLS = SKILL_IDS.length; // 13
export const INPUT_DIM = 2 * NUM_SKILLS;    // 26
export const SEQ_LEN = 50;                  // spec §5.1
export const PRIOR = 0.2;                   // cold-start mastery (matches BKT pL0)

// Default model location (tfjs LayersModel). public/ is served at the web root.
const DEFAULT_MODEL_URL = '/models/dkt/model.json';

let _model = null;        // loaded tf.LayersModel (singleton)
let _loadPromise = null;  // de-dupe concurrent loads

// Test seam: inject a fake model (see masteryModelDKT.test.js).
export function __setModelForTest(model) {
  _model = model;
}

/** Load the tfjs model once. Call from initEngine when the DKT flag is on. */
export async function loadModel(url = DEFAULT_MODEL_URL) {
  if (_model) return _model;
  if (!_loadPromise) {
    _loadPromise = tf.loadLayersModel(url).then((m) => {
      _model = m;
      return m;
    });
  }
  return _loadPromise;
}

const skillIndex = (skillId) => SKILL_IDS.indexOf(skillId);

/**
 * One-hot the (skill, correct) pair. LOCKED convention (data-producer plan,
 * schema.dkt_input_index): hot index = skillIndex*2 + (correct ? 1 : 0).
 * Even slot = answered-incorrectly, odd slot = answered-correctly.
 */
export function encodeInteraction(skillId, correct) {
  const v = new Float32Array(INPUT_DIM);
  const idx = skillIndex(skillId);
  if (idx >= 0) v[idx * 2 + (correct ? 1 : 0)] = 1;
  return v;
}

/** Cold-start belief: empty interaction sequence, no cached prediction. */
export function createInitialBelief() {
  return { seq: [], cache: null };
}

/**
 * Append an interaction; return a NEW belief (immutable, like BKT).
 * Sliding window capped at the last SEQ_LEN interactions.
 */
export function updateBelief(belief, skillId, correct) {
  const prev = belief?.seq ?? [];
  const seq = [...prev, { skill: skillId, correct: !!correct }].slice(-SEQ_LEN);
  return { seq, cache: null }; // cache invalidated; recomputed lazily on read
}

/**
 * Per-skill P(correct) for the LATEST timestep, in [0,1].
 * Returns PRIOR on cold start or if the model isn't loaded yet (graceful
 * degradation — engineAPI loads the model in initEngine before first read).
 */
export function getMastery(belief, skillId) {
  const seq = belief?.seq ?? [];
  if (seq.length === 0 || !_model) return PRIOR;

  if (!belief.cache) belief.cache = _runInference(seq); // memoize on the belief
  const idx = skillIndex(skillId);
  if (idx < 0) return PRIOR;
  const m = belief.cache[idx];
  // Clamp defensively so the contract guarantee (value in [0,1]) always holds.
  return Math.min(1, Math.max(0, m));
}

/** Run one forward pass over the padded sequence; return the last row (length NUM_SKILLS). */
function _runInference(seq) {
  // Build a (1, SEQ_LEN, INPUT_DIM) padded buffer (right-aligned newest-last).
  const buf = new Float32Array(SEQ_LEN * INPUT_DIM); // zeros = padding
  const start = SEQ_LEN - seq.length;                // left-pad
  for (let i = 0; i < seq.length; i++) {
    const v = encodeInteraction(seq[i].skill, seq[i].correct);
    buf.set(v, (start + i) * INPUT_DIM);
  }
  const lastReal = SEQ_LEN - 1; // newest interaction sits at the last slot

  return tf.tidy(() => {
    const input = tf.tensor3d(buf, [1, SEQ_LEN, INPUT_DIM]);
    const out = _model.predict(input);          // (1, SEQ_LEN, NUM_SKILLS)
    const rows = out.arraySync()[0];             // SEQ_LEN x NUM_SKILLS
    return rows[lastReal];                       // length NUM_SKILLS
  });
}
```

> Note on the fake-model test: the fake's `predict` returns an object with `arraySync()`; `_runInference` calls `tf.tidy` which is a real tf util that simply runs the fn, and `tf.tensor3d` builds a real tensor whose `dataSync()` the fake reads. The fake ignores `dispose` semantics — fine for unit tests. The clamp + last-row read are exercised by the real model in Task 9's smoke test.

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
npm test -- masteryModelDKT
```
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/engine/masteryModelDKT.js src/engine/masteryModelDKT.test.js
git commit -m "feat(engine): add TF.js DKT mastery backend with sequence belief"
```

---

### Task 8: Backend feature flag in `engineAPI.js`

Let `engineAPI.js` choose BKT (default) or DKT via one config value, with **no other code change**. The decision layer and public API are untouched.

**Files:**
- Create: `src/engine/backendConfig.js`
- Create: `src/engine/masteryBackend.js`
- Modify: `src/engine/engineAPI.js`
- Create: `src/engine/masteryBackend.test.js`

> The challenge: BKT's `createInitialBelief`/`updateBelief`/`getMastery` are synchronous and pure; DKT's `getMastery` needs a loaded model. The shim keeps both behind one synchronous interface and adds an async `ensureBackendReady()` that `initEngine` awaits (a no-op for BKT, model load for DKT). `engineAPI` already has `initEngine`, so this slots in cleanly.

- [ ] **Step 1: Write the failing test**

Create `src/engine/masteryBackend.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { MASTERY_BACKEND } from './backendConfig';
import { activeBackend, ensureBackendReady } from './masteryBackend';

describe('masteryBackend shim', () => {
  it('defaults to the BKT backend', () => {
    expect(MASTERY_BACKEND).toBe('bkt');
  });

  it('exposes the three-function contract', () => {
    expect(typeof activeBackend.createInitialBelief).toBe('function');
    expect(typeof activeBackend.updateBelief).toBe('function');
    expect(typeof activeBackend.getMastery).toBe('function');
  });

  it('ensureBackendReady resolves for the default (BKT no-op)', async () => {
    await expect(ensureBackendReady()).resolves.toBeUndefined();
  });

  it('the resolved backend behaves like BKT (rises after correct)', () => {
    const b0 = activeBackend.createInitialBelief();
    const b1 = activeBackend.updateBelief(b0, 'addition', true);
    expect(activeBackend.getMastery(b1, 'addition'))
      .toBeGreaterThan(activeBackend.getMastery(b0, 'addition'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
npm test -- masteryBackend
```
Expected: FAIL (cannot resolve `./backendConfig`).

- [ ] **Step 3: Create the flag**

Create `src/engine/backendConfig.js`:
```js
// Mastery-backend selector. Change this ONE value to swap the whole engine's
// mastery estimator. 'bkt' (default, pure JS, no model file) or 'dkt' (TF.js).
// Can be overridden at build time via Vite env: VITE_MASTERY_BACKEND=dkt.
const fromEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_MASTERY_BACKEND
    : undefined;

export const MASTERY_BACKEND = fromEnv === 'dkt' ? 'dkt' : 'bkt';
```

- [ ] **Step 4: Create the shim**

Create `src/engine/masteryBackend.js`:
```js
// Resolves the active mastery backend from the feature flag and presents ONE
// uniform interface to engineAPI. Both backends export the same three functions;
// only DKT needs an async model load, abstracted behind ensureBackendReady().
import { MASTERY_BACKEND } from './backendConfig';
import * as bkt from './masteryModel';
import * as dkt from './masteryModelDKT';

export const activeBackend = MASTERY_BACKEND === 'dkt' ? dkt : bkt;

/** Idempotent readiness hook. No-op for BKT; loads the model for DKT. */
export async function ensureBackendReady() {
  if (MASTERY_BACKEND === 'dkt' && typeof dkt.loadModel === 'function') {
    await dkt.loadModel();
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run:
```bash
npm test -- masteryBackend
```
Expected: PASS.

- [ ] **Step 6: Rewire `engineAPI.js` to use the shim**

In `src/engine/engineAPI.js`, replace the backend import (currently line 3):
```js
import { createInitialBelief, updateBelief, getMastery as bktMastery } from './masteryModel';
```
with:
```js
import { activeBackend, ensureBackendReady } from './masteryBackend';
const { createInitialBelief, updateBelief, getMastery: bktMastery } = activeBackend;
```

Then, in `initEngine`, await readiness before hydrating (so the DKT model is loaded before the first `getMastery`). Change:
```js
export async function initEngine() {
  const saved = await loadMasteryState();
  state = saved ? { ...emptyState(), ...saved } : emptyState();
  return state;
}
```
to:
```js
export async function initEngine() {
  await ensureBackendReady();          // BKT: no-op | DKT: loads the tfjs model
  const saved = await loadMasteryState();
  state = saved ? { ...emptyState(), ...saved } : emptyState();
  return state;
}
```

> No other engineAPI change is needed: `bktMastery` (now the active backend's `getMastery`), `createInitialBelief`, and `updateBelief` keep their names and call sites. The variable alias `bktMastery` is left as-is to minimize the diff; it now points at whichever backend is active. (Optional cleanup: rename to `readMastery` — flagged in Open Questions, not required.)

- [ ] **Step 7: Run the full engine suite to confirm no regression (BKT still default)**

Run:
```bash
npm test
```
Expected: PASS — all existing engine + db tests green (the default flag keeps BKT active, so engineAPI behavior is unchanged). The DKT and shim tests also pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/backendConfig.js src/engine/masteryBackend.js src/engine/masteryBackend.test.js src/engine/engineAPI.js
git commit -m "feat(engine): add BKT/DKT backend feature flag and resolver shim"
```

---

### Task 9: Real-model smoke test + commit the artifact

Once `public/models/dkt/model.json` exists (from Task 5 Step 5 on real data, or a placeholder small model), prove the JS backend loads and infers against the actual file. Until the synthetic data lands, generate a **tiny untrained model** so the load path is verified end-to-end.

**Files:**
- Create: `scripts/export_placeholder_model.py` (temporary; documents how a real artifact is produced)
- Create: `src/engine/masteryModelDKT.smoke.test.js`

- [ ] **Step 1: Produce a loadable model artifact**

If real training (Task 5 Step 5) has run, `public/models/dkt/` already holds the trained model — skip to Step 2. Otherwise create a tiny untrained one so the JS load path is testable now.

Create `scripts/export_placeholder_model.py`:
```python
"""Export an UNTRAINED DKT model so the JS load/inference path is testable
before the synthetic dataset exists. Replace with the trained artifact (Task 5)
before shipping. Usage: venv/bin/python scripts/export_placeholder_model.py
"""
from train_dkt import build_dkt_model, export_tfjs

if __name__ == "__main__":
    export_tfjs(build_dkt_model(), "public/models/dkt", quantize_int8=True)
    print("[dkt] wrote untrained placeholder to public/models/dkt (REPLACE before ship)")
```
Run:
```bash
venv/bin/python scripts/export_placeholder_model.py
ls -la public/models/dkt
```
Expected: `model.json` + a `.bin` shard exist.

- [ ] **Step 2: Write a load-and-infer smoke test (real file)**

Create `src/engine/masteryModelDKT.smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MODEL_PATH = resolve(process.cwd(), 'public/models/dkt/model.json');
const hasModel = existsSync(MODEL_PATH);

// Skip gracefully if no artifact has been exported yet (keeps CI green pre-data).
describe.skipIf(!hasModel)('masteryModelDKT — real model smoke test', () => {
  it('loads the exported tfjs model and infers a value in [0,1]', async () => {
    const mod = await import('./masteryModelDKT');
    // tf.loadLayersModel accepts a file:// URL under Node.
    await mod.loadModel(pathToFileURL(MODEL_PATH).href);
    let b = mod.createInitialBelief();
    b = mod.updateBelief(b, 'addition', true);
    b = mod.updateBelief(b, 'addition', true);
    const m = mod.getMastery(b, 'addition');
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run the smoke test**

Run:
```bash
npm test -- masteryModelDKT.smoke
```
Expected: PASS (1 passed) if the artifact exists; SKIPPED otherwise. (`@tensorflow/tfjs` under Node loads the model from a `file://` URL via the CPU backend.)

> If load fails with "io handler" / file-scheme errors under pure `@tensorflow/tfjs` in Node, add `@tensorflow/tfjs-node` as a **devDependency only** for this test (`npm i -D @tensorflow/tfjs-node --legacy-peer-deps`) and import it at the top of the smoke test. The browser does not need tfjs-node. Flagged in Open Questions.

- [ ] **Step 4: Commit the artifact + smoke test**

```bash
git add public/models/dkt/model.json public/models/dkt/*.bin \
        src/engine/masteryModelDKT.smoke.test.js scripts/export_placeholder_model.py
git commit -m "feat(dkt): export model artifact + JS load/inference smoke test"
```

> **Before shipping:** replace the placeholder artifact with the AUC-gated trained model from Task 5 Step 5 and re-commit. Note in the commit which one is present.

---

### Task 10: Performance verification (§8.3 inference < 30 ms, load < 2 s)

Spec §8.3 targets are **on a mid-range Android device**. Physical-device testing is **out of scope** for this plan (no device lab). We instead (a) add a Node micro-benchmark that catches gross regressions, and (b) document the in-browser DevTools method the team runs manually for the report's Results chapter.

**Files:**
- Create: `src/engine/perf-dkt.bench.test.js`
- Modify: `src/engine/README.md`

- [ ] **Step 1: Add a Node inference micro-benchmark**

Create `src/engine/perf-dkt.bench.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const MODEL_PATH = resolve(process.cwd(), 'public/models/dkt/model.json');
const hasModel = existsSync(MODEL_PATH);

// Node CPU timing is NOT the §8.3 device target; it only flags gross regressions.
describe.skipIf(!hasModel)('masteryModelDKT — inference perf (Node, indicative)', () => {
  it('infers a single attempt well under a loose Node ceiling', async () => {
    const mod = await import('./masteryModelDKT');
    await mod.loadModel(pathToFileURL(MODEL_PATH).href);

    let b = mod.createInitialBelief();
    for (let i = 0; i < SEQ_LEN_GUESS(); i++) b = mod.updateBelief(b, 'addition', i % 2 === 0);

    // Warm up (first call compiles kernels).
    mod.getMastery(b, 'addition');

    const runs = 20;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      // bust the per-belief memo each run by appending one interaction
      b = mod.updateBelief(b, 'addition', true);
      mod.getMastery(b, 'addition');
    }
    const perCall = (performance.now() - t0) / runs;
    // Loose Node CPU ceiling (device target is < 30 ms on mobile WebGL).
    expect(perCall).toBeLessThan(200);
  });
});

function SEQ_LEN_GUESS() { return 50; }
```

- [ ] **Step 2: Run the benchmark**

Run:
```bash
npm test -- perf-dkt
```
Expected: PASS (or SKIPPED if no artifact). Logs nothing by default; the ceiling is generous because Node CPU ≠ mobile WebGL.

- [ ] **Step 3: Document the real (browser) verification method in the README**

Append to `src/engine/README.md`:
```markdown

## DKT backend (optional swap)

`masteryModel.js` ships the **BKT** backend (default). The **DKT** backend
(`masteryModelDKT.js`) is a TF.js LSTM with the same three exports. Select it
with the flag in `backendConfig.js` or `VITE_MASTERY_BACKEND=dkt`. Nothing else
changes — `initEngine()` loads the model (`public/models/dkt/model.json`).

DKT belief is sequence-based: it stores the last 50 interactions and re-runs
inference on read (memoized per belief), staying immutable/serializable like BKT.

### Performance verification (spec §8.3: inference < 30 ms, load < 2 s)
Targets are for a mid-range Android device; physical-device testing is out of
scope here. Method for the report's Results chapter:
1. `VITE_MASTERY_BACKEND=dkt npm run build && npm run preview`, open in mobile
   Chrome (or DevTools device emulation, Redmi-Note-class CPU throttle 4x).
2. **Model load:** DevTools → Network, reload, read the `model.json` + `.bin`
   transfer + parse time; or wrap `loadModel()` in `performance.now()`.
3. **Inference:** DevTools → Performance, record while answering; or log
   `performance.now()` around `getMastery`. Confirm < 30 ms/attempt, < 2 s load.
4. The Node micro-benchmark (`perf-dkt.bench.test.js`) only guards against gross
   regressions — it is NOT the device target.
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/perf-dkt.bench.test.js src/engine/README.md
git commit -m "test(dkt): add inference micro-benchmark + document §8.3 perf method"
```

---

### Task 11: Training README + final verification

**Files:**
- Create: `scripts/README.md`

- [ ] **Step 1: Write the training README**

Create `scripts/README.md`:
```markdown
# DKT training (`scripts/`)

Off-device pipeline that produces `public/models/dkt/`. Inference is on-device
in `src/engine/masteryModelDKT.js`.

## Setup
```bash
venv/bin/python -m pip install --upgrade pip
venv/bin/pip install -r ../requirements-dkt.txt   # from repo root: -r requirements-dkt.txt
venv/bin/python -m pytest scripts -q              # model/encoder/AUC/export tests
```
Apple-Silicon / Python 3.9: if the `tensorflow` wheel won't install, use a 3.10/3.11
venv, or train on Colab (below). The model is a tiny LSTM — CPU training is fine.

## Train + export (needs the synthetic dataset)
```bash
venv/bin/python train_dkt.py \
  --data ../data/synthetic/trajectories.parquet \
  --out  ../public/models/dkt \
  --epochs 30 --batch-size 64 --val-split 0.2 --auc-gate 0.85
# add --quantize-int8 if the export exceeds ~3 MB (spec §10)
```
`trajectories.parquet` (+ `trajectories.meta.json`) is produced by the
**data-producer plan** (`docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md`);
the locked schema is in that plan's `docs/data/TRAJECTORY_SCHEMA.md`. It MUST be
implemented first.

## Colab (no local TF needed)
```python
!pip install tensorflow tensorflowjs scikit-learn pandas pyarrow
# upload train_dkt.py + trajectories.parquet + trajectories.meta.json, then:
from train_dkt import build_dkt_model, train, evaluate_auc, export_tfjs, load_dataset
ds = load_dataset("trajectories.parquet")   # reads the .meta.json sidecar too
# split by student, train, check AUC >= 0.85, export_tfjs(model, "dkt"), download the folder
```

## Dimensions (IMPORTANT)
13 skills -> input one-hot dim = 26, output dim = 13. NOT the spec's 24/12.
Skill ordering = `src/engine/knowledgeGraph.js` SKILL_IDS, surfaced to Python via
the data-producer's `trajectories.meta.json` `skill_ids`. One-hot index convention
is LOCKED: `dkt_input_idx = skill_idx * 2 + correct` (Python encoder, JS encoder,
and the dataset all agree).
```

- [ ] **Step 2: Full verification sweep**

Run:
```bash
venv/bin/python -m pytest scripts -q          # Python: all green
npm test                                       # JS: all green (BKT default unchanged)
npm run lint                                    # no new errors in src/engine/**
npm run build                                   # build succeeds
```
Expected: Python tests pass; JS tests pass (DKT/shim/smoke/perf included, smoke+perf SKIPPED if no artifact); lint clean; build succeeds.

- [ ] **Step 3: Optional — verify the DKT path builds**

Run:
```bash
VITE_MASTERY_BACKEND=dkt npm run build
```
Expected: build succeeds with `@tensorflow/tfjs` bundled. (Confirms the flag path compiles; runtime perf is verified per Task 10's documented method.)

- [ ] **Step 4: Commit**

```bash
git add scripts/README.md
git commit -m "docs(dkt): add training README and finalize pipeline"
```

---

## Self-Review

**1. Spec coverage (DKT pipeline slice):**
- §5.1 model spec (1-layer LSTM, 100 units, dropout 0.2, per-skill sigmoid, BCE next-step, Adam 1e-3, seq 50) → Task 3 (`build_dkt_model`) + Task 4 (masked next-step loss). Input dim corrected 24→26, output 12→13. ✅
- §5.2 DKT rationale → informational; no code (BKT remains the default/fallback per §10). ✅
- §5.4 deployment pipeline (train → tfjs → browser) → Tasks 3–5 (train/export) + Tasks 6–9 (browser load/infer). ✅
- §8.1 AUC ≥ 0.85 → Task 5 CLI `--auc-gate 0.85` enforced on held-out data; eval plumbing tested on toy set in Task 4. ✅
- §8.3 inference < 30 ms / load < 2 s → Task 10 (Node micro-bench + documented browser method; physical-device noted out of scope). ✅
- §10 int8 quantization + BKT fallback → Task 5 (`--quantize-int8`, `quantization_dtype_map`) + Task 8 (flag defaults to BKT; DKT is opt-in). ✅

**2. Contract parity:** `masteryModelDKT.js` exports `createInitialBelief`, `updateBelief`, `getMastery` with the same signatures as `masteryModel.js`; the immutability and [0,1] guarantees are tested (Task 7). The shim (Task 8) presents one interface; `engineAPI` changes only its import line + one `await` in `initEngine`. ✅

**3. Dimension consistency:** `NUM_SKILLS`/`INPUT_DIM`/`SEQ_LEN` derive from `SKILL_IDS.length` in JS and from the data-producer's `*.meta.json` `num_skills` (asserted == 13) in Python; the one-hot index convention (`skill_idx*2 + correct`, the data-producer's locked `dkt_input_idx`) is identical in `encode_interaction`/`frame_to_windows` (Py) and `encodeInteraction` (JS), exhaustively asserted against the producer convention in both test suites. ✅

**4. Placeholder scan:** No "TBD"/"similar to above". Every code step has complete code. Two explicitly-blocked steps (Task 5 Step 5, Task 9 Step 1 trained artifact) depend on the synthetic dataset and are clearly marked BLOCKED-ON-DEPENDENCY with a placeholder-model workaround so the rest of the plan is executable now. ✅

**5. Train-script vs notebook:** Chose `scripts/train_dkt.py` (testable, diffable, Colab-compatible via import) over `.ipynb`; justified in the DECISION section. ✅

**6. Sequence-state handling:** Belief carries the raw interaction sequence (capped at SEQ_LEN) + a memoized prediction cache; `getMastery` re-runs stateless inference. Rationale (immutability, serialization, cost, determinism) documented in Task 7; stateful-LSTM alternative deferred to Open Questions. ✅

---

## Open Questions

1. **Local vs Colab training.** This machine is arm64 macOS / Python 3.9.6; the `tensorflow` wheel may not install cleanly there. Plan provides three paths (plain wheel via marker, a 3.10/3.11 venv, or Colab via the import-safe script). **Q:** Do we standardize on a 3.11 venv for reproducibility, or accept Colab for the full 10k-student run and keep local for toy tests only?

2. **Sequence-state strategy.** This plan re-runs full-sequence inference per read (memoized) for immutability/serializability. **Q:** If the device perf budget (§8.3) is tight in practice, do we switch to a stateful LSTM (carry tf cell+hidden state, one cell-step per interaction) in v2, accepting mutable, non-serializable belief? (Faster per step; harder to persist/reconstruct from `interaction_log`.)

3. **24→26 input-dim correction.** The plan deliberately diverges from spec §5.1's `2×12=24` because the shipped graph has 13 skills (`2×13=26`). **Q:** Confirm with the guide that 13 skills is final (the spec's "12 nodes" heading vs 13-row table is unresolved, per engine-core review). If the graph ever changes skill count, the model must be retrained and the artifact regenerated — there is no runtime reshape.

4. **BKT→DKT cutover risk (§10).** DKT ships as **opt-in** (flag defaults to BKT) precisely to de-risk: if DKT under-trains (AUC < 0.85) or is slow on-device, the demo runs on BKT with one config flip and zero code change. **Q:** For the final demo, do we cut over to DKT, or present DKT as "trained, validated, swappable" while demoing on BKT? (Mirrors spec §13 Open Question #5.) Risk: belief shapes differ (BKT scalar map vs DKT sequence), so persisted `mastery_state` is **not** interchangeable across a live cutover — switching backends should clear/rebuild belief from `interaction_log`, not load the other backend's saved state. This belief-shape incompatibility needs an explicit migration note in the synthetic-data/integration plan.

5. **Synthetic-data schema lock — RESOLVED.** The data-producer plan (`2026-05-22-synthetic-data-and-evaluation.md`) now exists and is the **single source of truth** for the training data. This plan was updated to consume the producer's **long-format Parquet** (`trajectories.parquet` + `trajectories.meta.json`) directly — there is no self-defined `.npz`/`skills.json` here anymore — and the one-hot convention is the producer's locked `dkt_input_idx = skill_idx*2 + correct`, identical in the Python encoder (`encode_interaction`/`frame_to_windows`), the JS encoder (`encodeInteraction`), and the dataset. **Remaining Q:** ordering of execution — the producer MUST be implemented before this plan's Task 5 (real training) / Task 9 (trained artifact). The placeholder model (Task 9) keeps everything else runnable in the meantime.

6. **tfjs-node for the smoke test.** Pure `@tensorflow/tfjs` may not load a `file://` model under Node; the plan falls back to a `-D @tensorflow/tfjs-node` devDependency for the smoke/perf tests only (browser unaffected). **Q:** Accept the extra dev dependency, or gate the smoke test behind an env flag and rely on the in-browser verification (Task 10) instead?

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-dkt-pipeline.md`.

**Hard dependency:** Tasks 5 (real training) and 9 (trained artifact) are BLOCKED on the **data-producer plan** (`2026-05-22-synthetic-data-and-evaluation.md`), which produces `data/synthetic/trajectories.parquet` + `trajectories.meta.json` in the LOCKED long-format schema this plan now consumes. **Implement the data-producer plan first.** Everything else (env, model builder, encoder, `frame_to_windows`/`load_dataset`, masked training, AUC plumbing, tfjs export path, the full JS DKT backend, the feature flag, and the load/perf test scaffolds with a placeholder model) is executable now via the in-test toy long-format fixture. Recommended order: implement the data producer, then run the AUC gate on real trajectories before the BKT→DKT cutover decision.
