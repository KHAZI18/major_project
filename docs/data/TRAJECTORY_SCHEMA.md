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
