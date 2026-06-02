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
    import pandas as pd

    df = pd.read_csv(path) if str(path).endswith(".csv") else pd.read_parquet(path)

    # Derive num_skills/skill ordering from the producer's meta sidecar.
    meta_path = os.path.splitext(path)[0] + ".meta.json"
    num_skills = NUM_SKILLS
    if os.path.exists(meta_path):
        with open(meta_path) as fh:
            meta = json.loads(fh.read())
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
