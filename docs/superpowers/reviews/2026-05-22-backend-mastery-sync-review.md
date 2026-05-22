# Review — Backend Mastery Sync Implementation Plan

**Plan:** `docs/superpowers/plans/2026-05-22-backend-mastery-sync.md`
**Reviewed against:** `server/server.js`, `server/models.js`, `server/package.json`, `src/lib/syncEngine.js`, `src/lib/db.js`, `src/engine/engineAPI.js`, `src/engine/decisionLayer.js`, `src/store/usePlayerStore.js`, and sibling plan `2026-05-22-game-integration.md`.
**Date:** 2026-05-22
**Reviewer mode:** review-and-fix (fixes applied directly to the plan; sibling plans and source files untouched).

## Verdict

**APPROVE WITH FIXES APPLIED.** The plan was already strong on schema/sync/shape correctness and its "before" code matched the real `server.js`/`models.js` verbatim. Two canonical cross-plan requirements were unmet (teacher-role authorization was *deferred* rather than implemented; the client transport test would crash under the real Node test env). Both are now fixed in-plan, plus several supporting clarifications. The plan is now executable end-to-end and ships standalone.

---

## Findings

### [CRITICAL] Teacher endpoint had no role guard — any student could read the whole class's mastery — FIXED
The original plan applied only the shared `auth` middleware to `GET /api/teacher/class-mastery` and explicitly **deferred** the role check to "Open Question #1," preserving the existing security gap. Canonical fix #1 requires the endpoint be teacher-only.

**Fix applied:**
- Added a `requireTeacher` middleware to the `createApp()` factory (Task 3). The `User` schema already has `role: { enum: ['student','teacher'] }`, but the JWT payload is only `{ id }` (confirmed in `server.js` login/signup), so role is **not** in the token. `requireTeacher` therefore loads the user via `User.findById(req.userId)` and returns **403** for non-teachers, **401** if the user is missing. It chains after `auth` (so `req.userId` is set): `app.get('/api/teacher/class-mastery', auth, requireTeacher, ...)`.
- Added a test in Task 5: a valid **student** JWT → 403, and asserts no class array leaks in the body. The existing anon → 401 case is retained; teacher → 200 cases retained.
- Updated overview, "Decisions locked," scope, Self-Review, Open Questions, smoke-check, and commit message to match.

**Role assumption documented:** role lives only in the DB `User.role` field (JWT carries no role). If a future change puts `role` in the token, the guard can read it from the JWT and skip the extra `findById`. The pre-existing `/api/teacher/students` route has the *same* gap and is left unchanged (out of scope) but flagged as a one-line follow-up.

### [MAJOR] Task 6 client transport test would crash on `localStorage` / `navigator` under the real test env — FIXED
The root Vitest config is `environment: 'node'` with `setupFiles: ['./src/test/setup.js']`, and that setup only imports `fake-indexeddb/auto` — there is **no jsdom/happy-dom**. `syncEngine.js` reads `localStorage.getItem('mv_auth')` and `navigator.onLine`. The original test did `localStorage.setItem(...)` (→ `ReferenceError: localStorage is not defined`) and `globalThis.navigator = {...}` (unreliable: Node ≥21 exposes a read-only `navigator` global).

**Fix applied:** rewrote the test to install both via `vi.stubGlobal` (overrides read-only globals, auto-reverted in `afterEach` with `vi.unstubAllGlobals`), with an in-memory `localStorage` stand-in seeded with `mv_auth`. `fetch` is also stubbed via `vi.stubGlobal`. Added the test-environment caveat as a note above the test and to Self-Review §5 / Open Question #6.

### [MAJOR] MASTERY_UPDATE payload-key alignment was implicit — now locked and tested
Canonical fix #2 requires the `/api/sync` MASTERY_UPDATE branch to read `payload.masteryState` (and optionally `interactionLog`) and `$set` them into the Progress doc's same-named fields, aligned with the producer `pushToSyncQueue({ type: 'MASTERY_UPDATE', payload: { masteryState, interactionLog } })`.

**Verification:** the plan's Task 4 handler builds the update from a `SYNCABLE` allow-list that includes `masteryState` and `interactionLog`, `$set`s them with **no remapping** (same key names as the schema and the producer payload), and the sync test POSTs exactly `{ masteryState, interactionLog }` — which is `operation.payload` verbatim. This is correct and matches `src/store/usePlayerStore.js:133`'s `GAME_SESSION` transport pattern.

