# Review — Student Dashboard Integration Plan

**Plan:** `docs/superpowers/plans/2026-05-22-student-dashboard.md`
**Reviewer:** independent reviewer-and-fixer (single plan)
**Date:** 2026-05-22
**Scope reviewed against real files:** `src/engine/engineAPI.js`, `src/engine/decisionLayer.js`, `src/engine/masteryModel.js`, `src/engine/knowledgeGraph.js`, `src/engine/README.md`, `src/pages/StudentDashboard.jsx`, `src/components/Leaderboard.jsx`, `src/App.jsx`, `src/store/useAuthStore.js`, `src/store/usePlayerStore.js`, `vitest.config.js`, `src/test/setup.js`, `package.json`.

## Verdict

**APPROVE WITH FIXES APPLIED.** The plan was structurally sound — accurate "before" JSX, exact engine-API surface, correct dense-BKT-prior handling, real Tailwind chrome reuse, and a jsdom test strategy that correctly sidesteps recharts' `ResponsiveContainer`. It had **one CRITICAL authorization defect** (the student widget called the teacher-only endpoint) and **one CRITICAL React correctness defect** (effect depending on a fresh `user` object). Both are fixed directly in the plan. After fixes, the student widget is local-only, calls no network, and the cross-plan AUTH invariant holds.

---

## Findings

### [CRITICAL] Student called the teacher-only endpoint — FIXED
The original `FairLeaderboard` used `fetch('http://localhost:5000/api/teacher/class-mastery')` as its **primary** data path, with the local class only as a catch-block fallback. The backend plan (`2026-05-22-backend-mastery-sync.md`) guards that route with `requireTeacher`, so an authenticated **student** receives `403`. This violates the canonical cross-plan AUTH invariant (a student MUST NOT call the teacher endpoint).

**Fix applied:** Rewrote the widget to be **local-only for v1**. It builds a single-student "class" from the engine singleton via `buildLocalClass({ id, name, attempts: gamesPlayed, allMastery: getAllMastery() })` (practiced-skills-only, from Task 2) and ranks it through `classMastery(...).ranking`. Removed `CLASS_ENDPOINT`, all `fetch`, the `token` read, and the async `useEffect`. Updated:
- "Data sourcing decision" section (no more "Primary (online)" fetch; explicit `403`/teacher-only rationale).
- Task 5 description, test, and implementation.
- Self-Review item 3a (new) and Open Question 1 (now a backend BLOCKER with an explicit future student-scoped endpoint).
The injected-`students` prop path is preserved so a future student-safe endpoint only needs to pass its result as the prop (local builder stays the offline fallback).

### [CRITICAL] Effect depended on the `user` object → render loop — FIXED
`useEffect(..., [students, token, user, gamesPlayed])` depended on the whole `user` object. `useAuthStore` (and the per-render selector pattern) can return a new object reference each render; the test mock `useAuthStore: () => ({ user: {...} })` does so on **every** render, which would re-fire the effect indefinitely (and `setCls` inside it would re-render → loop).

**Fix applied:** The local class is now computed in a `useMemo` keyed on **primitives only** — `[students, localId, user?.name, gamesPlayed]` (where `localId = user?.id || 'me'`). No `setState`, so no loop is possible.

### [MAJOR] Test mocked the teacher-endpoint fetch path — FIXED
The original Task 5 test relied on a fetch-failure fallback and a synthetic `offline` prop to assert the offline note. With the AUTH fix there is no fetch.

**Fix applied:** Rewrote the test to:
1. Inject-`students` path: asserts `classMastery` is called with the injected class and the local student is tagged `(You)`.
2. No-prop local path: mocks `getAllMastery()`, asserts `classMastery` is called with the engine-built single-student class `[{ id:'B', name:'Bilal', attempts:3, mastery:{ addition:0.8 } }]` (prior-valued `counting:0.2` correctly dropped), and the "Class data offline" note renders.
3. Added a guard test: `vi.spyOn(globalThis,'fetch')` asserts `fetch` is **never** called.
Removed the now-defunct `offline` prop and the `token` mock field reliance.

### [VERIFIED — no change needed] "Before" JSX matches the real dashboard
Task 7's quoted sidebar block (Daily Missions → Leaderboard "Top Players" block wrapping `<Leaderboard compact />` → Badges → Recent activity) matches `src/pages/StudentDashboard.jsx` lines 303–367 exactly, including the `Link to="/student/leaderboard"` "View All" pill and the `motion.div` chrome. The `import Leaderboard from '../components/Leaderboard'` line (line 7) matches. Removing it does not orphan `Link` — `Link` is still used by the Achievements card (`/student/profile`), so no unused-import lint error. The plan's Step 7 note about leaving `Leaderboard.jsx` in place is correct (the `/student/leaderboard` route still exists in `App.jsx`).

