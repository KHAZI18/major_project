# Review — DKT Model Pipeline Plan

**Plan:** `docs/superpowers/plans/2026-05-22-dkt-pipeline.md`
**Reviewer:** independent reviewer-and-fixer (fixes applied directly to the plan)
**Date:** 2026-05-22
**Backend contract under test:** `src/engine/masteryModel.js` (`createInitialBelief`, `updateBelief`, `getMastery`); swap point `src/engine/engineAPI.js`; dims from `src/engine/knowledgeGraph.js` (`SKILL_IDS.length = 13`).
**Data producer (single source of truth):** `docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md`.

---

## Verdict

**APPROVE WITH FIXES — all applied.** The plan is sound in shape: a correct §5.1 Keras LSTM, a faithful three-export JS backend that drops into `engineAPI.js`, a feature flag, and runnable placeholders for the blocked steps. Its **one CRITICAL defect was a divergent data schema** — it invented its own `data/synthetic/trajectories.npz` (arrays `X/Y_skill/Y_correct/mask`) + `skills.json` manifest with the one-hot convention `skill_index + correct*NUM_SKILLS`, which **contradicts the data-producer plan** (long-format Parquet, `dkt_input_idx = skill_idx*2 + correct`, `*.meta.json` sidecar). This is now fixed: the plan reads the producer's format exactly, and the locked `skill_idx*2 + correct` convention is used in the Python encoder, the windowing builder, the JS encoder, and every test. Final dims are correct: **input = 2×13 = 26, output = 13**, derived (not hard-coded).

The pytest shape/one-step-train tests and the vitest interface-contract tests would pass after the fixes (a test-position bug introduced/avoided during the rewrite was corrected — see MAJOR-2). No unrunnable placeholders remain.

---

## Findings

### [CRITICAL-1] Divergent training-data schema and one-hot convention — FIXED
The plan defined its own `.npz` schema (`X`, `Y_skill`, `Y_correct`, `mask`) and a `skills.json` manifest, with one-hot index `skill_index + correct*NUM_SKILLS`. The data-producer plan emits a **long-format Parquet** (`trajectories.parquet`, one row per interaction) + `trajectories.meta.json`, with one-hot index `dkt_input_idx = skill_idx*2 + correct`. These are mutually incompatible: same 26 dims, but a completely different slot layout, so a model trained on one and served by the other would silently mis-predict every interaction.

**Fix applied:**
- Rewrote the "Dependencies" section into a "Canonical data contract" section that **reads from the producer** (columns, dtypes, meta sidecar) and labels the producer as a hard, implement-first dependency.
- Replaced the `.npz` `load_dataset` with one that reads Parquet/CSV, derives `num_skills`/ordering from `trajectories.meta.json` (asserts `== 13`), and **validates the locked invariant** `dkt_input_idx == skill_idx*2 + correct` before training.
- Added `frame_to_windows(df, …)` to convert the producer's long format into the padded `(N, 50, 26)` training tensors per the producer's "DKT consumption recipe" (group by `student_id`, sort by `step_idx`, next-step targets, mask, never read `latent_ability`).
- Replaced the `.npz`-shaped `make_toy_dataset` with `make_toy_frame()` (long-format) → `frame_to_windows()` so tests exercise the real load path.
- Changed the one-hot convention to `skill_idx*2 + correct` **everywhere**: `encode_interaction` (Py), `encodeInteraction` (JS), the fake test model (now treats odd hot index = correct), and all assertions. Added exhaustive parity tests in both suites that check `argmax == skill_idx*2 + correct` for all 13 skills.
- Updated `requirements-dkt.txt` to add `pandas`/`pyarrow` (needed to read Parquet), pinned to the producer's versions.
- Updated `.gitignore` block, CLI `--data` default, docstrings, the README, the architecture diagram, Self-Review §3, Open Question #5, and Execution Handoff to the Parquet/`meta.json` reality.