**Fix applied (hardening):** added an explicit "Cross-plan payload contract (locked)" note to Task 4 and the Decisions section; expanded the Task 6 transport test to include `interactionLog` and assert both `body.masteryState.belief` and `body.interactionLog[0].skillId`; added a "drops unknown op type" test to lock the new op-type guard's behaviour.

### [MINOR] `createApp()` no-behaviour-change claim contradicted the new guard — FIXED
Task 3 was described as a "pure refactor — no behaviour change," which is no longer strictly true now that `requireTeacher` is added. Reworded to "mostly behaviour-preserving: existing routes verbatim; the only functional addition is `requireTeacher`, applied solely to the new route." Commit message updated accordingly.

### [MINOR] Stray `id:'local'` may leak into the synced `masteryState` — DOCUMENTED (no server change)
`db.loadMasteryState()` returns `{ id:'local', belief, attempts, lastPracticed, review }` (the IndexedDB keyPath is merged in). If the producer plan syncs that object verbatim, the server stores a harmless `masteryState.id: 'local'`. The `class-mastery` reshape only reads `belief`/`attempts`, so it is cosmetic. Added Open Question #5b recommending the engine-wiring plan strip `id` before enqueuing. No server change needed here.

---

## Confirmations (verified against real files; no change needed)

- **"Before" code fidelity:** the plan's quoted `auth` middleware, `/api/sync` handler, and route bodies match `server/server.js` line-for-line; the `ProgressSchema` tail matches `server/models.js`. The `createApp()` extraction is behaviour-preserving for existing routes.
- **`createApp()` refactor:** `server.js` retains `mongoose.connect` + `app.listen`; all routes move verbatim. Runtime behaviour of existing endpoints is unchanged.
- **`class-mastery` response shape:** returns exactly `[{ id, name, attempts, mastery: { [skillId]: P } }]`. `attempts` is the **scalar sum** of `masteryState.attempts` per-skill counts (matches `fairRanking`'s `n = s.attempts ?? 0`). `mastery` contains **only attempted skills** (keys of `masteryState.attempts`, value from `belief`) — honouring `decisionLayer.fairRanking`'s "do NOT pass a dense BKT prior map" contract (verified against `src/engine/decisionLayer.js:82-90` and `engineAPI.classMastery`). Students with no `masteryState` return `attempts: 0, mastery: {}`.
- **Additive `/api/sync`:** `$set` with a body-filtered allow-list ensures GAME_SESSION and MASTERY_UPDATE never clobber each other; the "does NOT wipe mastery" test guards this. Verified the engine state shape (`{ belief, attempts, lastPracticed, review }`, `attempts` keyed by skill) against `src/lib/db.mastery.test.js` and `engineAPI.recordAttempt`.
- **No GAME_SESSION regression:** the new op-type guard recognizes `GAME_SESSION`, the exact type pushed at `usePlayerStore.js:133` — existing ops still POST.
- **Test stack:** vitest@4 (matches root) + supertest (drives the real `createApp`) + mongodb-memory-server (real in-memory Mongo) — realistic; Mongoose Mixed/validation runs for real.

---

## Open Questions (carried in the plan; flagged for the team)

1. **Student identity / one-record-per-device (most important remaining).** Each student maps to one `Progress` doc by `userId`, but the on-device engine stores a single `mastery_state` keyed `'local'` — i.e. **one student per device/account**. Correct for the rural single-login model, but a shared device under one account would merge multiple students' mastery. Confirm the deployment assumption before this carries real student data.
2. **`attempts` semantics for shrinkage `n`** — summed per-skill counts vs. `interactionLog.length`; confirm which the team wants.
3. **`interactionLog` growth** — server schema is unbounded; rely on the client's trailing-50 window and/or cap server-side (engine-wiring plan).
4. **MASTERY_UPDATE producer sequencing** — this plan recognizes/ships the op but does not enqueue it (engine-wiring/game-integration plan owns the producer). Plan ships standalone; mastery only flows once that plan lands. The sibling `game-integration.md` does **not** yet contain a `MASTERY_UPDATE` producer (grep-confirmed), so this dependency is currently unfulfilled by any committed plan — track it.
5. **Stray `id:'local'`** in synced `masteryState` (see MINOR above) — engine-wiring plan should strip it.
