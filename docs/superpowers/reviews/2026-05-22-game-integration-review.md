# Review — Game Integration Implementation Plan

**Plan:** `docs/superpowers/plans/2026-05-22-game-integration.md`
**Reviewer:** independent reviewer-and-fixer (single-plan)
**Date:** 2026-05-22

## Verdict

The plan is fundamentally sound and accurate — all 8 game "before" snippets, the engine API signatures, and the `skillForGame`/`GAME_SKILLS` mapping match the real source line-for-line, and the integration pattern is correct. I applied fixes for two CRITICAL issues (the missing cross-plan `MASTERY_UPDATE` producer task, and a repo-wide lint baseline that is RED — which would have failed every "Expected: PASS" lint step) plus several MAJOR/MINOR clarifications; the plan is now executable as written.

## Findings & changes applied

### [CRITICAL] Missing `MASTERY_UPDATE` sync producer — added as new Task 3b
- **Problem:** The canonical cross-plan fix this plan owns was absent. `engineAPI.recordAttempt` (verified current source) calls `appendInteraction` + `saveMasteryState` but never `pushToSyncQueue`, so mastery changes never reach the server. The sibling **backend-mastery-sync** plan explicitly defers the producer to this plan (its line 844: *"The producer side … belongs to the engine-wiring plan … `pushToSyncQueue({ type: SYNC_OP_TYPES.MASTERY_UPDATE, payload: { masteryState, interactionLog } })`"*).
- **Change:** Inserted a complete TDD task ("Task 3b") between Tasks 3 and 4. It (1) adds a failing test `src/engine/engineAPI.sync.test.js` asserting `recordAttempt` enqueues **exactly one** `MASTERY_UPDATE` op (using the existing `fake-indexeddb` Node setup; clears `sync_queue` in `beforeEach` for an exact count), (2) imports `pushToSyncQueue` from `../lib/db` into `engineAPI.js`, (3) calls `await pushToSyncQueue({ type: 'MASTERY_UPDATE', payload: { masteryState: s } })` immediately after `saveMasteryState(s)`, (4) re-runs the full suite to prove the locked engine-core tests still pass (they never assert on `sync_queue` and `recordAttempt` still returns the same mastery number), and (5) commits.
- **Contract verified against real consumers:** Payload key `masteryState` and value shape `{ belief, attempts, lastPracticed, review }` match (a) the backend plan's `/api/sync` destructure + `Progress.masteryState` Mixed field, (b) `syncEngine.sendToAPI` (POSTs `operation.payload`), and (c) the existing `GAME_SESSION` push at `usePlayerStore.js:133`. Used the string literal `'MASTERY_UPDATE'` (== `SYNC_OP_TYPES.MASTERY_UPDATE`) so the plan is self-contained and works in either merge order. Confirmed `db.clear('sync_queue')` is a valid `idb` method.
- **Scope note added:** Updated the intro "OUT of scope / IN scope" block and File-Structure table to record that `engineAPI.js` is the editable public surface (not a locked internal layer) and that the server side stays with the backend plan.

### [CRITICAL] Whole-repo lint is RED at baseline — all lint verification steps would fail
- **Problem:** `npm run lint` currently exits non-zero with **65 errors / 10 warnings** in files this plan never touches (`Profile.jsx`, `StudentDashboard.jsx`, `TeacherDashboard.jsx`, `useSyncStore.js`) **plus** pre-existing dead-import errors inside two touched games (`MultiplicationFarm.jsx`: `useEffect`+`motion` unused; `PatternPuzzle.jsx`: `useEffect` unused). Every task's `npm run build && npm run lint` step claimed "Expected: build succeeds; no new lint errors" — those steps would all fail on pre-existing noise, blocking the plan.
- **Change:** Rewrote every per-task lint step (Tasks 4–11) to `npx eslint <changed file>` with an explicit acceptance bar, and rewrote Task 13 Step 2 to lint exactly the created/modified files. For `MultiplicationFarm.jsx` and `PatternPuzzle.jsx` the bar is "no more than the named pre-existing errors, zero new errors"; the other files must be clean (0). Documented the full baseline in a new Self-Review section 5.
- **Verified:** I ran `npm run lint` (RED, 65 errors) and `npx eslint` on the two dead-import games to confirm the exact pre-existing errors quoted in the plan. Baseline `npm test` is green (5 files / 32 tests), so test steps were left intact.

### [MAJOR] `interactionLog` deliberately omitted from the producer payload — documented
- The backend `/api/sync` accepts `masteryState` **and** `interactionLog`, but the engine keeps no in-memory interaction array (it appends each row straight to IndexedDB). The producer ships `masteryState` only; the additive server merge leaves `interactionLog` at its `[]` default. Recorded the rationale in Task 3b and as Open Question 7 (who, if anyone, should attach `getInteractionLog()` rows for DKT).

### [MINOR] Sync-queue volume from per-answer ops — flagged
- `recordAttempt` now enqueues one `MASTERY_UPDATE` per in-game answer, so timed games can queue dozens of full snapshots offline. Correctness holds (server merge is last-write-wins/idempotent), but added Open Question 8 proposing optional coalescing.

### [MINOR] Fire-and-forget error surface widened — flagged
- Games call `recordAttempt(...)` without `.catch`; it now performs three IndexedDB writes, so a rejection becomes an unhandled rejection. Matches the brief's "never await in a UI handler" directive; added Open Question 9 with a one-token `.catch(() => {})` mitigation if it gets noisy.

## Verification performed
- Read all 8 game files end-to-end: every "before" snippet matches current source exactly (no drift). Imports (`../engine/engineAPI`, `../engine/gameSkills`) resolve; edits produce valid JSX.
- Confirmed `getNextDifficulty(skillId)` and `recordAttempt({ skillId, correct, responseTime })` signatures against `engineAPI.js`; `skillForGame` keys match `GAME_SKILLS` keys in `knowledgeGraph.js`.
- Spot-checked the three integration tests against real markup: ArithmeticGame placeholder `"?"`, "Start Match"/"Hard (÷)" buttons, `btn-primary` active class; FractionFrenzy option buttons carry `rounded-2xl` (Back is an `<a>`, not a button); MultiplicationFarm answer buttons render bare numbers. Selectors are realistic in jsdom. The integration tests mock `engineAPI` entirely, so the new `pushToSyncQueue` is never exercised there (no jsdom IndexedDB needed).
- Ran `npm test` (32 passing) and `npm run lint` (65 errors) to establish the baselines the fixes rely on. Confirmed `idb` exposes `clear`.

## Remaining open questions (carried in the plan; not blockers)
1. **Backend dependency ordering.** Task 3b's producer is harmless if the backend-mastery-sync plan runs later — `MASTERY_UPDATE` ops just queue and `syncEngine` currently POSTs `operation.payload` to `/api/sync`; the current server handler ignores unknown body keys, so nothing breaks, but mastery won't actually persist server-side until the backend plan lands (schema field + additive merge + op-type recognition). Recommend sequencing backend-mastery-sync before/with this plan for end-to-end mastery sync. (Not fixable here without editing a sibling plan/source.)
2. **Dead-import cleanup vs. additive scope.** `MultiplicationFarm.jsx`/`PatternPuzzle.jsx` carry pre-existing unused-import lint errors. Removing them would make those files lint-clean but is technically outside the plan's "additive only" rule — left to team discretion (noted in-plan).
3. Plus the plan's own Open Questions 1–9 (two-skill attribution, `responseTime` for non-typed games, the "top 8" selection, PatternPuzzle difficulty mapping, test-selector brittleness, and the three new producer-related items above).
