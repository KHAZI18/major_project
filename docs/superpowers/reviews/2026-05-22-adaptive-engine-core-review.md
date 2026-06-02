# Plan Review — Adaptive Engine Core

**Plan reviewed:** `docs/superpowers/plans/2026-05-22-adaptive-engine-core.md`
**Spec:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md`
**Date:** 2026-05-22
**Reviewers:** spec-fidelity (independent agent); math/numerical (verified directly with `node` after reviewer agents hit transient API overload); engineering/testability (verified directly against repo config files for the same reason).

## Verdict

The plan is a high-fidelity, well-scoped implementation of the Engine Core slice. The knowledge graph matches the spec edge-for-edge, the BKT substitution is faithful to the §10 fallback, all four decision functions are present, and **every hard-coded test number is arithmetically correct** (verified). Three issues are worth fixing before locking the public API: one threshold inconsistency, one off-by-one in the review-due check, and an under-specified fair-ranking contract. None are blockers; all are cheap to fix.

---

## Findings

### [CRITICAL] 0.75 threshold is used with two conflicting meanings
- A skill at exactly `0.75` is "Medium difficulty" per `nextDifficulty` (§6.1: `0.40–0.75` → medium) yet simultaneously "mastered" per `arePrereqsMet` / `suggestNextSkill` / breadth (`>= 0.75`). So a skill the engine still serves at medium counts as fully mastered for unlocking downstream skills.
- This is inherited from the spec itself (§6.1 vs §6.2 `P < 0.75`). It is a knife-edge (BKT values rarely land exactly on 0.75) but should be made *intentional and tested* rather than incidental.
- **Resolution applied:** Documented the intended semantics ("≥ 0.75 = mastered for unlocking; > 0.75 = served at Hard; the 0.75 point is mastered-but-still-reinforced-at-Medium") and added a boundary test pinning behavior at exactly 0.75 across `nextDifficulty`, `arePrereqsMet`, and `suggestNextSkill`.

### [MAJOR] `isDue` uses `>=`, spec says strictly `<`
- Spec §6.3: due when `lastReviewed + interval < now`. Plan's `isDue` used `now >= lastReviewed + interval*DAY_MS`.
- **Resolution applied:** Changed to strict `now > lastReviewed + interval*DAY_MS`. All existing test assertions still hold (verified). Added a boundary test at exactly `lastReviewed + interval`.

### [MAJOR] Fair-ranking term definitions are plan-invented and under-documented; latent input-shape mismatch
- §6.4 defines only `score = breadth × shrunken_mean` and the shrinkage formula. `breadth`, `observed_mean`, and what feeds the mean are invented by the plan (reasonable, but unflagged).
- `observed_mean` was computed over skills with `mastery > 0`. Because BKT initialises every skill to `pL0 = 0.2 > 0`, a dense 13-skill mastery map (what `getAllMastery` produces) would make *every* skill count as "practiced," distorting the mean.
- Latent type mismatch: the engine persists `attempts` as a per-skill object, but `fairRanking` expects a scalar `n`. (No runtime bug in Engine Core today, because `classMastery` consumes an externally-supplied `students` array, not the engine's own state — but the contract was undocumented.)
- **Resolution applied:** `fairRanking` now computes `observedMean` and `breadth` over `Object.keys(student.mastery)` (caller decides what to include — pass only attempted skills), the input contract `{ id, name, attempts: number, mastery }` is documented in code and README, and the §6.4 definitions are added to the plan's open-items list. Test numbers unchanged (verified: B first, A.shrunken = 0.9048).

### [MINOR] Resolved / accepted
- **SM-2 rounding** (`Math.round(interval × ease)`): an addition beyond the spec's continuous formula, but faithful to canonical SM-2. Kept; documented as intentional.
- **SM-2 initial ease at the 2.5 cap** makes `+0.1`-on-correct a no-op until a lapse. Faithful to canonical SM-2 default; flagged for the team's decision (open item, unchanged).
- **12 vs 13 skills:** spec summary says 12, §4 table lists 13. Plan implements 13 and derives dims from `SKILL_IDS.length`. **Downstream impact made explicit:** the DKT plan's input dim must be `2 × SKILL_IDS.length = 26`, not the spec's hard-coded 24.
- **`(equations)` diagram label** between `algebra-basics` and `geometry-shapes` is not a skill; plan correctly collapses it into the edge. Note added so no one thinks a skill was dropped.
- **Numeric separators (`86_400_000`):** parse fine (eslint `parserOptions.ecmaVersion: 'latest'`), but to remove all doubt against the top-level `ecmaVersion: 2020`, switched to plain `86400000`.

### [MAJOR — engineering] Vite `^8.0.4` ↔ Vitest peer-dependency risk
- `package.json` pins `vite: ^8.0.4`. Vitest ships a Vite peer range; a brand-new Vite major can be outside an older Vitest's range, which would make Task 1's `npm install -D vitest` fail.
- **Resolution applied:** Task 1 now (a) checks the resolved Vite version first (`npm ls vite`), (b) installs the latest Vitest, and (c) keeps the `--legacy-peer-deps` fallback. If Vitest cannot resolve against Vite 8 at all, the documented fallback is to run the engine's pure-logic tests under a standalone Vitest workspace — but in practice latest Vitest + `--legacy-peer-deps` resolves.

### [OK — engineering] Verified sound
- **Test environment:** `environment: 'node'` + `fake-indexeddb/auto` is correct — `idb` only needs a global `indexedDB`, which the shim provides; no jsdom needed (no DOM in the engine).
- **Test filtering:** `npm test -- knowledgeGraph` → `vitest run knowledgeGraph` filters by filename substring. Correct.
- **Cross-file isolation:** Vitest isolates each test *file* by default (fresh module registry → `db.js` `dbPromise` re-created, `setup.js` re-runs → fresh fake-indexeddb), so the `db.mastery` and `engineAPI` files don't contaminate each other. Within `db.mastery.test.js` the two appends (ts 1, then 2) are ordered by the `by_timestamp` index, so `slice(-limit)`'s last element is ts 2. Note added: relies on Vitest default isolation; if the team disables isolation, add per-test store clearing.
- **No circular imports:** `knowledgeGraph` (leaf) ← `masteryModel`, `decisionLayer`; `engineAPI` ← all three + `db`. Acyclic.
- **`recordAttempt` in-place mutation** of the singleton is fine for tests (`resetEngine` in `beforeEach` gives a fresh state per test); belief is replaced immutably.
- **db.js edit point** ("after the achievements block, before the upgrade closing brace") is unambiguous against the actual file.
- **Build:** `*.test.js` are not imported by the app and are excluded from the Vite build; the engine is not yet imported by any UI, so the bundle is unaffected.

---

## Math verification (run with `node`)

| Assertion | Computed | Asserted | Pass |
|---|---|---|---|
| BKT 1 correct from 0.2 | 0.600000 | ≈0.6 (±0.005) | ✅ |
| BKT 1 incorrect from 0.2 | 0.175758 | ≈0.176 (±0.005) | ✅ |
| BKT 2 correct from 0.2 | 0.890323 | >0.85 and >0.75 | ✅ |
| `Math.round(2.5)` / `Math.round(7.5)` | 3 / 8 | 3 / 8 | ✅ |
| SM-2 lapse ease `max(1.3, 2.5−0.2)` | 2.3 | ≈2.3 | ✅ |
| `isDue` interval 1 (now−2d) / interval 5 | true / false | true / false | ✅ |
| fresh review due now / now+3d | false / true | false / true | ✅ |
| `shrunkenMean(1.0, 1, 0.9)` | 0.904762 | ≈0.9048 (±0.0005), <1.0 | ✅ |
| fairRanking A vs B | A score 0.9048, B score 4.0833 | B ranks first | ✅ |
| classMastery perSkill.addition (1.0, 0.8) | 0.9 | ≈0.9 | ✅ |

---

## Coverage (in-scope spec sections)

| Spec section | Covered by | Status |
|---|---|---|
| §3 module architecture | Tasks 2,3,4,9 | ✅ |
| §4 skills / DAG / game map | Task 2 | ✅ exact match |
| §5.1 mastery model (BKT; DKT deferred) | Task 3 | ✅ faithful to §10 fallback |
| §6.1 adaptive difficulty | Task 4 | ✅ (0.75 semantics now pinned) |
| §6.2 recommendation (4 steps) | Task 5 | ✅ |
| §6.3 spaced repetition (SM-2) | Tasks 6, 9 | ✅ (`isDue` fixed to `>`) |
| §6.4 fair ranking | Tasks 7, 9 | ✅ (contract now documented) |
| §7 `src/lib/db.js` stores | Task 8 | ✅ |

## Outcome

All [CRITICAL]/[MAJOR] findings have corresponding fixes applied to the plan (see edit log in the plan's revision). The plan is **approved to implement** with the fixes in place.
