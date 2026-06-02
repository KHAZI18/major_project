import os

import numpy as np
import pandas as pd
import pytest

from train_dkt import (
    build_dkt_model,
    encode_interaction,
    NUM_SKILLS,
    SEQ_LEN,
    INPUT_DIM,
    gather_target_predictions,
    train,
    evaluate_auc,
    make_toy_frame,
    frame_to_windows,
    make_toy_dataset,
    export_tfjs,
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
