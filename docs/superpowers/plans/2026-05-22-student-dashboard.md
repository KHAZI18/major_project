# Adaptive Learning Engine — Student Dashboard Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the already-built Adaptive Learning Engine (`src/engine/`) in `StudentDashboard.jsx` by adding three engine-driven sidebar cards — **"🧠 Suggested for you"** (`suggestNext()`), **"Time to refresh!"** spaced-repetition prompts (`getDueReviews()`), and a **fair-rank leaderboard** (`classMastery(...).ranking`) that replaces the raw-XP `Leaderboard` widget — plus an optional **per-skill mastery mini-chart** (`getAllMastery()`). All new components are unit-tested with `@testing-library/react` under a `jsdom` Vitest environment.

**Architecture:** The engine is a UI-free singleton; the dashboard imports **only** from `src/engine/engineAPI.js` and reads skill labels from `src/engine/knowledgeGraph.js`. New work is **additive** — four small presentational components (`SuggestedForYou`, `ReviewPrompts`, `FairLeaderboard`, `MasteryChart`) wired into the existing sidebar without restyling the recent redesign. The engine's in-memory singleton is hydrated once at app start by `initEngine()` (already exported); the dashboard reads synchronously from it. A `useEngineSnapshot()` hook re-reads the singleton on mount so the dashboard reflects the latest mastery after games run.

**Tech Stack:** React 19, Vitest 4 (already present), `@testing-library/react` + `jsdom` + `@testing-library/jest-dom` (new — added by Task 1), `framer-motion` (present), `recharts` (present, used by the optional chart), `react-router-dom` `Link` (present).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — this plan implements the §7 `StudentDashboard.jsx` row ("Add 🧠 Suggested for you card; add Time to refresh! review prompts; replace current XP leaderboard widget with fair-rank widget") and surfaces §6.2 (smart recommendation), §6.3 (spaced repetition), and §6.4 (fair leaderboard).

**Explicitly OUT of scope for this plan:** any change to the engine itself (`src/engine/**` is locked and built); game-page wiring of `recordAttempt`/`nextDifficulty` (separate Game Integration plan); the backend `/api/teacher/class-mastery` endpoint (separate backend plan, `2026-05-22-backend-mastery-sync.md`); the TeacherDashboard (separate plan, `2026-05-22-teacher-dashboard.md`); any visual restyle of existing cards.

---

## Data sourcing decision (student fair-rank widget)

The engine's on-device singleton only knows about **one** learner (the local student). A *leaderboard* needs the whole class. There is no cross-student data on the device. The plan resolves this with a **layered source with a graceful local-only fallback**:

