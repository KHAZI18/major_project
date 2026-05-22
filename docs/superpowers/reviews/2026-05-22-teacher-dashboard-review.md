# Review — Teacher Dashboard Integration Plan

**Plan reviewed:** `docs/superpowers/plans/2026-05-22-teacher-dashboard.md`
**Reviewer:** independent reviewer-and-fixer (single plan)
**Date:** 2026-05-22
**Verdict:** **APPROVE WITH FIXES APPLIED.** All findings below were fixed directly in the plan. No remaining blockers; the plan is now consistent with the real `TeacherDashboard.jsx`, the engine API, and the backend plan's locked response shape.

---

## Grounding (files verified)

- `src/engine/engineAPI.js` — `classMastery(students)` returns `{ perSkill: { [skillId]: mean }, ranking: fairRanking(students) }`. `classMastery` accesses `st.mastery[id]` **without** optional chaining; rows must carry a `mastery` object.
- `src/engine/decisionLayer.js` — `fairRanking(students)` returns `[{ id, name, breadth, shrunkenMastery, score }]` sorted by `score` desc; computes over `Object.keys(s.mastery)` (non-optional) and uses `s.attempts ?? 0` as `n`. The plan's component props/comments match this exactly.
- `src/engine/knowledgeGraph.js` — `SKILLS`/`SKILL_IDS` = **13** skills (note: spec said 12). `skillLabel('fractions-basic')` → `Fractions Basic`. Heatmap default columns = 13 — fine.
- `src/pages/TeacherDashboard.jsx` — real `fetchStudents` and the real status rule `(s.progress?.xp > 5000) ? 'excellent' : (s.progress?.xp > 1000) ? 'good' : 'at_risk'` match the plan's "before" block verbatim. Roster heading `Class Roster`, table className `w-full border-collapse text-left text-sm`, `badge badge-primary`/`badge-orange` (confirmed present in `src/index.css`) all match the plan's reused chrome.
- `src/test/setup.js` (only `fake-indexeddb`) and `src/test/renderWithRouter.jsx` (**absent**) — the plan correctly declares the test-tooling + `renderWithRouter(ui, { route })` helper as a dependency on `2026-05-22-student-dashboard.md` Task 1 (which defines exactly that signature and the `.test.{js,jsx}` glob).
- `docs/superpowers/plans/2026-05-22-backend-mastery-sync.md` — endpoint **locked** shape: `res.send(rows)` where `rows = [{ id, name, attempts, mastery }]` — a **bare array**, **no** `{ students }` envelope, **no** `grade`, `attempts` is a scalar sum, `mastery` is attempted-skills-only (`{}` when none).

---

## Findings & fixes

### [CRITICAL] C1 — Consumed response shape did not match the backend plan (`{ students }` envelope vs. bare array)
The plan's data-contract section showed `{ "students": [ ... ] }` and `fetchStudents` read `const list = mData.students || []`. The backend plan returns a **bare array** (`res.send(rows)`). As written, `mData.students` would be `undefined`, silently disabling the live heatmap/alerts/fair-rank and always using the offline mock.
**Fix applied:** Rewrote the contract section to the locked bare-array JSON; changed the fetch to consume the array directly with a defensive fallback: `const list = Array.isArray(mData) ? mData : (mData?.students ?? []);`. Updated the Architecture paragraph, the state-declaration comment, and Self-Review item 3 to state the bare-array shape.

### [MAJOR] M1 — Contract advertised a `grade` field the backend never returns
The contract JSON included `"grade": 5` and `buildHeatmapMatrix` / `displayMastery` read `s.grade`, but the backend reshape returns only `{ id, name, attempts, mastery }`.
**Fix applied:** Removed `grade` from the contract JSON and explicitly documented "No `grade` field." Clarified that `grade` is populated only in the offline fallback (from `MOCK_STUDENTS`); `buildHeatmapMatrix` already reads `s.grade` defensively (renders nothing if absent). Added Open Question 8 on how to source `grade` for live per-grade grouping (backend reshape add, or join from `/api/teacher/students` by id).

### [MAJOR] M2 — No graceful 401/403 handling (canonical cross-plan requirement)
The backend plan will teacher-role-guard this route; the original `fetchStudents` only checked `mResp.ok` and otherwise fell through, with no explicit auth-failure path.
**Fix applied:** Added explicit `else if (mResp.status === 401 || mResp.status === 403)` and a generic non-ok branch, both `console.warn` and fall back to the XP-status / mock-mastery path without crashing. Documented the authenticated-teacher assumption + 401/403 behavior in the contract section.

### [MINOR] m1 — Offline mock-mastery could synthesize 0/negative values that vanish from weakness alerts
`weakSkills` filters `mean > 0`; the synthesized `(accuracy - 20)/100` etc. could produce `<= 0` for low-accuracy students, silently dropping weak skills from the demo.
**Fix applied:** Added a `clamp = (v) => Math.max(0.02, Math.min(0.99, v))` and applied it to all synthesized skills, with a comment explaining why (so low skills still surface as weak).

### [MINOR] m2 — `fairRanking`/`classMastery` are not null-safe on `mastery`; relied on an implicit guarantee
`classMastery` uses `st.mastery[id]` and `fairRanking` uses `Object.keys(s.mastery)` with no optional chaining. Safe **only** because every row carries a `mastery` object.
**Fix applied (doc-level):** Documented the invariant in the contract ("empty object, never missing") and Self-Review item 3 (backend returns `{}` for un-practiced students; the offline fallback always synthesizes one). No code change needed since the engine is locked and the invariant holds.

---

## Items checked and found correct (no change)

- "Before" code for `fetchStudents` and the `xp>5000`/`xp>1000` status rule reproduced verbatim from the real file. Imports (`classMastery` from `engineAPI`, `SKILLS`/`SKILL_IDS` from `knowledgeGraph`, `statusFromMastery` from the new `teacherSource`) resolve.
- Heatmap rendered as a **CSS grid**, not recharts `ResponsiveContainer` (which measures to 0 in jsdom) — testable, each cell has a `title`. Justification preamble is accurate.
- Tests use pure shapers (`teacherSource.test.js` in Node) and mock `engineAPI`/stores for component tests; integration test rejects `fetch` to exercise the offline path. No placeholders; every step has complete code.
- Existing XP roster table is kept intact (FairRankTable inserted *after* it; "show both" honored). New cards reuse existing chrome classes.
- `ranking` field names (`breadth`, `shrunkenMastery`, `score`) and `perSkill` consumed exactly as the engine returns them.
- `WEAKNESS_THRESHOLD = 0.5` and `minLearners` (default 1, override tested) handling is sane; small-class behavior covered by the `ignores skills below minLearners` test.

---

## Open questions (carried / added)

- (Carried) Status bands `0.75/0.5/0.3` and `WEAKNESS_THRESHOLD = 0.5` / `minLearners = 1` — sign-off, and whether `minLearners` should default to ~3 for tiny rural classes.
- (Carried) Heatmap horizontal overflow on phones (13 skills × ~30 students) — acceptable scroll vs. a "top-N weakest" condensed mobile mode.
- (Added, Open Question 7) **Sibling-plan envelope drift:** `2026-05-22-student-dashboard.md` still documents the endpoint as `{ students: [...] }`. The backend (source of truth) returns a bare array. That sibling plan must be corrected separately (out of scope here). The defensive guard added to the teacher fetch tolerates either form.
- (Added, Open Question 8) `grade` provenance for live heatmap grouping (backend reshape add vs. roster join).