### [VERIFIED — no change needed] Game-link routes match `App.jsx` exactly
Every path in `GAME_ROUTES` (Task 3) and `GAME_PATHS` (Task 4) matches an `App.jsx` `/games/*` route: `/games/arithmetic`, `/games/meteor`, `/games/farm-multiply`, `/games/fractions`, `/games/fraction-ninja`, `/games/balancer`, `/games/algebra-dungeon`, `/games/geometry`, `/games/coordinate-treasure`, `/games/decimal-mall`, `/games/integer-mountain`, `/games/patterns`, `/games/number-catcher`, `/games/balloon-pop`, `/games/math-racing`. Component-name keys match `GAME_SKILLS` in `knowledgeGraph.js`. The `SuggestedForYou` test's assertion (`MultiplicationMeteor` → `/games/meteor`) is correct.

### [VERIFIED — no change needed] Dense-BKT-prior pitfall correctly avoided
`getAllMastery()` returns a **dense** map (all 13 `SKILL_IDS` at `pL0=0.2` until practiced — confirmed in `engineAPI.js` line 53–58 + `masteryModel.js` `DEFAULT_BKT_PARAMS.pL0=0.2`). `decisionLayer.fairRanking` computes `observedMean`/`breadth` over the keys present in `mastery` and explicitly warns against a dense map. The plan's `practicedMastery()` (Task 2) drops any skill within `EPS` of `0.2` before feeding `buildLocalClass`/`classMastery`, and `MasteryChart.masteryBars()` reuses the same filter. `BKT_PRIOR = 0.2` matches the model constant. Correct.

### [MINOR] `recharts` ResponsiveContainer test strategy — sound
Confirmed `recharts@3.8.1` is a dependency. Testing the pure `masteryBars()` shaper plus header text (not SVG geometry) is the right call for jsdom (zero-measured container). No change needed.

### [MINOR] `FruitRush` omitted from the route maps — FIXED IN PLAN: not required
`GAME_SKILLS` includes `FruitRush: ['addition','multiplication']` and `App.jsx` has `/games/fruit-rush`, but neither `GAME_ROUTES` nor `GAME_PATHS` lists it. This is **not a bug**: for every skill `FruitRush` covers, an already-mapped game (`ArithmeticGame`, `MultiplicationMeteor`) precedes it in `GAME_SKILLS` insertion order, so `routeForSkill`/`suggestNext.games` always resolve a route. Left as-is (a deliberate subset); flagged here for completeness only — a future editor may add `FruitRush: '/games/fruit-rush'` if desired.

### [MINOR] Cosmetic import + stale mock field — FIXED / noted
- Removed a trailing comma in `MasteryChart.jsx`'s `import { getAllMastery, }` (lint hygiene).
- The Task 7 `useAuthStore` mock still carries a harmless `token: null` field that the rewritten `FairLeaderboard` no longer reads — left in place (no effect; over-mocking is benign).

---

## Open Questions (carried / updated in the plan)

1. **(Now a backend BLOCKER for a real class leaderboard)** A student-scoped, name-anonymizable class-mastery endpoint must exist before the widget can rank a real class. Until then v1 is local-only. Owner: backend plan.
2. **Engine freshness:** singleton is read on render; a game updating mastery then navigating back without remount may show stale cards. Route remount likely sufficient for v1; a lightweight subscription is the alternative.
3. **`Leaderboard.jsx` retirement:** the raw-XP component remains for `/student/leaderboard`; decide later whether to migrate that full page to fair-rank.
4. **Privacy:** showing classmates' names in a rural-school context — anonymize ("Classmate #3") vs. real names. Becomes live only once the class endpoint (OQ1) lands.
5. **"Practiced" via prior-delta heuristic:** a student who returns exactly to `0.2` would be excluded. Acceptable for v1; an engine `getAttempts()` map would be exact (out of scope).

## Residual risk
- Low. v1 ranks a single local student (#1 of 1) — the "offline" note correctly frames this so it doesn't read as a broken multi-row leaderboard.
- The plan does not run tests itself (review is static); the rewritten FairLeaderboard test now has no network dependency, so it should pass deterministically in jsdom.
