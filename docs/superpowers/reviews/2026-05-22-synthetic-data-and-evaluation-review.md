# Plan Review — Synthetic Data Generator + Evaluation Harness

**Plan reviewed:** `docs/superpowers/plans/2026-05-22-synthetic-data-and-evaluation.md`
**Spec:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` (§5.3, §8.1, §8.2, §8.4)
**Engine sources cross-checked:** `src/engine/knowledgeGraph.js`, `src/engine/decisionLayer.js`, `src/engine/masteryModel.js`
**Dependent plan aligned:** `docs/superpowers/plans/2026-05-22-dkt-pipeline.md` (its `load_dataset()` is the consumer of the locked `.npz`)
**Date:** 2026-05-22
**Reviewer:** independent reviewer-and-fixer (this plan is the SINGLE SOURCE OF TRUTH for the training data). Fixes applied directly to the plan.

> Numerical verification note: the sandbox blocked execution of `./venv/bin/python3` and writing scratch files, so the formula checks below were done by hand-tracing against the JS sources (which ARE the canonical values). The arithmetic is simple and load-bearing values were traced step by step.

## Verdict

**APPROVE WITH FIXES (now applied).** The plan is a thorough, near-complete, TDD-structured implementation of the synthetic-data + evaluation slice. The §5.3 distributions match the spec exactly (`guess~Beta(2,8)`, `slip~Beta(2,8)`, `learn~Beta(2,5)`, prereq `>0.5` learn gate), the graph and decision/BKT constants faithfully mirror the JS engine, the split is correctly **by student**, and seeds make everything reproducible. I found one environment blocker, one ablation-soundness bug, two latent correctness bugs, and several robustness issues. All are fixed in-place. The canonical cross-plan `.npz` contract requested in the brief has been added as a new Task 11 and locked.

---

## Findings

### [CRITICAL] Wrong Python version assumed (3.12) — venv is actually 3.9.6
- The plan's Tech Stack and Task 1 Step 1 assert "Python 3.12.x". The venv at `./venv/` reports **3.9.6** (`venv/pyvenv.cfg` → `version = 3.9.6`; site-packages live under `lib/python3.9/`). The *system* `python3` is 3.12.12, but the harness must use `./venv/bin/python3`. Step 1's expected output would FAIL as written, and a worker could silently fall back to the system interpreter.
- **Verified installed:** only `pip 21.2.4`, `PyPDF2 3.0.1`, `setuptools 58.0.4`, `typing_extensions 4.15.0` — so numpy/pandas/pyarrow/scikit-learn are confirmed NOT yet present (matches the plan's premise).
- 3.9 compatibility is actually fine because every module starts with `from __future__ import annotations`, which makes `list[str]` / `dict[str, float]` / `dict | None` legal **as annotations** (stored as strings, never evaluated). No module uses 3.10-only runtime constructs.
- **Fix applied:** corrected Tech Stack and Task 1 to Python 3.9.6, documented the cp39-wheel availability of all pins, added a load-bearing 3.9-compat note, and warned against bare `python3`. `requirements.txt` comment updated; the `--upgrade pip` step is now marked REQUIRED (pip 21.2.4 cannot resolve modern wheels).

### [MAJOR] Spaced-repetition ablation (§8.4) could INVERT — no forgetting model
- `_run_arm` never modeled forgetting: ability only grows on correct answers and never decays over time. With no decay, re-testing an already-mastered skill (what SM-2 does) is pure waste of a problem slot. Within the fixed 50-problem budget, **removing** spaced repetition frees that slot for frontier progress, so `no_spaced_repetition_score` could come out *higher* than `full_treatment_score` — failing `test_ablations_hurt_relative_to_full_treatment`'s `no_spaced_repetition_score <= full + 1e-6`.
- **Fix applied:** added `FORGET_PER_DAY = 0.01` decay applied to every idle skill each simulated day in `_run_arm`. SR now has a real job (maintaining mastered skills against decay), so the ablation holds for the right reason. Documented as load-bearing in the Step-4 expectation note and added Open Question #7 (magnitude is plan-chosen, not from spec).

### [MAJOR] `bkt_next_correct_predictions` alignment was order-fragile (latent bug in §8.1 Brier)
- The predictor sorted by `(student_id, step_idx)` and returned `preds` in that *internal* sorted order, while documenting "aligned to df rows (df assumed sorted)". `metrics.per_skill_brier` then does `df.index.get_indexer(idx)` to index `preds` by the *caller's* positional order. These only coincide if the caller's frame is already chronologically sorted. It happens to be (simulator output + boolean-mask split preserve order), so tests pass — but `_section_81_synthetic` and any unsorted caller would silently misalign predictions to labels, corrupting per-skill Brier.
- **Fix applied:** rewrote the predictor to scatter each prediction back to its row's ORIGINAL positional index (map by label), so `preds[i]` always corresponds to `df.iloc[i]` regardless of input order. Documented the alignment contract.

### [MAJOR] `test_prereq_learn_gate_respected` was flaky + had a PRE/POST off-by-one
- Two problems: (1) initial ability for gated skills was drawn from `Beta(2,8)`, whose upper tail occasionally exceeds 0.55; with 50 students the test would intermittently see a gated skill seeded above the `gate+0.05` bound and FAIL even though the gate logic is correct. (2) The simulator gates `division` on multiplication's POST-update ability, but the test compares against multiplication's PRE-update *recorded* value (`latent_ability` is recorded before the learning step) — so a division row may legitimately have grown one step after the recorded multiplication value still reads `<= gate`, causing a false failure at the boundary.
- **Fix applied:** (1) `sample_student_params` now caps any skill that HAS prerequisites to strictly below the learn gate (a gated skill cannot have been learned yet — this is also more spec-faithful), making the seeding deterministic-safe. (2) the test now only asserts the gate while multiplication's recorded running-max is more than `EPS=0.05` below the gate, explicitly covering the one-step PRE→POST lookahead. The invariant is now deterministic, not statistical.

### [MAJOR] `brier_score_loss` raises on single-class skill subsets (sklearn >= 1.3)
- `per_skill_brier` calls `brier_score_loss(yt, preds[pos])` per skill. A skill seen only-correct or only-wrong gives a single-class `yt`; sklearn 1.5.0's `brier_score_loss` raises `"y_true takes value in {...} and pos_label is not specified"` without an explicit `pos_label`. This would crash §8.1 on real synthetic data (some rarely-reached skills will be all-correct/all-wrong).
- **Fix applied:** pass `pos_label=1` in both `brier()` and `per_skill_brier()` (labels are always 0/1, so this is correct and safe), with explaining comments.

### [MINOR] SM-2 rounding fix was deferred to a separate step (TDD ordering)
- Task 5 Step 3 originally wrote `interval: round(...)` (Python banker's rounding, `round(2.5)==2`) and then told the worker to patch it to half-up in Step 4. The golden test expects `interval==3` (JS `Math.round(2.5)==3`), so the Step-3 code is knowingly broken-on-write.
- **Verified:** the only SM-2 values that occur are `1*2.5 -> 3` and `3*2.5 -> 8`; both require half-up. `math.floor(x+0.5)` yields 3 and 8; bare `round` yields 2 and 8.
- **Fix applied:** put the correct `math.floor(prev["interval"]*prev["ease"] + 0.5)` and `import math` directly in the Step-3 implementation with an explaining comment; rewrote the Step-4 note to "already correct above".

### [MINOR] Canonical `.npz` task was missing (brief requirement)
- The plan emitted only the long-format Parquet; the DKT plan's `load_dataset()` already expects a NumPy archive with arrays `X, Y_skill, Y_correct, mask`. Without a producer task the DKT plan would have re-derived its own encoding — exactly the drift the brief forbids.
- **Fix applied:** added **Task 11** (`scripts/eval/sequences.py` + `scripts/build_dkt_sequences.py` + `tests/test_sequences.py`), renumbered the old Task 11 to Task 12, added the `.npz` files to the File Structure table, the data-contract section, the schema doc, `.gitignore`, the full-suite test list, and the import-sanity check. The builder bakes in the standard DKT input/target SHIFT and FRONT-padding (truncate to the LAST 50) so real and toy DKT data train identically.

### [MINOR] JS↔Python drift guard hardened (brief requirement)
- The existing `test_knowledge_graph.py` parsed `PREREQS` only. The brief asked for a guard that also pins the **skill ordering** (which defines `skill_idx` and therefore the one-hot index).
- **Fix applied:** `test_sequences.py::test_python_encoding_matches_js_source` parses BOTH `SKILLS` (key order = `SKILL_IDS`) and `PREREQS` out of `knowledgeGraph.js` and asserts the Python re-encoding matches. Open Question #1 updated to recommend emitting a `knowledge_graph.json` from JS as v2 (retiring the regex parsers).

---

## Verified-correct (no change needed)
- §5.3 distributions: `guess/slip ~Beta(2,8)` (mean 0.2), `learn ~Beta(2,5)` (mean 0.2857), prereq `>0.5` learn gate — match the spec verbatim. Sanity bands in `test_params_in_distribution_ranges` are consistent with those means.
- BKT update (`bkt.py`) matches `masteryModel.js` exactly; traced values: correct `0.2 -> 0.600`, incorrect `0.2 -> 0.176` (test bands `~0.600 ± 0.01`, `~0.176 ± 0.01`) ✓.
- Decision constants (`MASTERY_CUTOFF=0.75`, ZPD bins easy `<0.4` / medium `<=0.75` / hard, SM-2 ease/interval, strict `is_due` `now >`) all mirror `decisionLayer.js`.
- Leverage/topo-order helpers reproduce the JS DAG; `leverage(subtraction)=4 > leverage(patterns)=2`, `leverage(coord-geometry)=0`, `suggest_next_skill` with `{counting,addition}` mastered returns `subtraction` (highest leverage among unlocked) — all golden assertions hold.
- AUC metric: NaN on single-class, 1.0 on separable, ~0.5 on random — correct usage of `roc_auc_score`.
- Data split is BY STUDENT (`train_test_split_by_student` shuffles unique student ids with a seeded `Generator`) and reproducible.

---

## LOCKED `data/dkt_sequences.npz` contract (so the DKT plan can be verified against it)

`np.savez_compressed("data/dkt_sequences.npz", ...)`, `N` = number of students:

| Array | Shape | Dtype | Meaning |
|---|---|---|---|
| `X` | `(N, 50, 26)` | `float32` | one-hot of the **previous** interaction at each step; `X[:,0]` all-zeros. one-hot index = `dkt_input_idx = skill_idx*2 + correct` |
| `Y_skill` | `(N, 50, 13)` | `float32` | one-hot of the **current** step's skill index (the next-correct prediction target's skill) |
| `Y_correct` | `(N, 50)` | `float32` | current step's correctness (0.0/1.0) — next-step BCE label |
| `mask` | `(N, 50)` | `float32` | 1.0 real / 0.0 FRONT-padding |
| `input_idx` | `(N, 50)` | `int16` | index form of `X` (prev step's `dkt_input_idx`; -1 at pad) |
| `target_skill_idx` | `(N, 50)` | `int16` | `argmax(Y_skill)` per real step (0 at pad — use `mask`) |
| `skill_ids` | `(13,)` | `<U16` | ordered skill ids echoed from meta (single source of ordering) |
| `num_skills` | `()` scalar | `int64` | 13 |
| `seq_len` | `()` scalar | `int64` | 50 |

Padding is FRONT (left); truncation keeps the LAST 50 interactions. The DKT plan's `load_dataset()` reads exactly `X, Y_skill, Y_correct, mask`; the rest is metadata it MAY assert (`num_skills == 13`, `skill_ids` order). **This matches the DKT plan's existing `load_dataset` and `make_toy_dataset` shapes/semantics exactly — no change needed in the DKT plan, but confirm the array NAMES before it locks.**

---

## Open questions (carried/added in the plan)
1. JS↔Python graph sync — recommend a build-time `knowledge_graph.json` (v2); regex guards are the interim net.
2. Decision-logic duplication (Python port vs JS) — decide on a shared constants spec before DKT locks.
3. `_choose_skill` / `DIFFICULTY_PENALTY` magnitudes are plan-chosen; calibrate to the cited 25–40% lift?
4. ASSISTments external check validates the predictor on the dataset's own ~110 skills, not our 13-skill graph — intended?
5. Post-test definition (mean P(correct) at medium difficulty across 13 skills) — confirm the metric the report quotes.
6. Full-scale runtime budget for the pure-Python ~800k-step loop.
7. **(new)** `FORGET_PER_DAY=0.01` is load-bearing for the SR ablation but plan-chosen — confirm magnitude / forgetting model with the guide.

## Residual risk / not blockers
- A/B directionality (`treatment > control`) and ablation gaps are statistical; at `n=300` they may be marginal. The plan instructs to raise `num_learners` rather than weaken assertions — correct. With forgetting added, both directions are now better-separated.
- Full numerical execution of the test suite was not possible in this sandbox; a one-time `./venv/bin/python3 -m pytest` run on a real 3.9.6 venv is the final gate before locking.