### [MAJOR-1] `requirements-dkt.txt` could not read the producer's file — FIXED
The producer writes Parquet, but the DKT requirements listed only `numpy`/`scikit-learn`/TF. `pandas` + `pyarrow` were added (matching the producer's pins) so `load_dataset` actually works.

### [MAJOR-2] Left-padding vs. test index positions — FIXED (avoided)
`frame_to_windows` left-pads sequences (newest interaction at the last slot) to match the JS backend's right-aligned padding and to keep Keras `Masking` correct (leading zeros only). The new windowing test now asserts targets/masks at the right-aligned slots (`start = SEQ_LEN - L`), not at positions `0,1,2`, and asserts the leading region is all-padding. Without this, the freshly-added test would have failed against a correct implementation.

### [MAJOR-3] Expected pytest counts drifted — FIXED
Added tests (encoder parity in Task 3; `frame_to_windows` in Task 4) changed the cumulative counts. Updated the "Expected: PASS (N passed)" lines: Task 3 → 6, Task 4 → 10, Task 5 → 11.

### [MINOR-1] Keras `sample_weight` shape for masked BCE — noted, not blocking
`train()` passes a 3-D `sample_weight` (= `Y_skill * mask`) matching the target shape to weight per-element BCE down to the targeted skill + real timesteps. This is a supported TF 2.15 element-wise-weighting pattern and is the cleanest way to get next-step-only masked loss without a custom loss. It is slightly non-obvious; a custom masked-BCE `tf.keras.losses` would be more self-documenting. Left as-is (works, and the toy one-step-train test guards it), flagged for implementers.

### [MINOR-2] `Masking` + dropout interaction — acceptable
`LSTM(dropout=0.2)` applies input dropout; this matches §5.1 ("dropout 0.2"). Recurrent dropout is not requested by the spec and is intentionally omitted (it slows tfjs conversion and is not in the spec). No change.

### [MINOR-3] Feature-flag wiring — verified correct
`backendConfig.js` reads `VITE_MASTERY_BACKEND` via `import.meta.env` with a Node-safe guard; the shim (`masteryBackend.js`) resolves `activeBackend` and exposes `ensureBackendReady()`. `engineAPI.js` changes are exactly: the backend import line (now from the shim) + one `await ensureBackendReady()` in `initEngine`. This satisfies the "only the import line + one await" requirement. The `bktMastery` alias is retained to minimize the diff; both backends export the same three names so the alias now points at whichever backend is active. No change needed.

---

## Confirmations against review criteria

- **Keras §5.1:** 1-layer `LSTM(100, return_sequences=True, dropout=0.2)`, `Dense(13, sigmoid)`, `Adam(1e-3)`, `binary_crossentropy`, `SEQ_LEN=50`, `Masking(mask_value=0)`. Input/output dims derive from `NUM_SKILLS` (26 / 13), not hard-coded. Shape tests (`input_shape == (None,50,26)`, `output_shape == (None,50,13)`, single LSTM with 100 units & `return_sequences`) and the one-step-train test (`losses[-1] <= losses[0]`) would pass. No Keras API misuse beyond the noted (valid) `sample_weight` usage.
- **JS backend:** `masteryModelDKT.js` exports the same three functions with the same signatures as `masteryModel.js`, so it drops into `engineAPI.js` via the shim. The vitest contract holds against the fake model: cold start → `0.2` prior (matches BKT `pL0`), mastery rises after correct, falls relative to all-correct after incorrect, always in `[0,1]` (defensively clamped), immutable, sequence capped at `SEQ_LEN`.
- **Placeholders:** the two BLOCKED-ON-DEPENDENCY steps (Task 5 real training, Task 9 trained artifact) retain a runnable workaround — `scripts/export_placeholder_model.py` writes an untrained tfjs model so the JS load/infer path is testable now; toy long-format fixture exercises training/AUC/export. `@tensorflow/tfjs` install documented with `--legacy-peer-deps`.
- **Data schema + one-hot now match the producer:** YES — long-format Parquet + `trajectories.meta.json`, `dkt_input_idx = skill_idx*2 + correct`, num_skills from the sidecar, `latent_ability` never used as a feature.
- **Final dims:** input = **26**, output = **13** (both derived from `SKILL_IDS.length`).

---

## Open questions (for the guide / author)

1. **Local vs Colab training.** arm64 macOS + Python 3.9 may lack a working `tensorflow` wheel. Plan offers plain-wheel marker / 3.10–3.11 venv / Colab. Standardize on a 3.11 venv for reproducibility, or accept Colab for the full 10k-student run and keep local only for toy tests? (Note: Colab now also needs `pandas`/`pyarrow` to read the Parquet — the README was updated accordingly.)
2. **Sequence-state in the JS backend.** The plan stores the last 50 interactions in the belief and re-runs full-sequence stateless inference per read (memoized), chosen for immutability + serializability + reconstructability from `interaction_log`. If §8.3 on-device latency is tight, do we move to a stateful LSTM (carry cell+hidden state, one cell-step per interaction) in v2, accepting a mutable, non-serializable belief?
3. **BKT→DKT cutover / persistence incompatibility.** Belief shapes differ — BKT is a per-skill scalar map `{skillId: P}`, DKT is `{ seq, cache }`. Persisted `mastery_state` in IndexedDB is **not interchangeable** across a live backend switch; flipping the flag must clear/rebuild belief from `interaction_log`, not load the other backend's saved state. This needs an explicit migration note in the integration plan. For the final demo: cut over to DKT, or present it as "trained, validated, swappable" while demoing on BKT?
4. **Execution ordering.** This plan is now a hard downstream of the data-producer plan; the producer MUST be implemented before Task 5 (real training) / Task 9 (trained artifact). Confirm the producer lands first.

---

## Blocker

**No hard blocker to executing the non-data steps now.** The only dependency blocker is intrinsic and expected: real training (Task 5 Step 5) and the shipped trained artifact (Task 9) require `data/synthetic/trajectories.parquet` + `.meta.json` from the data-producer plan, which must be implemented first. Everything else (env, model, encoder, windowing, masked training, AUC plumbing, tfjs export, full JS backend, feature flag, placeholder-model load/perf tests) is runnable today.
