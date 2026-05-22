# Adaptive Learning Engine — Teacher Dashboard Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the already-built Adaptive Learning Engine (`src/engine/`) in `TeacherDashboard.jsx` by (1) replacing the hardcoded `xp > 5000` / `xp > 1000` status thresholds with **per-skill mastery** derived from `classMastery(students)`, (2) adding a **per-skill mastery heatmap** (students × skills), (3) adding **per-skill weakness alerts** (skills below a class-wide threshold), and (4) adding a **fair-rank table next to the existing XP table** (both visible — the XP table is NOT deleted). All new components are unit-tested with `@testing-library/react` under a `jsdom` Vitest environment.

**Architecture:** The teacher dashboard consumes the class roster from the backend endpoint `GET /api/teacher/class-mastery` (defined in the separate backend plan `2026-05-22-backend-mastery-sync.md`), which returns `{ students: [{ id, name, grade, attempts, mastery }] }`. The dashboard imports **only** from `src/engine/engineAPI.js` (`classMastery`) and reads skill labels from `src/engine/knowledgeGraph.js`. New work is **additive** — three small presentational components (`MasteryHeatmap`, `WeaknessAlerts`, `FairRankTable`) wired into the existing layout without restyling the recent redesign. Tests mock the endpoint shape.

**Tech Stack:** React 19, Vitest 4 (already present), `@testing-library/react` + `jsdom` + `@testing-library/jest-dom` (added by the Student Dashboard plan's Task 1; this plan reuses that setup), `framer-motion` (present), `recharts` (present — used by the existing charts), `lucide-react` (present — `AlertTriangle`, `Target` already imported).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — this plan implements the §7 `TeacherDashboard.jsx` row ("Replace hardcoded `xp > 5000` thresholds with `engine.classMastery()` heatmap; add per-skill weakness alerts; show fair-rank table next to old XP table") and surfaces §6.4 (fair leaderboard) and the §2 goal "surface per-skill weaknesses to teachers visually (heatmap + alerts)".

**Explicitly OUT of scope for this plan:** any change to the engine itself (`src/engine/**` is locked and built); the backend `/api/teacher/class-mastery` endpoint and its `mastery`/`attempts` data (separate backend plan `2026-05-22-backend-mastery-sync.md` — this plan only *consumes* its shape and *mocks* it in tests); the StudentDashboard (separate plan `2026-05-22-student-dashboard.md`); the UI test-tooling install (done by that plan's Task 1 — this plan depends on it).

**Dependency note:** This plan requires the UI test tooling from `2026-05-22-student-dashboard.md` **Task 1** (`@testing-library/react` + `jsdom` + the `renderWithRouter` helper + the `.test.jsx` include glob). If executed standalone, run that task first.

---

## Backend data contract this plan consumes (mocked in tests)

`GET /api/teacher/class-mastery` (Authorization: Bearer <teacher token>) returns:

```json
{
  "students": [
    {
      "id": "65f...",
      "name": "Priya S.",
      "grade": 5,
      "attempts": 142,
      "mastery": { "addition": 0.92, "subtraction": 0.88, "fractions-basic": 0.41 }
    }
  ]
}
```

- `mastery` contains **only practiced skills** (sparse) — the same contract `classMastery(students)` expects (a dense BKT-prior map would inflate aggregates). The backend plan is responsible for sparsifying.
- The dashboard derives everything else (status, heatmap cells, weakness alerts, fair rank) from this single payload via `classMastery(students)` → `{ perSkill, ranking }`. The existing XP/accuracy/streak fields stay sourced from the current `/api/teacher/students` fetch and the existing `MOCK_STUDENTS` fallback — the two data sources coexist (XP table = old endpoint; mastery views = new endpoint).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/teacherSource.js` | Pure helpers: status-from-mastery, heatmap matrix, weakness aggregation (new) |
| `src/components/MasteryHeatmap.jsx` | Students × skills CSS-grid heatmap from `classMastery(...).perSkill` + per-student mastery (new) |
| `src/components/WeaknessAlerts.jsx` | Per-skill class-weakness alerts below a threshold (new) |
| `src/components/FairRankTable.jsx` | Fair-rank table from `classMastery(...).ranking` (new) |
| `src/components/*.test.jsx` | Co-located component tests (new) |
| `src/engine/teacherSource.test.js` | Unit tests for the pure helpers (new) |
| `src/pages/TeacherDashboard.jsx` | Fetch class-mastery; replace `xp>5000` status logic; add heatmap + alerts + fair-rank table (modify) |
| `src/pages/TeacherDashboard.test.jsx` | Integration test for the wired dashboard (new) |

**Engine surface this plan consumes (import only — already implemented, do NOT redefine):**

```js
import { classMastery } from '../engine/engineAPI';
import { SKILLS, SKILL_IDS } from '../engine/knowledgeGraph';
// classMastery(students) -> { perSkill: { [skillId]: meanMastery }, ranking: [{ id, name, breadth, shrunkenMastery, score }] }
// SKILLS[skillId] -> { description, grade } ; SKILL_IDS -> ordered string[]
```

---

### Task 1: Verify UI test tooling is present

This plan's component tests need `@testing-library/react`, `jsdom`, the `renderWithRouter` helper, and the `.test.jsx` include glob — all added by `2026-05-22-student-dashboard.md` Task 1.

**Files:** none modified (verification only).

- [ ] **Step 1: Confirm the dependencies and helper exist**

Run:
```bash
npm ls @testing-library/react jsdom @testing-library/jest-dom
ls src/test/renderWithRouter.jsx
```
Expected: all three packages resolve and the helper file exists.

- [ ] **Step 2: If missing, run the Student Dashboard plan's Task 1 first**

If the previous step fails, execute `2026-05-22-student-dashboard.md` **Task 1** (install with `--legacy-peer-deps`, widen the Vitest `include` glob to `.test.{js,jsx}`, extend `src/test/setup.js`, create `src/test/renderWithRouter.jsx`) before continuing. Do NOT re-install or re-configure here — that task owns the setup. Then re-run Step 1 to confirm.

---

### Task 2: Teacher-side pure helpers (status, heatmap matrix, weakness aggregation)

The status-from-mastery rule (replacing `xp > 5000`), the students × skills matrix builder, and the per-skill class-weakness aggregator are pure functions — unit-tested in Node, reused by the components.

**Files:**
- Create: `src/engine/teacherSource.js`
- Test: `src/engine/teacherSource.test.js`

> Status mapping (mastery-based, replaces XP cutoffs): a student's **mean practiced mastery** drives status — `>= 0.75` → `excellent`, `>= 0.5` → `good`, `>= 0.3` → `needs_review`, else `at_risk`. A student with **no** practiced skills is `at_risk` (no signal). The weakness threshold defaults to `0.5` (a skill whose class-mean mastery is below it is "weak"); `minLearners` (default 1) guards against flagging a skill only one student has touched.

- [ ] **Step 1: Write the failing test**

Create `src/engine/teacherSource.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  statusFromMastery,
  meanPracticedMastery,
  buildHeatmapMatrix,
  weakSkills,
  WEAKNESS_THRESHOLD,
} from './teacherSource';

describe('teacherSource', () => {
  it('maps mean mastery to a status bucket', () => {
    expect(statusFromMastery({ addition: 0.9, subtraction: 0.8 })).toBe('excellent');
    expect(statusFromMastery({ addition: 0.6, subtraction: 0.5 })).toBe('good');
    expect(statusFromMastery({ addition: 0.35 })).toBe('needs_review');
    expect(statusFromMastery({ addition: 0.1 })).toBe('at_risk');
    expect(statusFromMastery({})).toBe('at_risk'); // no signal
  });

  it('computes mean over practiced skills only', () => {
    expect(meanPracticedMastery({ a: 0.4, b: 0.6 })).toBeCloseTo(0.5, 5);
    expect(meanPracticedMastery({})).toBe(0);
  });

  it('builds a students x skills matrix in skill order', () => {
    const students = [
      { id: 'A', name: 'Asha', mastery: { addition: 0.9 } },
      { id: 'B', name: 'Bilal', mastery: { subtraction: 0.4 } },
    ];
    const m = buildHeatmapMatrix(students, ['addition', 'subtraction']);
    expect(m.skills).toEqual(['addition', 'subtraction']);
    expect(m.rows[0]).toMatchObject({ id: 'A', name: 'Asha', cells: [0.9, null] });
    expect(m.rows[1]).toMatchObject({ id: 'B', name: 'Bilal', cells: [null, 0.4] });
  });

  it('flags skills whose class-mean mastery is below the threshold', () => {
    expect(WEAKNESS_THRESHOLD).toBe(0.5);
    const perSkill = { addition: 0.8, fractions_basic: 0.3, decimals: 0.45 };
    const learnerCounts = { addition: 5, fractions_basic: 4, decimals: 2 };
    const weak = weakSkills(perSkill, learnerCounts);
    expect(weak.map((w) => w.skillId)).toEqual(['fractions_basic', 'decimals']); // sorted weakest-first
    expect(weak[0]).toMatchObject({ skillId: 'fractions_basic', mean: 0.3, learners: 4 });
  });

  it('ignores skills below minLearners', () => {
    const weak = weakSkills({ decimals: 0.2 }, { decimals: 1 }, 0.5, 2);
    expect(weak).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- teacherSource`
Expected: FAIL ("Failed to resolve import ./teacherSource").

- [ ] **Step 3: Write the implementation**

Create `src/engine/teacherSource.js`:
```js
// Teacher-side pure helpers over the class payload. Imports only labels from the graph.
import { SKILL_IDS } from './knowledgeGraph';

export const WEAKNESS_THRESHOLD = 0.5; // class-mean mastery below this == weak skill

// Mean over the skills a student has actually practiced (sparse map). 0 if none.
export function meanPracticedMastery(mastery = {}) {
  const vals = Object.values(mastery);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Replaces the old `xp > 5000 ? 'excellent' : ...` rule with a mastery rule.
export function statusFromMastery(mastery = {}) {
  if (Object.keys(mastery).length === 0) return 'at_risk';
  const m = meanPracticedMastery(mastery);
  if (m >= 0.75) return 'excellent';
  if (m >= 0.5) return 'good';
  if (m >= 0.3) return 'needs_review';
  return 'at_risk';
}

// students x skills grid. cells[i] is the student's mastery for skills[i], or null.
export function buildHeatmapMatrix(students, skills = SKILL_IDS) {
  return {
    skills,
    rows: students.map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      cells: skills.map((sk) => (s.mastery?.[sk] != null ? s.mastery[sk] : null)),
    })),
  };
}

// Count how many students have practiced each skill (for minLearners gating).
export function learnerCounts(students, skills = SKILL_IDS) {
  const counts = {};
  for (const sk of skills) counts[sk] = 0;
  for (const s of students) {
    for (const sk of skills) {
      if (s.mastery?.[sk] != null) counts[sk] += 1;
    }
  }
  return counts;
}

// Skills whose class-mean mastery (perSkill) is below threshold, weakest first.
export function weakSkills(perSkill, counts = {}, threshold = WEAKNESS_THRESHOLD, minLearners = 1) {
  return Object.entries(perSkill)
    .filter(([id, mean]) => mean > 0 && mean < threshold && (counts[id] ?? 0) >= minLearners)
    .map(([id, mean]) => ({ skillId: id, mean, learners: counts[id] ?? 0 }))
    .sort((a, b) => a.mean - b.mean);
}

// Human label: 'fractions-basic' -> 'Fractions Basic'.
export function skillLabel(skillId) {
  return String(skillId)
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export { SKILL_IDS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- teacherSource`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/teacherSource.js src/engine/teacherSource.test.js
git commit -m "feat(teacher): add mastery-based status, heatmap matrix, weakness helpers"
```

---

### Task 3: Per-skill mastery heatmap (CSS grid)

A students × skills heatmap. **Rendered as a CSS grid, not a recharts chart** — justification: recharts has no native heatmap/matrix primitive (it is series-based: line/bar/pie/radar), a 10×13 cell grid is trivial in CSS Grid, and CSS cells are far more testable in jsdom (recharts' `ResponsiveContainer` measures to 0 in jsdom and renders no SVG). Color is a green→amber→red scale on the 0–1 mastery value; empty cells (unpracticed) are neutral gray.

**Files:**
- Create: `src/components/MasteryHeatmap.jsx`
- Test: `src/components/MasteryHeatmap.test.jsx`

> Props: `students` (the class payload) and optional `perSkill` (the class means row). The component builds the matrix with `buildHeatmapMatrix`. Columns use short skill abbreviations to fit; a legend explains the color scale. Each cell has a `title` (tooltip) with the full label + percent for accessibility.

- [ ] **Step 1: Write the failing test**

Create `src/components/MasteryHeatmap.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MasteryHeatmap, { masteryColor } from './MasteryHeatmap';

describe('masteryColor', () => {
  it('maps mastery to a green/amber/red scale and gray for empty', () => {
    expect(masteryColor(null)).toMatch(/#e2e8f0|#E2E8F0/i); // neutral gray
    expect(masteryColor(0.9)).not.toBe(masteryColor(0.2)); // distinct buckets
  });
});

describe('MasteryHeatmap', () => {
  const students = [
    { id: 'A', name: 'Asha', grade: 4, mastery: { addition: 0.9, subtraction: 0.3 } },
    { id: 'B', name: 'Bilal', grade: 5, mastery: { addition: 0.4 } },
  ];

  it('renders a header, each student row, and a percent cell', () => {
    const { getByText, getAllByTitle } = render(<MasteryHeatmap students={students} />);
    expect(getByText(/Skill Heatmap/i)).toBeInTheDocument();
    expect(getByText('Asha')).toBeInTheDocument();
    expect(getByText('Bilal')).toBeInTheDocument();
    // Asha's addition cell carries a descriptive title.
    expect(getAllByTitle(/Asha.*Addition.*90%/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows an empty state with no students', () => {
    const { getByText } = render(<MasteryHeatmap students={[]} />);
    expect(getByText(/No class mastery data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MasteryHeatmap`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/MasteryHeatmap.jsx`:
```jsx
import { motion } from 'framer-motion';
import { buildHeatmapMatrix, skillLabel, SKILL_IDS } from '../engine/teacherSource';

// Green (mastered) -> amber (developing) -> red (weak); neutral gray for unpracticed.
export function masteryColor(m) {
  if (m == null) return '#e2e8f0';
  if (m >= 0.75) return '#5EDAD0';
  if (m >= 0.5) return '#7dd3a8';
  if (m >= 0.3) return '#FFCA42';
  return '#FF7052';
}

// Short column header, e.g. 'fractions-basic' -> 'FR' (first letters of first two words).
function abbrev(skillId) {
  const parts = String(skillId).split(/[-_]/);
  const a = (parts[0] || '').slice(0, 2);
  return a.toUpperCase();
}

export default function MasteryHeatmap({ students = [], skills = SKILL_IDS }) {
  if (!students.length) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
        <h3 className="font-display font-black text-2xl text-[#1e293b] mb-4">Skill Heatmap</h3>
        <p className="text-slate-400 font-bold text-sm">No class mastery data yet.</p>
      </motion.div>
    );
  }

  const { rows } = buildHeatmapMatrix(students, skills);
  const gridCols = `minmax(96px, 1.4fr) repeat(${skills.length}, minmax(28px, 1fr))`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
      className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-display font-black text-2xl text-[#1e293b]">Skill Heatmap</h3>
        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#FF7052' }} />Weak</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#FFCA42' }} />Developing</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#5EDAD0' }} />Mastered</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 'max-content' }}>
          {/* Header row */}
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: gridCols }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 self-end pb-1">Student</div>
            {skills.map((sk) => (
              <div key={sk} title={skillLabel(sk)}
                className="text-[9px] font-black text-slate-400 text-center self-end pb-1">{abbrev(sk)}</div>
            ))}
          </div>

          {/* Student rows */}
          {rows.map((row) => (
            <div key={row.id} className="grid gap-1 mb-1 items-center" style={{ gridTemplateColumns: gridCols }}>
              <div className="text-xs font-black text-[#1e293b] truncate pr-2">{row.name}</div>
              {row.cells.map((m, i) => (
                <div
                  key={i}
                  title={`${row.name} · ${skillLabel(skills[i])}: ${m == null ? 'not practiced' : Math.round(m * 100) + '%'}`}
                  className="h-7 rounded-md flex items-center justify-center text-[8px] font-black text-white/90"
                  style={{ background: masteryColor(m) }}
                >
                  {m == null ? '' : Math.round(m * 100)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- MasteryHeatmap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MasteryHeatmap.jsx src/components/MasteryHeatmap.test.jsx
git commit -m "feat(teacher): add CSS-grid per-skill mastery heatmap"
```

---

### Task 4: Per-skill weakness alerts

A panel listing skills whose **class-mean mastery** is below the weakness threshold (weakest first), so the teacher sees what to reteach. Driven by `classMastery(...).perSkill` plus `learnerCounts(students)`.

**Files:**
- Create: `src/components/WeaknessAlerts.jsx`
- Test: `src/components/WeaknessAlerts.test.jsx`

> Props: `perSkill` (class means) and `students` (to compute learner counts and the count of students below a per-skill cutoff). Each alert shows the skill label, class-mean percent, and how many students are below 0.5 on it. Uses the already-imported `AlertTriangle` lucide icon for visual parity with the existing "Needs Support" panel.

- [ ] **Step 1: Write the failing test**

Create `src/components/WeaknessAlerts.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import WeaknessAlerts from './WeaknessAlerts';

describe('WeaknessAlerts', () => {
  const students = [
    { id: 'A', name: 'Asha', mastery: { addition: 0.9, 'fractions-basic': 0.2 } },
    { id: 'B', name: 'Bilal', mastery: { addition: 0.8, 'fractions-basic': 0.4 } },
  ];
  const perSkill = { addition: 0.85, 'fractions-basic': 0.3 };

  it('lists weak skills weakest-first with class-mean percent', () => {
    const { getByText, queryByText } = render(<WeaknessAlerts perSkill={perSkill} students={students} />);
    expect(getByText(/Weakness Alerts/i)).toBeInTheDocument();
    expect(getByText(/Fractions Basic/i)).toBeInTheDocument();
    expect(getByText(/30%/)).toBeInTheDocument();        // class mean
    expect(queryByText(/^Addition$/)).toBeNull();        // strong skill not listed
  });

  it('shows an all-clear state when no skill is weak', () => {
    const { getByText } = render(<WeaknessAlerts perSkill={{ addition: 0.85 }} students={students} />);
    expect(getByText(/No class-wide weaknesses/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- WeaknessAlerts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/WeaknessAlerts.jsx`:
```jsx
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { weakSkills, learnerCounts, skillLabel, SKILL_IDS } from '../engine/teacherSource';

const BELOW_CUTOFF = 0.5; // a student is "struggling" on a skill below this

export default function WeaknessAlerts({ perSkill = {}, students = [] }) {
  const counts = learnerCounts(students, SKILL_IDS);
  const weak = weakSkills(perSkill, counts);

  // For each weak skill, how many students are below the per-student cutoff.
  const strugglingCount = (skillId) =>
    students.filter((s) => s.mastery?.[skillId] != null && s.mastery[skillId] < BELOW_CUTOFF).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
      className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-display font-black text-2xl text-[#1e293b]">Weakness Alerts</h3>
        <div className="px-4 py-2 bg-red-50 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
          <AlertTriangle size={14} /> Reteach
        </div>
      </div>

      {weak.length === 0 ? (
        <p className="text-slate-400 font-bold text-sm">✅ No class-wide weaknesses — every practiced skill is at or above {Math.round(BELOW_CUTOFF * 100)}%.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weak.map((w) => (
            <div key={w.skillId} className="flex items-center gap-4 p-4 rounded-3xl bg-[#FFF1ED] border border-[#FF7052]/20">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-[#1e293b] leading-tight">{skillLabel(w.skillId)}</p>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  Class avg {Math.round(w.mean * 100)}% · {strugglingCount(w.skillId)}/{w.learners} below {Math.round(BELOW_CUTOFF * 100)}%
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-500">
                Weak
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- WeaknessAlerts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WeaknessAlerts.jsx src/components/WeaknessAlerts.test.jsx
git commit -m "feat(teacher): add per-skill weakness alerts panel"
```

---

### Task 5: Fair-rank table

A table of `classMastery(...).ranking` shown **next to** (not replacing) the existing XP roster. Columns: rank, student, breadth (skills mastered), shrunken mastery %, fair score.

**Files:**
- Create: `src/components/FairRankTable.jsx`
- Test: `src/components/FairRankTable.test.jsx`

> Props: `students` (the class payload). The component calls `classMastery(students).ranking` (already sorted by `score` desc). It mirrors the existing roster table's class names (`w-full border-collapse text-left text-sm`, `badge` chips) so it sits beside the XP table without a restyle. Top-3 ranks get medal chips.

- [ ] **Step 1: Write the failing test**

Create `src/components/FairRankTable.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../engine/engineAPI', () => ({ classMastery: vi.fn() }));
import { classMastery } from '../engine/engineAPI';
import FairRankTable from './FairRankTable';

describe('FairRankTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the ranking with breadth and mastery percent', () => {
    classMastery.mockReturnValue({
      perSkill: {},
      ranking: [
        { id: 'B', name: 'Bilal', breadth: 5, shrunkenMastery: 0.82, score: 4.1 },
        { id: 'A', name: 'Asha', breadth: 1, shrunkenMastery: 0.61, score: 0.61 },
      ],
    });
    const students = [{ id: 'B', name: 'Bilal', attempts: 100, mastery: {} }];
    const { getByText } = render(<FairRankTable students={students} />);
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    expect(getByText('Bilal')).toBeInTheDocument();
    expect(getByText('82%')).toBeInTheDocument(); // shrunken mastery
    expect(getByText('4.10')).toBeInTheDocument(); // score, 2 dp
    expect(classMastery).toHaveBeenCalledWith(students);
  });

  it('shows an empty state with no students', () => {
    classMastery.mockReturnValue({ perSkill: {}, ranking: [] });
    const { getByText } = render(<FairRankTable students={[]} />);
    expect(getByText(/No ranking data/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- FairRankTable`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/FairRankTable.jsx`:
```jsx
import { motion } from 'framer-motion';
import { classMastery } from '../engine/engineAPI';

const RANK_BADGE = ['🥇', '🥈', '🥉'];

export default function FairRankTable({ students = [] }) {
  const ranking = students.length ? classMastery(students).ranking : [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-display font-black text-2xl text-[#1e293b]">Fair Ranking</h3>
        <span className="px-3 py-1 bg-[#5EDAD0]/10 text-[#5EDAD0] text-[10px] font-black uppercase tracking-[0.2em] rounded-full">Mastery-based</span>
      </div>

      {ranking.length === 0 ? (
        <p className="text-slate-400 font-bold text-sm">No ranking data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">Student</th>
                <th className="p-3 font-semibold">Skills Mastered</th>
                <th className="p-3 font-semibold">Avg Mastery</th>
                <th className="p-3 font-semibold">Fair Score</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="border-b border-slate-50 hover:bg-[#F7F9FC] transition-colors">
                  <td className="p-3 font-black text-[#1e293b]">{i < 3 ? RANK_BADGE[i] : i + 1}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FFCA42]/30 to-[#FF7052]/30 flex items-center justify-center text-sm font-bold shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <span className="font-bold text-[#1e293b]">{r.name}</span>
                    </div>
                  </td>
                  <td className="p-3"><span className="badge badge-primary text-xs">{r.breadth}</span></td>
                  <td className="p-3 font-semibold text-[#5EDAD0]">{Math.round((r.shrunkenMastery || 0) * 100)}%</td>
                  <td className="p-3 font-black text-[#FF7052]">{(r.score || 0).toFixed(2)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- FairRankTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FairRankTable.jsx src/components/FairRankTable.test.jsx
git commit -m "feat(teacher): add fair-rank table (classMastery ranking)"
```

---

### Task 6: Wire into `TeacherDashboard.jsx` — fetch class-mastery + replace XP status rule

Fetch `/api/teacher/class-mastery`, store it in state, and replace the hardcoded `xp > 5000` / `xp > 1000` status mapping with `statusFromMastery(...)` keyed by student id. The mastery payload merges into the existing `students` rows so the XP table's `status` column now reflects mastery, not XP.

**Files:**
- Modify: `src/pages/TeacherDashboard.jsx`

> The current `fetchStudents` (lines ~98–126) maps `/api/teacher/students` and sets `status` via `s.progress?.xp > 5000 ? 'excellent' : s.progress?.xp > 1000 ? 'good' : 'at_risk'`. We add a parallel `classMasteryData` state (the mastery payload), fetch it alongside, and recompute `status` from mastery. When the mastery fetch fails, status falls back to the existing XP rule so the page still works pre-backend.

- [ ] **Step 1: Add mastery state and import the helper**

In `src/pages/TeacherDashboard.jsx`, add to the top imports (after the existing store imports):
```jsx
import { statusFromMastery } from '../engine/teacherSource';
import MasteryHeatmap from '../components/MasteryHeatmap';
import WeaknessAlerts from '../components/WeaknessAlerts';
import FairRankTable from '../components/FairRankTable';
import { classMastery } from '../engine/engineAPI';
```

Inside the component, after the existing `const [sortBy, setSortBy] = useState('xp');` line, add:
```jsx
  const [classMasteryData, setClassMasteryData] = useState([]); // [{ id, name, grade, attempts, mastery }]
```

- [ ] **Step 2: Fetch class-mastery and recompute status from it**

Replace the entire `fetchStudents` function:
```jsx
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const resp = await fetch('http://localhost:5000/api/teacher/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        const mapped = data.map(s => ({
          id: s._id,
          name: s.name,
          grade: s.grade,
          avatar: s.avatar,
          level: s.progress?.level || 1,
          xp: s.progress?.xp || 0,
          accuracy: Math.round(s.progress?.history?.reduce((acc, h) => acc + h.accuracy, 0) / (s.progress?.history?.length || 1)) || 0,
          gamesPlayed: s.progress?.history?.length || 0,
          streak: s.progress?.streak || 0,
          lastActive: new Date(s.progress?.lastActive).toLocaleDateString(),
          status: (s.progress?.xp > 5000) ? 'excellent' : (s.progress?.xp > 1000) ? 'good' : 'at_risk'
        }));
        setStudents(mapped);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
```
with:
```jsx
  const fetchStudents = async () => {
    setLoading(true);
    // Fetch the adaptive-engine class mastery alongside the XP roster.
    let masteryById = {};
    try {
      const mResp = await fetch('http://localhost:5000/api/teacher/class-mastery', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (mResp.ok) {
        const mData = await mResp.json();
        const list = mData.students || [];
        setClassMasteryData(list);
        masteryById = Object.fromEntries(list.map((s) => [s.id, s.mastery || {}]));
      }
    } catch (e) {
      console.warn('class-mastery unavailable, falling back to XP status', e);
    }
    try {
      const resp = await fetch('http://localhost:5000/api/teacher/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        const mapped = data.map(s => {
          const mastery = masteryById[s._id];
          // Mastery-based status (replaces hardcoded xp>5000); XP rule is the fallback.
          const status = mastery
            ? statusFromMastery(mastery)
            : (s.progress?.xp > 5000) ? 'excellent' : (s.progress?.xp > 1000) ? 'good' : 'at_risk';
          return {
            id: s._id,
            name: s.name,
            grade: s.grade,
            avatar: s.avatar,
            level: s.progress?.level || 1,
            xp: s.progress?.xp || 0,
            accuracy: Math.round(s.progress?.history?.reduce((acc, h) => acc + h.accuracy, 0) / (s.progress?.history?.length || 1)) || 0,
            gamesPlayed: s.progress?.history?.length || 0,
            streak: s.progress?.streak || 0,
            lastActive: new Date(s.progress?.lastActive).toLocaleDateString(),
            status,
          };
        });
        setStudents(mapped);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
```

- [ ] **Step 3: Provide a mock-mastery fallback for the new components**

After the existing `const displayStudents = students.length > 0 ? students : MOCK_STUDENTS;` line, add a class-mastery display source so the heatmap/alerts/fair-rank render with the mock roster when the endpoint is absent (keeps the dashboard demoable offline):
```jsx
  // Class-mastery source for the new engine views. Falls back to a synthesized
  // mastery map derived from each mock student's accuracy when the endpoint is empty.
  const displayMastery = classMasteryData.length > 0
    ? classMasteryData
    : MOCK_STUDENTS.map((s) => ({
        id: s.id,
        name: s.name,
        grade: s.grade,
        attempts: s.gamesPlayed,
        mastery: {
          addition: Math.min(0.99, s.accuracy / 100),
          subtraction: Math.min(0.99, (s.accuracy - 5) / 100),
          multiplication: Math.min(0.99, (s.accuracy - 10) / 100),
          'fractions-basic': Math.min(0.99, (s.accuracy - 20) / 100),
          patterns: Math.min(0.99, (s.accuracy - 8) / 100),
        },
      }));
  const classAgg = displayMastery.length ? classMastery(displayMastery) : { perSkill: {}, ranking: [] };
```

- [ ] **Step 4: Run the suite to confirm nothing broke yet (no UI assertions added in this step)**

Run: `npm test -- teacherSource MasteryHeatmap WeaknessAlerts FairRankTable`
Expected: PASS (the four prior tasks' tests are unaffected by these edits).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TeacherDashboard.jsx
git commit -m "feat(teacher): fetch class-mastery and replace xp>5000 status with mastery"
```

---

### Task 7: Wire the heatmap, weakness alerts, and fair-rank table into the layout

Add the three new sections to `TeacherDashboard.jsx` and the integration test. The heatmap + weakness alerts go above the existing Student Table; the fair-rank table goes immediately **after** the existing roster table (both visible).

**Files:**
- Modify: `src/pages/TeacherDashboard.jsx`
- Test: `src/pages/TeacherDashboard.test.jsx`

> Insertion points: (a) the heatmap + weakness alerts as a new full-width row inserted between the "Grade Distribution + At-Risk Alerts" grid (ends ~line 309) and the "Student Table" block (starts ~line 311); (b) `<FairRankTable students={displayMastery} />` inserted immediately after the closing `</motion.div>` of the Student Table block (~line 417), before the page's closing `</div>`.

- [ ] **Step 1: Write the failing integration test**

Create `src/pages/TeacherDashboard.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

// No backend in tests: fetch rejects, so the dashboard uses MOCK_STUDENTS + synthesized mastery.
beforeEach(() => {
  global.fetch = vi.fn(() => Promise.reject(new Error('offline')));
});

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { name: 'Teacher' }, token: null }),
}));
vi.mock('../store/usePlayerStore', () => ({
  usePlayerStore: () => ({}),
}));

import TeacherDashboard from './TeacherDashboard';

describe('TeacherDashboard engine integration', () => {
  it('renders the heatmap, weakness alerts, fair-rank table, and keeps the XP roster', async () => {
    const { getByText, findByText } = renderWithRouter(<TeacherDashboard />);
    expect(await findByText(/Skill Heatmap/i)).toBeInTheDocument();
    expect(getByText(/Weakness Alerts/i)).toBeInTheDocument();
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    // The original XP roster table is still present (not deleted).
    expect(getByText(/Class Roster/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pages/TeacherDashboard`
Expected: FAIL (heatmap/alerts/fair-rank text not found).

- [ ] **Step 3: Insert the heatmap + weakness-alerts row before the Student Table**

Find the start of the Student Table block:
```jsx
      {/* Student Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} 
        className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 overflow-hidden">
```
Insert immediately ABOVE that comment:
```jsx
      {/* Adaptive Engine: per-skill mastery heatmap (full width) */}
      <div className="mb-10">
        <MasteryHeatmap students={displayMastery} />
      </div>

      {/* Adaptive Engine: per-skill weakness alerts (full width) */}
      <div className="mb-10">
        <WeaknessAlerts perSkill={classAgg.perSkill} students={displayMastery} />
      </div>

```

- [ ] **Step 4: Insert the fair-rank table after the Student Table**

Find the end of the Student Table block (its closing `</motion.div>`) followed by the page's final closing tags:
```jsx
          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-500">No students match your filters.</div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
```
Replace it with (adds the fair-rank table between the roster and the page close):
```jsx
          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-500">No students match your filters.</div>
          )}
        </div>
      </motion.div>

      {/* Adaptive Engine: fair-rank table (shown NEXT TO / below the XP roster, not replacing it) */}
      <div className="mt-10">
        <FairRankTable students={displayMastery} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- pages/TeacherDashboard`
Expected: PASS.

- [ ] **Step 6: Run the full suite + lint + build**

```bash
npm test
npm run lint
npm run build
```
Expected: all tests green; no new lint errors in `src/components/**`, `src/pages/TeacherDashboard.jsx`, `src/engine/teacherSource.js`; build succeeds. NOTE: the unused `RadarChart`/`Radar`/`PolarGrid`/`PolarAngleAxis`/`Legend` recharts imports that already exist in `TeacherDashboard.jsx` are pre-existing — do NOT add new unused imports, but pre-existing ones are out of scope to clean up here.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TeacherDashboard.jsx src/pages/TeacherDashboard.test.jsx
git commit -m "feat(teacher): wire heatmap, weakness alerts, and fair-rank table into dashboard"
```

---

## Self-Review

**1. Spec coverage (TeacherDashboard slice of §7):**
- "Replace hardcoded `xp > 5000` thresholds" → Task 2 (`statusFromMastery`) + Task 6 Step 2 (swap in `fetchStudents`, XP rule kept only as offline fallback). ✅
- "...with a per-skill mastery heatmap from `classMastery(...).perSkill` / per-student mastery" → Task 3 (`MasteryHeatmap`, students × skills CSS grid) + Task 7 Step 3. ✅
- "Per-skill weakness alerts (skills below a threshold across the class)" → Task 4 (`WeaknessAlerts`, `weakSkills(perSkill, counts)`) + Task 7 Step 3. ✅
- "Fair-rank table next to the existing XP table (do not delete the XP table; show both)" → Task 5 (`FairRankTable`) + Task 7 Step 4 (inserted after the roster; roster untouched). ✅
- Consumes the backend `/api/teacher/class-mastery` shape and mocks it in tests → contract section + Task 6 (fetch) + Task 7 test (fetch rejected → mock fallback). ✅

**2. Placeholder scan:** No "TBD"/"similar to above". Every code step has complete JSX/code; real className patterns (`rounded-[40px] p-8 shadow-sm border border-slate-50`, `badge badge-primary`, `w-full border-collapse text-left text-sm`) and the real existing `fetchStudents` body are reproduced verbatim before being replaced. ✅

**3. Engine-API consistency:** `classMastery` is called with the documented `[{ id, name, attempts, mastery }]` shape (Task 6 `displayMastery`, Task 5/7 props). `perSkill` (means) and `ranking` are read exactly as the engine returns them. Pure helpers (`teacherSource.js`) only import labels from `knowledgeGraph` and never reimplement engine logic. The "practiced skills only / sparse mastery" rule is honored — the backend contract section states the payload is sparse, and `meanPracticedMastery`/`buildHeatmapMatrix` treat missing skills as null, not prior. ✅

**4. Redesign preserved + XP table kept:** New sections reuse the existing card chrome (`bg-white rounded-[40px] p-8 shadow-sm border border-slate-50`) and the roster table's class names. The existing Weekly Progress / Skill Mastery / Grade Mix / Needs Support / Class Roster blocks are untouched; the XP roster table is explicitly retained (Self-Review item per spec "show both"). Only additions + one status-logic swap inside `fetchStudents`. ✅

**5. Heatmap rendering choice:** CSS Grid, not recharts — recharts is series-based (no matrix/heatmap primitive), a 10×13 cell grid is trivial and accessible (per-cell `title`), and it is reliably testable in jsdom where recharts' `ResponsiveContainer` measures to 0. Justified in Task 3's preamble. ✅

**6. Test isolation:** Component tests opt into jsdom via `// @vitest-environment jsdom`; engine helper tests (`teacherSource.test.js`) stay in Node. `engineAPI` and stores are mocked per file; the integration test rejects `fetch` to exercise the offline mock-mastery path deterministically. ✅

---

## Open Questions

1. **`mastery`/`attempts` provenance:** the backend plan must define how per-student `mastery` and scalar `attempts` are computed server-side (aggregate the synced `masteryState`?). This plan assumes a sparse, practiced-only `mastery` map per student — confirm in `2026-05-22-backend-mastery-sync.md`.
2. **Status thresholds:** the mastery→status cutoffs (`0.75 / 0.5 / 0.3`) are plan-chosen to mirror the engine's `0.75` mastery cutoff. Should the guide sign off on these bands, and should they align exactly with the heatmap color buckets (currently they do)?
3. **Weakness threshold:** `WEAKNESS_THRESHOLD = 0.5` and `minLearners = 1`. For a small rural class, is flagging a skill only one student has touched useful, or should `minLearners` default to e.g. 3?
4. **Heatmap density:** 13 skills × up to ~30 students may overflow horizontally on a phone. The grid scrolls horizontally; is that acceptable for the teacher (likely on tablet/desktop), or do we need a "top N weakest skills only" condensed mode for mobile?
5. **Mock-mastery fallback realism:** Task 6 Step 3 synthesizes mastery from `accuracy` for the offline/demo path. Is that acceptable for the Dean demo, or should the demo always run against a seeded backend so the heatmap reflects real engine output?
6. **Two endpoints, one roster:** XP fields come from `/api/teacher/students` and mastery from `/api/teacher/class-mastery`, joined by id. Should the backend instead return a single merged payload to avoid the join and a second round-trip? (Backend-plan decision.)
</content>
</invoke>