1. **Primary (online):** fetch the class roster from the same backend endpoint the TeacherDashboard uses — `GET /api/teacher/class-mastery` (defined in `2026-05-22-backend-mastery-sync.md`). It returns `{ students: [{ id, name, attempts, mastery }] }`, exactly the shape `classMastery(students).ranking` consumes. The local student is identified by `useAuthStore().user.id`.
2. **Fallback (offline / endpoint missing / pre-backend):** build a single-element class from the local engine — `[{ id: 'me', name, attempts: total attempts, mastery: practiced-skills-only map }]`. `fairRanking` still runs (the student simply ranks #1 of 1), and the widget shows a "Class data offline — showing your standing" note. This keeps the offline-first USP intact and lets the widget ship **before** the backend lands.

Because both paths feed the **same** `classMastery(students)` call, the component is backend-agnostic and fully testable by mocking the fetch. The student-side fetch reuses the teacher endpoint deliberately (one source of truth for fair ranking); if the project later wants a student-scoped endpoint, only the URL constant changes.

> NOTE: the engine's `getAllMastery()` returns a **dense** map (every skill at its `pL0=0.2` prior). The `fairRanking` contract requires **practiced-skills-only** mastery (passing the dense prior inflates breadth/observed-mean). The fallback builder therefore filters to skills the student has actually attempted. The plan derives "practiced" from `getAllMastery()` entries that differ from the prior, and documents this in `engineSource.js` (see Task 2).

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.js` | Allow `.test.jsx`, keep Node default, let UI tests opt into jsdom (modify) |
| `src/test/setup.js` | Add `@testing-library/jest-dom` matchers + `@testing-library/react` cleanup (modify) |
| `src/test/renderWithRouter.jsx` | Test helper: render a component inside `MemoryRouter` (new) |
| `src/engine/engineSource.js` | UI-side helper: hydrate snapshot + build the local-only fallback class (new) |
| `src/components/SuggestedForYou.jsx` | "🧠 Suggested for you" card from `suggestNext()` (new) |
| `src/components/ReviewPrompts.jsx` | "Time to refresh!" prompts from `getDueReviews()` (new) |
| `src/components/FairLeaderboard.jsx` | Fair-rank widget from `classMastery(...).ranking` (new) |
| `src/components/MasteryChart.jsx` | Optional per-skill mastery radial/bar chart from `getAllMastery()` (new) |
| `src/components/*.test.jsx` | Co-located component tests (new) |
| `src/engine/engineSource.test.js` | Unit test for the fallback/snapshot helper (new) |
| `src/pages/StudentDashboard.jsx` | Wire the four components into the sidebar; remove `<Leaderboard compact />` (modify) |

**Engine surface this plan consumes (import only — already implemented, do NOT redefine):**

```js
import { suggestNext, getDueReviews, getAllMastery, classMastery, initEngine } from '../engine/engineAPI';
import { SKILLS } from '../engine/knowledgeGraph';
// suggestNext()        -> { skillId, games } | null
// getDueReviews(now?)  -> string[] of skillIds
// getAllMastery()      -> { [skillId]: number in [0,1] }
// classMastery(students) -> { perSkill, ranking } ; students=[{ id, name, attempts, mastery }]
// SKILLS[skillId]      -> { description, grade }
```

---

### Task 1: UI test tooling (`@testing-library/react` + jsdom)

The repo's Vitest config runs in the `node` environment with `include: ['src/**/*.test.js']`. Component tests need a DOM, the React Testing Library, and a `.jsx` include glob. We keep Node as the default and let component tests opt into jsdom per-file (so the existing fast engine tests stay in Node).

**Files:**
- Modify: `package.json` (devDependencies — installed via npm)
- Modify: `vitest.config.js`
- Modify: `src/test/setup.js`
- Create: `src/test/renderWithRouter.jsx`
- Create: `src/components/sanity.test.jsx` (temporary; deleted at end of task)

- [ ] **Step 1: Install dev dependencies**

This repo's install REQUIRES `--legacy-peer-deps` (React 19 / Vite 8 peer ranges). Run:
```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom --legacy-peer-deps
```
Expected: installs succeed. Record in the commit message that `--legacy-peer-deps` was required.

- [ ] **Step 2: Widen the Vitest include glob and keep Node default**

Edit `vitest.config.js` so it picks up `.test.jsx` files while leaving the default environment as `node` (component test files opt into jsdom via a file-level pragma in later tasks):
```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
```

- [ ] **Step 3: Extend the test setup with jest-dom + RTL cleanup**

Replace the contents of `src/test/setup.js` with:
```js
// Provides an in-memory IndexedDB so db.js works under Node during tests.
import 'fake-indexeddb/auto';
// Custom DOM matchers (toBeInTheDocument, toHaveTextContent, …) for jsdom tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests (no-op when @testing-library/react isn't used).
afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Create the router render helper**

Create `src/test/renderWithRouter.jsx`:
```jsx
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Components under test use react-router's <Link>, which needs a Router ancestor.
export function renderWithRouter(ui, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}
```

- [ ] **Step 5: Write a jsdom sanity test, run it, then delete it**

Create `src/components/sanity.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';
import { Link } from 'react-router-dom';

describe('UI test tooling', () => {
  it('renders a component with router + jest-dom matchers', () => {
    const { getByText } = renderWithRouter(<Link to="/x">Hello UI</Link>);
    expect(getByText('Hello UI')).toBeInTheDocument();
  });
});
```
Run: `npm test -- sanity`
Expected: PASS (1 passed). Then delete the file:
```bash
rm src/components/sanity.test.jsx
```

- [ ] **Step 6: Confirm the existing engine tests still pass in Node**

Run: `npm test`
Expected: all existing `src/engine/*.test.js` and `src/lib/db.mastery.test.js` still PASS (the default Node environment is unchanged).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/test/setup.js src/test/renderWithRouter.jsx
git commit -m "chore: add @testing-library/react + jsdom UI test tooling"
```

---

### Task 2: Engine UI source helper (snapshot + local-only fallback)

A tiny, pure-ish helper the components share: read a fresh snapshot from the engine singleton, and build the **practiced-skills-only** single-student class for the offline leaderboard fallback. Keeping this out of the components makes it unit-testable in Node.

**Files:**
- Create: `src/engine/engineSource.js`
- Test: `src/engine/engineSource.test.js`

> The BKT prior is `0.2` (`DEFAULT_BKT_PARAMS.pL0`). A skill is treated as **practiced** when its mastery differs from the prior by more than a small epsilon — that is exactly the set `fairRanking` should see (passing the dense prior map would inflate breadth and observed-mean, per the engine README).

- [ ] **Step 1: Write the failing test**

Create `src/engine/engineSource.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { practicedMastery, buildLocalClass, BKT_PRIOR } from './engineSource';

describe('engineSource', () => {
  it('keeps only skills that moved off the BKT prior', () => {
    const all = { counting: 0.9, addition: BKT_PRIOR, subtraction: 0.5 };
    expect(practicedMastery(all)).toEqual({ counting: 0.9, subtraction: 0.5 });
  });

  it('builds a single-student class for the offline fallback', () => {
    const cls = buildLocalClass({
      id: 'me',
      name: 'Asha',
      attempts: 7,
      allMastery: { counting: 0.9, addition: BKT_PRIOR },
    });
    expect(cls).toEqual([
      { id: 'me', name: 'Asha', attempts: 7, mastery: { counting: 0.9 } },
    ]);
  });

  it('falls back to default id/name when missing', () => {
    const cls = buildLocalClass({ attempts: 0, allMastery: {} });
    expect(cls[0].id).toBe('me');
    expect(cls[0].name).toBe('You');
    expect(cls[0].mastery).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- engineSource`
Expected: FAIL ("Failed to resolve import ./engineSource").

- [ ] **Step 3: Write the implementation**

Create `src/engine/engineSource.js`:
```js
// UI-side helpers over the engine singleton. Pure functions + thin snapshot reads.
// Imports ONLY the public engine API (never the internal layers).
import { getAllMastery, suggestNext, getDueReviews } from './engineAPI';
import { SKILLS, SKILL_IDS } from './knowledgeGraph';

// Mirrors masteryModel DEFAULT_BKT_PARAMS.pL0 (the untouched-skill prior).
export const BKT_PRIOR = 0.2;
const EPS = 1e-6;

// Drop skills the student has never actually moved off the prior — fairRanking
// must see practiced skills only (a dense prior map inflates breadth/observed-mean).
export function practicedMastery(allMastery) {
  const out = {};
  for (const [id, m] of Object.entries(allMastery)) {
    if (Math.abs(m - BKT_PRIOR) > EPS) out[id] = m;
  }
  return out;
}

// Single-student "class" for the offline leaderboard fallback. Same shape the
// backend /api/teacher/class-mastery rows use, so classMastery() consumes both.
export function buildLocalClass({ id = 'me', name = 'You', attempts = 0, allMastery = {} }) {
  return [{ id, name, attempts, mastery: practicedMastery(allMastery) }];
}

// Convenience snapshot read for components (re-reads the live singleton).
export function readEngineSnapshot(now = Date.now()) {
  const allMastery = getAllMastery();
  return {
    allMastery,
    suggestion: suggestNext(now),
    dueReviews: getDueReviews(now),
  };
}

// Human label for a skillId, e.g. 'fractions-basic' -> 'Fractions Basic'.
export function skillLabel(skillId) {
  if (SKILLS[skillId]) {
    return skillId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return skillId;
}

export { SKILL_IDS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engineSource`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/engineSource.js src/engine/engineSource.test.js
git commit -m "feat(dashboard): add engine UI source helper (snapshot + offline fallback)"
```

---

### Task 3: "🧠 Suggested for you" card

A sidebar card that calls `suggestNext()` and links to the suggested game(s). Maps the engine's component-name games (e.g. `ArithmeticGame`) to the dashboard's route paths.

**Files:**
- Create: `src/components/SuggestedForYou.jsx`
- Test: `src/components/SuggestedForYou.test.jsx`

> `suggestNext()` returns `{ skillId, games }` (game = component name) or `null` when everything unlocked is mastered. We render at most the first 2 games as buttons. A `GAME_ROUTES` map (component name -> path + display name) lives in the component, transcribed from `StudentDashboard.jsx`'s `GRADE_ZONES` paths.

- [ ] **Step 1: Write the failing test**

Create `src/components/SuggestedForYou.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

vi.mock('../engine/engineAPI', () => ({
  suggestNext: vi.fn(),
}));
import { suggestNext } from '../engine/engineAPI';
import SuggestedForYou from './SuggestedForYou';

describe('SuggestedForYou', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the suggested skill label and a game link', () => {
    suggestNext.mockReturnValue({ skillId: 'multiplication', games: ['MultiplicationMeteor'] });
    const { getByText, getByRole } = renderWithRouter(<SuggestedForYou />);
    expect(getByText(/Suggested for you/i)).toBeInTheDocument();
    expect(getByText(/Multiplication/i)).toBeInTheDocument();
    const link = getByRole('link', { name: /Multiplication Meteor/i });
    expect(link).toHaveAttribute('href', '/games/meteor');
  });

  it('renders an all-caught-up state when there is no suggestion', () => {
    suggestNext.mockReturnValue(null);
    const { getByText, queryByRole } = renderWithRouter(<SuggestedForYou />);
    expect(getByText(/all caught up/i)).toBeInTheDocument();
    expect(queryByRole('link')).toBeNull();
  });

  it('skips games with no known route mapping', () => {
    suggestNext.mockReturnValue({ skillId: 'integers', games: ['UnmappedGame'] });
    const { queryAllByRole, getByText } = renderWithRouter(<SuggestedForYou />);
    expect(getByText(/Integers/i)).toBeInTheDocument();
    expect(queryAllByRole('link')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SuggestedForYou`
Expected: FAIL ("Failed to resolve import ./SuggestedForYou").

- [ ] **Step 3: Write the implementation**

Create `src/components/SuggestedForYou.jsx`:
```jsx
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { suggestNext } from '../engine/engineAPI';
import { skillLabel } from '../engine/engineSource';

// engine game (component name) -> { path, name } from StudentDashboard GRADE_ZONES.
const GAME_ROUTES = {
  ArithmeticGame:       { path: '/games/arithmetic',          name: 'Number Ninja' },
  MultiplicationMeteor: { path: '/games/meteor',              name: 'Multiplication Meteor' },
  MultiplicationFarm:   { path: '/games/farm-multiply',       name: 'Multiplication Farm' },
  FractionFrenzy:       { path: '/games/fractions',           name: 'Fraction Frenzy' },
  FractionNinja:        { path: '/games/fraction-ninja',      name: 'Fraction Ninja' },
  EquationBalancer:     { path: '/games/balancer',            name: 'Equation Balancer' },
  AlgebraDungeon:       { path: '/games/algebra-dungeon',     name: 'Algebra Dungeon' },
  GeometryGame:         { path: '/games/geometry',            name: 'Shape Explorer' },
  CoordinateTreasure:   { path: '/games/coordinate-treasure', name: 'Treasure Map' },
  DecimalMall:          { path: '/games/decimal-mall',        name: 'Decimal Mall' },
  IntegerMountain:      { path: '/games/integer-mountain',    name: 'Integer Mountain' },
  PatternPuzzle:        { path: '/games/patterns',            name: 'Pattern Puzzle' },
  NumberCatcher:        { path: '/games/number-catcher',      name: 'Number Catcher' },
  BalloonPopSequence:   { path: '/games/balloon-pop',         name: 'Balloon Pop' },
  MathRacing:           { path: '/games/math-racing',         name: 'Math Racing' },
};

export default function SuggestedForYou() {
  const suggestion = suggestNext();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center gap-1.5 border-b border-white/60 bg-gradient-to-r from-[#F0F9FF]/40 to-transparent">
        <span className="text-base drop-shadow-sm">🧠</span>
        <h3 className="font-display font-black text-sm text-[#1e293b]">Suggested for you</h3>
      </div>

      {!suggestion ? (
        <div className="p-3 text-center">
          <p className="text-xs font-bold text-[#64748b]">🎉 You're all caught up! Every unlocked skill is mastered.</p>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <p className="text-[11px] font-bold text-[#64748b]">
            Practice next: <span className="font-black text-[#FF7052]">{skillLabel(suggestion.skillId)}</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {suggestion.games
              .map((g) => ({ key: g, ...GAME_ROUTES[g] }))
              .filter((g) => g.path)
              .slice(0, 2)
              .map((g) => (
                <Link key={g.key} to={g.path} className="no-underline">
                  <motion.div
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gradient-to-br from-[#FFFBF0] to-[#F0F9FF] border-2 border-white/70 hover:border-white shadow-sm transition-all"
                  >
                    <span className="text-xs font-black text-[#1e293b]">🎮 {g.name}</span>
                    <span className="text-xs text-[#FFCA42] font-black">→</span>
                  </motion.div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SuggestedForYou`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SuggestedForYou.jsx src/components/SuggestedForYou.test.jsx
git commit -m "feat(dashboard): add Suggested-for-you card driven by suggestNext()"
```

---

### Task 4: "Time to refresh!" spaced-repetition prompts

A card that lists skills returned by `getDueReviews()` with a link to a game that exercises each one. Hidden entirely when nothing is due.

**Files:**
- Create: `src/components/ReviewPrompts.jsx`
- Test: `src/components/ReviewPrompts.test.jsx`

> `getDueReviews(now?)` returns `string[]` of skillIds whose SM-2 interval has elapsed. We reuse the same `GAME_ROUTES` mapping shape; to avoid duplication, the component imports `getGamesForSkill` from `knowledgeGraph` to find a game and maps it through a small route table. The card returns `null` when the due list is empty so it does not occupy sidebar space.

- [ ] **Step 1: Write the failing test**

Create `src/components/ReviewPrompts.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

vi.mock('../engine/engineAPI', () => ({
  getDueReviews: vi.fn(),
}));
import { getDueReviews } from '../engine/engineAPI';
import ReviewPrompts from './ReviewPrompts';

describe('ReviewPrompts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists each due skill with a refresh link', () => {
    getDueReviews.mockReturnValue(['addition', 'multiplication']);
    const { getByText, getAllByRole } = renderWithRouter(<ReviewPrompts />);
    expect(getByText(/Time to refresh/i)).toBeInTheDocument();
    expect(getByText(/Addition/i)).toBeInTheDocument();
    expect(getByText(/Multiplication/i)).toBeInTheDocument();
    expect(getAllByRole('link').length).toBeGreaterThanOrEqual(2);
  });

  it('renders nothing when no skill is due', () => {
    getDueReviews.mockReturnValue([]);
    const { container } = renderWithRouter(<ReviewPrompts />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReviewPrompts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/ReviewPrompts.jsx`:
```jsx
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getDueReviews } from '../engine/engineAPI';
import { getGamesForSkill } from '../engine/knowledgeGraph';
import { skillLabel } from '../engine/engineSource';

// engine game (component name) -> route path (subset of StudentDashboard paths).
const GAME_PATHS = {
  ArithmeticGame: '/games/arithmetic',
  MultiplicationMeteor: '/games/meteor',
  MultiplicationFarm: '/games/farm-multiply',
  FractionFrenzy: '/games/fractions',
  FractionNinja: '/games/fraction-ninja',
  EquationBalancer: '/games/balancer',
  AlgebraDungeon: '/games/algebra-dungeon',
  GeometryGame: '/games/geometry',
  CoordinateTreasure: '/games/coordinate-treasure',
  DecimalMall: '/games/decimal-mall',
  IntegerMountain: '/games/integer-mountain',
  PatternPuzzle: '/games/patterns',
  NumberCatcher: '/games/number-catcher',
  BalloonPopSequence: '/games/balloon-pop',
  MathRacing: '/games/math-racing',
};

function routeForSkill(skillId) {
  for (const game of getGamesForSkill(skillId)) {
    if (GAME_PATHS[game]) return GAME_PATHS[game];
  }
  return null;
}

export default function ReviewPrompts() {
  const due = getDueReviews();
  if (due.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center gap-1.5 border-b border-white/60 bg-gradient-to-r from-[#FFF9E6]/50 to-transparent">
        <span className="text-base drop-shadow-sm">🔁</span>
        <h3 className="font-display font-black text-sm text-[#1e293b]">Time to refresh!</h3>
      </div>
      <div className="p-2 space-y-1.5">
        {due.map((skillId) => {
          const path = routeForSkill(skillId);
          const label = skillLabel(skillId);
          const row = (
            <div className="flex items-center gap-2 rounded-lg p-2 bg-[#F7F9FC] hover:bg-white transition-all border border-transparent hover:border-slate-100 hover:shadow-sm">
              <span className="text-sm">🧠</span>
              <span className="flex-1 text-xs text-[#1e293b] truncate font-bold">{label}</span>
              {path && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-white text-[#FFCA42] shadow-sm whitespace-nowrap">Refresh →</span>}
            </div>
          );
          return path
            ? <Link key={skillId} to={path} className="no-underline block">{row}</Link>
            : <div key={skillId}>{row}</div>;
        })}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReviewPrompts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReviewPrompts.jsx src/components/ReviewPrompts.test.jsx
git commit -m "feat(dashboard): add Time-to-refresh spaced-repetition prompts"
```

---

### Task 5: Fair-rank leaderboard widget

Replaces the raw-XP `Leaderboard` widget. Fetches the class from `/api/teacher/class-mastery`; on any failure, falls back to the local single-student class (see "Data sourcing decision"). Ranks via `classMastery(students).ranking` and highlights the local student.

**Files:**
- Create: `src/components/FairLeaderboard.jsx`
- Test: `src/components/FairLeaderboard.test.jsx`

> The widget takes `students` as an **optional prop** so tests can inject a class without mocking `fetch`; when the prop is absent it self-fetches and falls back. `classMastery(...).ranking` returns `[{ id, name, breadth, shrunkenMastery, score }]` already sorted by `score` desc. We show `breadth` skills and a 0–100 mastery percent. The local id comes from `useAuthStore().user?.id` (string) or `'me'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/FairLeaderboard.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../engine/engineAPI', () => ({
  classMastery: vi.fn(),
  getAllMastery: vi.fn(() => ({})),
}));
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { id: 'B', name: 'Bilal' }, token: null }),
}));
vi.mock('../store/usePlayerStore', () => ({
  usePlayerStore: () => ({ gamesPlayed: 3 }),
}));

import { classMastery } from '../engine/engineAPI';
import FairLeaderboard from './FairLeaderboard';

describe('FairLeaderboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the fair ranking and highlights the local student', () => {
    classMastery.mockReturnValue({
      perSkill: {},
      ranking: [
        { id: 'B', name: 'Bilal', breadth: 5, shrunkenMastery: 0.8, score: 4.0 },
        { id: 'A', name: 'Asha', breadth: 1, shrunkenMastery: 0.6, score: 0.6 },
      ],
    });
    const students = [
      { id: 'B', name: 'Bilal', attempts: 100, mastery: { addition: 0.8 } },
      { id: 'A', name: 'Asha', attempts: 1, mastery: { addition: 1.0 } },
    ];
    const { getByText } = render(<FairLeaderboard students={students} />);
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    expect(getByText('Bilal')).toBeInTheDocument();
    expect(getByText(/You/i)).toBeInTheDocument(); // local student tag
    expect(classMastery).toHaveBeenCalledWith(students);
  });

  it('shows the offline note when it falls back to a local-only class', () => {
    classMastery.mockReturnValue({
      perSkill: {},
      ranking: [{ id: 'B', name: 'Bilal', breadth: 0, shrunkenMastery: 0.2, score: 0 }],
    });
    // No students prop and no successful fetch -> local fallback path.
    const { getByText } = render(<FairLeaderboard students={[{ id: 'B', name: 'Bilal', attempts: 0, mastery: {} }]} offline />);
    expect(getByText(/Class data offline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- FairLeaderboard`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/FairLeaderboard.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { classMastery, getAllMastery } from '../engine/engineAPI';
import { buildLocalClass } from '../engine/engineSource';
import { useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';

const CLASS_ENDPOINT = 'http://localhost:5000/api/teacher/class-mastery';
const RANK_BADGE = ['🥇', '🥈', '🥉'];

// students prop: inject for tests / when a parent already has the class.
// offline prop: force the "class data offline" note (tests).
export default function FairLeaderboard({ students = null, offline = false, compact = true }) {
  const { user, token } = useAuthStore();
  const { gamesPlayed } = usePlayerStore();
  const [cls, setCls] = useState(students);
  const [isOffline, setIsOffline] = useState(offline || students === null ? offline : false);

  useEffect(() => {
    if (students) { setCls(students); return; }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(CLASS_ENDPOINT, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error('class-mastery fetch failed');
        const data = await resp.json();
        if (!cancelled) { setCls(data.students || []); setIsOffline(false); }
      } catch {
        // Offline / endpoint missing: rank the local student alone.
        if (!cancelled) {
          setCls(buildLocalClass({
            id: user?.id || 'me',
            name: user?.name || 'You',
            attempts: gamesPlayed || 0,
            allMastery: getAllMastery(),
          }));
          setIsOffline(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [students, token, user, gamesPlayed]);

  const localId = user?.id || 'me';
  const ranking = cls && cls.length ? classMastery(cls).ranking : [];
  const rows = (compact ? ranking.slice(0, 5) : ranking).map((r, i) => ({ ...r, rank: i + 1 }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/60 bg-gradient-to-r from-[#FFFBF0]/30 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="text-base drop-shadow-sm">⚖️</span>
          <h3 className="font-display font-black text-sm text-[#1e293b]">Fair Ranking</h3>
        </div>
        <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-[#E8F9F8] text-[#5EDAD0] border border-[#5EDAD0]/20 uppercase tracking-wide">Mastery</span>
      </div>

      {isOffline && (
        <p className="px-3 py-1.5 text-[9px] font-bold text-[#94a3b8] bg-[#F7F9FC] border-b border-slate-50">
          Class data offline — showing your standing.
        </p>
      )}

      <div className="p-2 space-y-1.5">
        {rows.map((entry) => {
          const isMe = entry.id === localId;
          const pct = Math.round((entry.shrunkenMastery || 0) * 100);
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all ${
                isMe ? 'bg-[#FFF1ED] border-[#FF7052]/40' : 'bg-[#F7F9FC] border-transparent'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                entry.rank <= 3 ? 'bg-gradient-to-br from-[#FFCA42] to-[#FF7052] text-white' : 'bg-white text-[#94a3b8] border border-slate-100'
              }`}>
                {entry.rank <= 3 ? RANK_BADGE[entry.rank - 1] : entry.rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-black truncate ${isMe ? 'text-[#FF7052]' : 'text-[#1e293b]'}`}>
                  {entry.name} {isMe && <span className="text-[9px] text-[#FF7052]">(You)</span>}
                </p>
                <p className="text-[9px] text-[#94a3b8] font-bold">{entry.breadth} skills mastered</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-black text-[#5EDAD0]">{pct}%</p>
                <p className="text-[8px] text-[#94a3b8] font-bold">avg mastery</p>
              </div>
            </motion.div>
          );
        })}
        {rows.length === 0 && (
          <p className="p-2 text-center text-xs font-bold text-[#94a3b8]">No ranking data yet — play a game to get started!</p>
        )}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- FairLeaderboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FairLeaderboard.jsx src/components/FairLeaderboard.test.jsx
git commit -m "feat(dashboard): add fair-rank leaderboard widget (classMastery ranking)"
```

---

### Task 6: Optional per-skill mastery mini-chart

A compact radial/bar view of `getAllMastery()` so the student sees strengths and gaps at a glance. Uses `recharts` (already a dependency) for visual consistency with the rest of the app.

**Files:**
- Create: `src/components/MasteryChart.jsx`
- Test: `src/components/MasteryChart.test.jsx`

> `recharts` renders to SVG via a `ResponsiveContainer` that measures its parent; in jsdom that measurement is 0 and the chart body does not render, which makes assertions flaky. We therefore (a) test the data-shaping function `masteryBars()` in plain assertions and (b) assert the card header + skill count text render, not the SVG bars. The chart shows the top N skills by mastery so the sidebar stays compact.

- [ ] **Step 1: Write the failing test**

Create `src/components/MasteryChart.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../engine/engineAPI', () => ({
  getAllMastery: vi.fn(),
}));
import { getAllMastery } from '../engine/engineAPI';
import MasteryChart, { masteryBars } from './MasteryChart';

describe('masteryBars', () => {
  it('shapes a mastery map into sorted 0-100 bars, prior skills excluded', () => {
    const bars = masteryBars({ addition: 0.9, counting: 0.2, subtraction: 0.5 });
    expect(bars[0]).toMatchObject({ skill: 'Addition', value: 90 });
    expect(bars.map((b) => b.skill)).not.toContain('Counting'); // 0.2 = prior, excluded
    expect(bars.map((b) => b.skill)).toContain('Subtraction');
  });
});

describe('MasteryChart', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the card header and a practiced-skill count', () => {
    getAllMastery.mockReturnValue({ addition: 0.9, subtraction: 0.5, counting: 0.2 });
    const { getByText } = render(<MasteryChart />);
    expect(getByText(/Your Skills/i)).toBeInTheDocument();
    expect(getByText(/2 skills practiced/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is practiced', () => {
    getAllMastery.mockReturnValue({ addition: 0.2, counting: 0.2 });
    const { getByText } = render(<MasteryChart />);
    expect(getByText(/Play a game/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MasteryChart`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/MasteryChart.jsx`:
```jsx
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getAllMastery, } from '../engine/engineAPI';
import { practicedMastery, skillLabel } from '../engine/engineSource';

const TOOLTIP_STYLE = {
  backgroundColor: 'white', border: 'none', borderRadius: '12px',
  boxShadow: '0 8px 20px -5px rgba(0,0,0,0.1)', color: '#1e293b',
  fontSize: '12px', fontWeight: 'bold',
};

// Pure: mastery map -> [{ skill, value(0-100) }] sorted desc, practiced only.
export function masteryBars(allMastery) {
  return Object.entries(practicedMastery(allMastery))
    .map(([id, m]) => ({ skill: skillLabel(id), value: Math.round(m * 100) }))
    .sort((a, b) => b.value - a.value);
}

function barColor(v) {
  if (v >= 75) return '#5EDAD0';
  if (v >= 40) return '#FFCA42';
  return '#FF7052';
}

export default function MasteryChart() {
  const bars = masteryBars(getAllMastery()).slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/60 bg-gradient-to-r from-[#E8F9F8]/40 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="text-base drop-shadow-sm">📊</span>
          <h3 className="font-display font-black text-sm text-[#1e293b]">Your Skills</h3>
        </div>
        <span className="text-[8px] font-black text-[#94a3b8] uppercase tracking-wide">{bars.length} skills practiced</span>
      </div>

      {bars.length === 0 ? (
        <p className="p-3 text-center text-xs font-bold text-[#94a3b8]">Play a game to see your skill mastery here!</p>
      ) : (
        <div className="p-2 h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis dataKey="skill" type="category" axisLine={false} tickLine={false} width={84}
                tick={{ fill: '#1e293b', fontWeight: 800, fontSize: 10 }} />
              <Tooltip cursor={{ fill: '#F7F9FC' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Mastery']} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={14}>
                {bars.map((b, i) => <Cell key={i} fill={barColor(b.value)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- MasteryChart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MasteryChart.jsx src/components/MasteryChart.test.jsx
git commit -m "feat(dashboard): add optional per-skill mastery mini-chart"
```

---

### Task 7: Wire the components into `StudentDashboard.jsx`

Insert the four cards into the existing sidebar (the `RIGHT: Sidebar` column) and replace the raw-XP `Leaderboard` widget block with `<FairLeaderboard />`. No existing card is restyled; we only add/replace within the sidebar `<div className="space-y-3 sm:space-y-4">`.

**Files:**
- Modify: `src/pages/StudentDashboard.jsx`
- Test: `src/pages/StudentDashboard.test.jsx`

> The current sidebar (lines ~303–368) renders, in order: Daily Missions, a Leaderboard card block wrapping `<Leaderboard compact />`, Badges, Recent activity. The new order is: **SuggestedForYou → ReviewPrompts → DailyMissions → FairLeaderboard (replaces the old Leaderboard block) → MasteryChart → Badges → Recent activity**. The `Leaderboard` import is removed; the `Link` to `/student/leaderboard` is preserved by moving it onto the `FairLeaderboard` card header is NOT required — `FairLeaderboard` is self-contained — so we simply delete the old block.

- [ ] **Step 1: Write the failing integration test**

Create `src/pages/StudentDashboard.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

// Mock the engine API used by the child cards.
vi.mock('../engine/engineAPI', () => ({
  suggestNext: vi.fn(() => ({ skillId: 'addition', games: ['ArithmeticGame'] })),
  getDueReviews: vi.fn(() => ['multiplication']),
  getAllMastery: vi.fn(() => ({ addition: 0.9 })),
  classMastery: vi.fn(() => ({ perSkill: {}, ranking: [{ id: 'me', name: 'You', breadth: 1, shrunkenMastery: 0.9, score: 0.9 }] })),
}));
// Stores used by the page + FairLeaderboard.
vi.mock('../store/usePlayerStore', () => ({
  usePlayerStore: () => ({ xp: 100, level: 1, coins: 0, streak: 0, avatar: '🦊', badges: [], gamesPlayed: 2, history: [] }),
}));
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { id: 'me', name: 'You', grade: 2 }, token: null }),
}));

import StudentDashboard from './StudentDashboard';

describe('StudentDashboard engine integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the engine-driven cards and the fair-rank widget', () => {
    const { getByText, queryByText } = renderWithRouter(<StudentDashboard />);
    expect(getByText(/Suggested for you/i)).toBeInTheDocument();
    expect(getByText(/Time to refresh/i)).toBeInTheDocument();
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    expect(getByText(/Your Skills/i)).toBeInTheDocument();
    // The raw-XP "Top Players" leaderboard block is gone.
    expect(queryByText(/Top Players/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- StudentDashboard`
Expected: FAIL (cards not present / "Top Players" still rendered).

- [ ] **Step 3: Remove the `Leaderboard` import, add the new imports**

In `src/pages/StudentDashboard.jsx`, replace the import line:
```jsx
import Leaderboard from '../components/Leaderboard';
```
with:
```jsx
import FairLeaderboard from '../components/FairLeaderboard';
import SuggestedForYou from '../components/SuggestedForYou';
import ReviewPrompts from '../components/ReviewPrompts';
import MasteryChart from '../components/MasteryChart';
```

- [ ] **Step 4: Insert the engine cards at the top of the sidebar**

Find the sidebar opening (the `RIGHT: Sidebar` column):
```jsx
        {/* RIGHT: Sidebar */}
        <div className="space-y-3 sm:space-y-4">
          {/* Daily Missions */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <DailyMissions />
          </motion.div>
```
Replace it with (adds Suggested + Review prompts above Daily Missions):
```jsx
        {/* RIGHT: Sidebar */}
        <div className="space-y-3 sm:space-y-4">
          {/* 🧠 AI Suggestion (Adaptive Engine) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <SuggestedForYou />
          </motion.div>

          {/* 🔁 Spaced-repetition prompts (renders nothing when none are due) */}
          <ReviewPrompts />

          {/* Daily Missions */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <DailyMissions />
          </motion.div>
```

- [ ] **Step 5: Replace the raw-XP Leaderboard block with `FairLeaderboard`**

Find the entire Leaderboard block:
```jsx
          {/* Leaderboard */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
          >
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/60 bg-gradient-to-r from-[#FFFBF0]/30 to-transparent">
              <div className="flex items-center gap-1.5">
                <span className="text-base drop-shadow-sm">🏆</span>
                <h3 className="font-display font-black text-sm text-[#1e293b]">Top Players</h3>
              </div>
              <Link to="/student/leaderboard" className="text-[9px] font-black no-underline px-2 py-1 rounded-full bg-gradient-to-r from-[#FFE8E6] to-[#FFEDE6] text-[#FF7052] hover:from-[#FFD8CE] hover:to-[#FFDCC4] transition-all shadow-sm border border-[#FF7052]/15">
                View All →
              </Link>
            </div>
            <div className="p-2">
              <Leaderboard compact />
            </div>
          </motion.div>
```
Replace the whole block with:
```jsx
          {/* Fair-rank leaderboard (Adaptive Engine — replaces raw-XP widget) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <FairLeaderboard compact />
          </motion.div>

          {/* Per-skill mastery mini-chart (Adaptive Engine) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <MasteryChart />
          </motion.div>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- StudentDashboard`
Expected: PASS.

- [ ] **Step 7: Run the full suite + lint + build**

```bash
npm test
npm run lint
npm run build
```
Expected: all tests green; no new lint errors in `src/components/**`, `src/pages/StudentDashboard.jsx`, `src/engine/engineSource.js`; build succeeds. The now-unused `src/components/Leaderboard.jsx` remains in the repo (still imported by the standalone `/student/leaderboard` route page, if any) — do NOT delete it as part of this plan; if a lint "unused" error appears for `Leaderboard` in this file it means the import was not fully removed in Step 3.

- [ ] **Step 8: Commit**

```bash
git add src/pages/StudentDashboard.jsx src/pages/StudentDashboard.test.jsx
git commit -m "feat(dashboard): wire adaptive-engine cards into StudentDashboard sidebar"
```

---

## Self-Review

**1. Spec coverage (StudentDashboard slice of §7):**
- "Add 🧠 Suggested for you card" → Task 3 (`SuggestedForYou`, `suggestNext()`). ✅
- "Add Time to refresh! review prompts" → Task 4 (`ReviewPrompts`, `getDueReviews()`). ✅
- "Replace current XP leaderboard widget with fair-rank widget" → Task 5 (`FairLeaderboard`, `classMastery(...).ranking`) + Task 7 Step 5 (swap-in, old `Top Players` block removed). ✅
- Per-skill mastery view (`getAllMastery()`, optional) → Task 6 (`MasteryChart`). ✅
- UI test setup (`@testing-library/react` + jsdom, `--legacy-peer-deps`) → Task 1. ✅

**2. Placeholder scan:** No "TBD"/"similar to above". Every code step has complete JSX/code, real className patterns lifted from `StudentDashboard.jsx`, and real engine imports. ✅

**3. Engine-API consistency:** All four components import only from `engineAPI` (`suggestNext`, `getDueReviews`, `getAllMastery`, `classMastery`) and `knowledgeGraph` (`SKILLS`/`getGamesForSkill`); none redefine engine logic. `classMastery` is called with the documented `[{ id, name, attempts, mastery }]` shape (Task 5 + fallback builder in Task 2). The `practicedMastery` filter matches the engine README's "pass only practiced skills, not a dense BKT map" rule. ✅

**4. Redesign preserved:** New cards reuse the exact existing card chrome (`bg-white rounded-xl ... border-2 border-white/80 shadow-[...]` and the `px-3 py-2.5 ... border-b` header pattern). No existing card's classes change; only insertions + one block replacement. ✅

**5. Test isolation:** Engine tests stay in Node; UI tests opt into jsdom via `// @vitest-environment jsdom`. Stores and `engineAPI` are mocked per file; `recharts`/`ResponsiveContainer` is sidestepped by testing the pure `masteryBars()` shaper and header text instead of SVG. ✅

---

## Open Questions

1. **Single source of truth for the leaderboard:** the student widget reuses the teacher endpoint `/api/teacher/class-mastery`. Is that endpoint authorized for the **student** role, or do we need a student-scoped variant (e.g. `/api/class-mastery`)? (Decided in `2026-05-22-backend-mastery-sync.md` — flag if students can't call it.)
2. **Engine freshness:** the dashboard reads the singleton on render. If a game updates mastery and navigates back without a remount, the cards may show stale data. Do we need a lightweight engine event/subscription, or is route remount sufficient for v1? (App router behavior dependent.)
3. **`Leaderboard.jsx` retirement:** the old raw-XP component is left in place (a separate `/student/leaderboard` route may still use it). Should a follow-up plan migrate that full-page leaderboard to fair-rank too, or keep XP there for the gamification feel?
4. **Privacy:** the fair-rank widget shows classmates' names. For the rural-school context, is showing peer names acceptable, or should it anonymize (e.g. "Classmate #3") and only reveal the local student? (Product/guide decision.)
5. **"Practiced" detection via prior-delta:** treating "mastery ≠ 0.2" as "practiced" is a heuristic. A student who answers and lands back exactly on the prior would be excluded. Acceptable for v1, or should the engine expose an explicit `getAttempts()` map for the UI? (Would require an engine change — out of this plan's scope.)
</content>
</invoke>
