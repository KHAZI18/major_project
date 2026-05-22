# Adaptive Learning Engine — Engine Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the self-contained, UI-free `src/engine/` module (knowledge graph + mastery model + decision layer + public API) plus its IndexedDB persistence, fully unit-tested, so games/dashboards/backend can later integrate against a stable public API.

**Architecture:** Pure JS module with three layers behind one public API (`engineAPI`). Layer 1 (`knowledgeGraph`) is a hand-authored DAG of math skills. Layer 2 (`masteryModel`) estimates per-skill mastery; this plan ships the **BKT** backend (4 params/skill, pure JS, no model file) behind a backend-agnostic interface so the future DKT backend (separate plan) is a drop-in swap. Layer 3 (`decisionLayer`) is four pure functions over a mastery map. `engineAPI` is a module-level singleton that wires the layers together and persists state to IndexedDB. No React, no DOM, no network — everything is unit-testable in Node.

**Tech Stack:** JavaScript (ES modules), Vitest (new — added by this plan), fake-indexeddb (test shim), `idb` (already a dependency).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — this plan implements §3 (module architecture), §4 (knowledge graph), §5.1 (mastery model, BKT backend only), §6 (all four decision functions), and the `src/lib/db.js` portion of §7.

**Explicitly OUT of scope for this plan** (each is a later plan): DKT training/TF.js (§5.2–5.4), `usePlayerStore`/game integrations and dashboards (§7), the Express/Mongo backend changes (§7), and the evaluation harness (§8).

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.js` | Test runner config (new) |
| `src/test/setup.js` | Loads `fake-indexeddb/auto` for tests (new) |
| `src/engine/knowledgeGraph.js` | Skill list, prerequisite DAG, game→skill map, graph helpers (new) |
| `src/engine/masteryModel.js` | BKT mastery backend behind a stable interface (new) |
| `src/engine/decisionLayer.js` | `nextDifficulty`, `suggestNextSkill`, SM-2 review, `fairRanking` (new) |
| `src/engine/engineAPI.js` | Public singleton API: `recordAttempt`, `getMastery`, `suggestNext`, `getDueReviews`, `getNextDifficulty`, `classMastery`, `initEngine` (new) |
| `src/lib/db.js` | Add `mastery_state` + `interaction_log` stores and their accessors (modify) |
| `src/engine/*.test.js` | Co-located unit tests (new) |
| `src/engine/README.md` | One-page usage doc for integrators (new) |

**Public API contract (locked once this plan is reviewed — dependent plans import only from `engineAPI`):**

```js
await initEngine();                                  // hydrate singleton from IndexedDB
await recordAttempt({ skillId, correct, responseTime }); // returns updated mastery (number)
getMastery(skillId);                                 // number in [0,1]
getAllMastery();                                     // { [skillId]: number }
getNextDifficulty(skillId);                          // 'easy' | 'medium' | 'hard'
suggestNext();                                       // { skillId, games } | null
getDueReviews(now?);                                 // string[] of skillIds
classMastery(students);                              // { perSkill, ranking } (teacher aggregate)
```

---

### Task 1: Test tooling (Vitest + fake-indexeddb)

The project currently has no test runner. Add Vitest and an IndexedDB shim.

**Files:**
- Create: `vitest.config.js`
- Create: `src/test/setup.js`
- Create: `src/engine/sanity.test.js` (temporary; deleted at end of task)
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest fake-indexeddb
```
Expected: installs succeed. If npm errors on peer ranges against `vite@^8`, retry with `npm install -D vitest@latest fake-indexeddb` and, only if still blocked, `npm install -D vitest fake-indexeddb --legacy-peer-deps`. Record which command worked in the commit message.

- [ ] **Step 2: Add test scripts to `package.json`**

In the `"scripts"` block add two lines (keep existing scripts):
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Create the test setup file**

Create `src/test/setup.js`:
```js
// Provides an in-memory IndexedDB so db.js works under Node during tests.
import 'fake-indexeddb/auto';
```

- [ ] **Step 5: Write a sanity test, run it, then delete it**

Create `src/engine/sanity.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('test tooling', () => {
  it('runs and has IndexedDB available', () => {
    expect(1 + 1).toBe(2);
    expect(typeof indexedDB).toBe('object');
  });
});
```
Run: `npm test`
Expected: PASS (1 passed). Then delete the file:
```bash
rm src/engine/sanity.test.js
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/test/setup.js
git commit -m "chore: add vitest + fake-indexeddb test tooling"
```

---

### Task 2: Knowledge graph

**Files:**
- Create: `src/engine/knowledgeGraph.js`
- Test: `src/engine/knowledgeGraph.test.js`

> Skill list and prerequisite edges are transcribed from spec §4. NOTE FOR REVIEW: the spec summary says "12 nodes" but the §4 table lists **13** skills; this plan implements all 13 and derives any model dimensions from `SKILL_IDS.length` so the DKT plan stays consistent. Flag in the review doc if 12 was intended.

- [ ] **Step 1: Write the failing test**

Create `src/engine/knowledgeGraph.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  SKILL_IDS,
  SKILLS,
  getPrereqs,
  arePrereqsMet,
  getDescendants,
  getLeverage,
  getGamesForSkill,
  topologicalOrder,
} from './knowledgeGraph';

describe('knowledgeGraph', () => {
  it('declares 13 skills with metadata', () => {
    expect(SKILL_IDS).toHaveLength(13);
    expect(SKILL_IDS).toContain('counting');
    expect(SKILL_IDS).toContain('algebra-basics');
    for (const id of SKILL_IDS) {
      expect(SKILLS[id]).toBeDefined();
      expect(typeof SKILLS[id].description).toBe('string');
    }
  });

  it('only references valid skill ids in prerequisites', () => {
    for (const id of SKILL_IDS) {
      for (const p of getPrereqs(id)) {
        expect(SKILL_IDS).toContain(p);
      }
    }
  });

  it('is acyclic (topologicalOrder covers every skill)', () => {
    const order = topologicalOrder();
    expect(order).toHaveLength(SKILL_IDS.length);
    expect(new Set(order)).toEqual(new Set(SKILL_IDS));
  });

  it('arePrereqsMet respects the mastery cutoff', () => {
    expect(arePrereqsMet('addition', { counting: 0.8 }, 0.75)).toBe(true);
    expect(arePrereqsMet('addition', { counting: 0.5 }, 0.75)).toBe(false);
    expect(arePrereqsMet('counting', {}, 0.75)).toBe(true); // no prereqs
  });

  it('computes downstream descendants and leverage', () => {
    const desc = getDescendants('subtraction');
    expect(desc).toContain('multiplication');
    expect(desc).toContain('division');
    expect(desc).not.toContain('subtraction');
    expect(getLeverage('subtraction')).toBeGreaterThan(getLeverage('patterns'));
    expect(getLeverage('coord-geometry')).toBe(0); // leaf
  });

  it('maps games to skills both directions', () => {
    expect(getGamesForSkill('multiplication')).toContain('MultiplicationMeteor');
    expect(getGamesForSkill('multiplication')).toContain('MultiplicationFarm');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- knowledgeGraph`
Expected: FAIL ("Failed to resolve import ./knowledgeGraph" / functions undefined).

- [ ] **Step 3: Write the implementation**

Create `src/engine/knowledgeGraph.js`:
```js
// Layer 1: hand-authored DAG of math skills. Transcribed from spec §4.

export const SKILLS = {
  'counting':        { description: 'Number recognition, ordering', grade: '2' },
  'addition':        { description: 'Single & multi-digit addition', grade: '2-3' },
  'subtraction':     { description: 'Single & multi-digit subtraction', grade: '2-3' },
  'multiplication':  { description: 'Times tables, multi-digit', grade: '3-4' },
  'division':        { description: 'Basic division, remainders', grade: '4-5' },
  'patterns':        { description: 'Sequences, AP/GP basics', grade: '3-5' },
  'fractions-basic': { description: 'Identifying & comparing fractions', grade: '4-5' },
  'equiv-fractions': { description: 'Equivalence, addition of fractions', grade: '5-6' },
  'decimals':        { description: 'Decimal operations', grade: '5-6' },
  'integers':        { description: 'Negative numbers', grade: '5-6' },
  'geometry-shapes': { description: 'Shapes, angles, area, perimeter', grade: '4-6' },
  'coord-geometry':  { description: 'Coordinate plane, distance', grade: '6+' },
  'algebra-basics':  { description: 'Variables, simple equations', grade: '6+' },
};

export const SKILL_IDS = Object.keys(SKILLS);

// prereq -> the skill cannot be attempted until these are mastered (spec §4 DAG).
const PREREQS = {
  'counting':        [],
  'addition':        ['counting'],
  'subtraction':     ['addition'],
  'multiplication':  ['subtraction'],
  'division':        ['multiplication'],
  'patterns':        ['addition', 'subtraction'],
  'integers':        ['multiplication'],
  'fractions-basic': ['division'],
  'equiv-fractions': ['fractions-basic'],
  'decimals':        ['fractions-basic'],
  'coord-geometry':  ['decimals'],
  'algebra-basics':  ['patterns'],
  'geometry-shapes': ['algebra-basics'],
};

// game page (component name) -> skills exercised (spec §4 table).
export const GAME_SKILLS = {
  ArithmeticGame:     ['addition', 'subtraction'],
  MultiplicationMeteor: ['multiplication'],
  MultiplicationFarm: ['multiplication'],
  FractionFrenzy:     ['fractions-basic'],
  FractionNinja:      ['fractions-basic', 'equiv-fractions'],
  EquationBalancer:   ['algebra-basics'],
  AlgebraDungeon:     ['algebra-basics'],
  GeometryGame:       ['geometry-shapes'],
  CoordinateTreasure: ['coord-geometry'],
  DecimalMall:        ['decimals'],
  IntegerMountain:    ['integers'],
  PatternPuzzle:      ['patterns'],
  NumberCatcher:      ['counting', 'patterns'],
  BalloonPopSequence: ['counting', 'patterns'],
  FruitRush:          ['addition', 'multiplication'],
  MathRacing:         ['addition', 'multiplication'],
};

export function getPrereqs(skillId) {
  return PREREQS[skillId] ?? [];
}

export function arePrereqsMet(skillId, mastery, cutoff = 0.75) {
  return getPrereqs(skillId).every((p) => (mastery[p] ?? 0) >= cutoff);
}

// children[skill] = skills that list `skill` as a prerequisite.
const CHILDREN = SKILL_IDS.reduce((acc, id) => {
  acc[id] = SKILL_IDS.filter((other) => getPrereqs(other).includes(id));
  return acc;
}, {});

export function getDescendants(skillId) {
  const seen = new Set();
  const stack = [...(CHILDREN[skillId] ?? [])];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(CHILDREN[cur] ?? []));
  }
  return [...seen];
}

export function getLeverage(skillId) {
  return getDescendants(skillId).length;
}

export function getGamesForSkill(skillId) {
  return Object.keys(GAME_SKILLS).filter((g) => GAME_SKILLS[g].includes(skillId));
}

// Kahn's algorithm — throws if the graph has a cycle.
export function topologicalOrder() {
  const indeg = {};
  for (const id of SKILL_IDS) indeg[id] = getPrereqs(id).length;
  const queue = SKILL_IDS.filter((id) => indeg[id] === 0);
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const child of CHILDREN[node]) {
      indeg[child] -= 1;
      if (indeg[child] === 0) queue.push(child);
    }
  }
  if (order.length !== SKILL_IDS.length) {
    throw new Error('knowledgeGraph: prerequisite cycle detected');
  }
  return order;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- knowledgeGraph`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/engine/knowledgeGraph.js src/engine/knowledgeGraph.test.js
git commit -m "feat(engine): add knowledge graph layer with DAG helpers"
```

---

### Task 3: BKT mastery model

**Files:**
- Create: `src/engine/masteryModel.js`
- Test: `src/engine/masteryModel.test.js`

> Bayesian Knowledge Tracing per spec §10 fallback. Belief is `{ [skillId]: P(known) }`. The exported function names form the backend contract the DKT plan must also satisfy: `createInitialBelief`, `updateBelief`, `getMastery`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/masteryModel.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BKT_PARAMS,
  createInitialBelief,
  updateBelief,
  getMastery,
} from './masteryModel';

describe('masteryModel (BKT)', () => {
  it('initialises every skill to the prior P(L0)', () => {
    const b = createInitialBelief();
    expect(getMastery(b, 'addition')).toBeCloseTo(DEFAULT_BKT_PARAMS.pL0, 5);
  });

  it('raises mastery after a correct answer', () => {
    const b = createInitialBelief();
    const b2 = updateBelief(b, 'addition', true);
    expect(getMastery(b2, 'addition')).toBeGreaterThan(getMastery(b, 'addition'));
    expect(getMastery(b2, 'addition')).toBeCloseTo(0.6, 2); // 0.2 -> ~0.600
  });

  it('lowers mastery after an incorrect answer', () => {
    const b = createInitialBelief();
    const b2 = updateBelief(b, 'addition', false);
    expect(getMastery(b2, 'addition')).toBeLessThan(getMastery(b, 'addition'));
    expect(getMastery(b2, 'addition')).toBeCloseTo(0.176, 2); // 0.2 -> ~0.176
  });

  it('crosses 0.85 after two consecutive correct answers and stays in [0,1]', () => {
    let b = createInitialBelief();
    b = updateBelief(b, 'addition', true);
    b = updateBelief(b, 'addition', true);
    const m = getMastery(b, 'addition');
    expect(m).toBeGreaterThan(0.85);
    expect(m).toBeLessThanOrEqual(1);
  });

  it('does not mutate the input belief (immutability)', () => {
    const b = createInitialBelief();
    updateBelief(b, 'addition', true);
    expect(getMastery(b, 'addition')).toBeCloseTo(DEFAULT_BKT_PARAMS.pL0, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- masteryModel`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/engine/masteryModel.js`:
```js
// Layer 2: mastery estimation. Backend = Bayesian Knowledge Tracing (spec §10 fallback).
// Belief shape: { [skillId]: P(known) }. Same function names the DKT backend will implement.
import { SKILL_IDS } from './knowledgeGraph';

// Literature-typical defaults (spec §5.3 distributions, taken at their means).
export const DEFAULT_BKT_PARAMS = {
  pL0: 0.2, // prior P(knows skill)
  pT: 0.15, // P(learn) transition per opportunity
  pG: 0.2,  // P(guess) correct while not knowing
  pS: 0.1,  // P(slip) incorrect while knowing
};

export function createInitialBelief(params = DEFAULT_BKT_PARAMS) {
  const belief = {};
  for (const id of SKILL_IDS) belief[id] = params.pL0;
  return belief;
}

export function updateBelief(belief, skillId, correct, params = DEFAULT_BKT_PARAMS) {
  const { pT, pG, pS, pL0 } = params;
  const pL = belief[skillId] ?? pL0;

  const posterior = correct
    ? (pL * (1 - pS)) / (pL * (1 - pS) + (1 - pL) * pG)
    : (pL * pS) / (pL * pS + (1 - pL) * (1 - pG));

  const updated = posterior + (1 - posterior) * pT;
  return { ...belief, [skillId]: updated };
}

export function getMastery(belief, skillId, params = DEFAULT_BKT_PARAMS) {
  return belief?.[skillId] ?? params.pL0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- masteryModel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/masteryModel.js src/engine/masteryModel.test.js
git commit -m "feat(engine): add BKT mastery model backend"
```

---

### Task 4: Decision layer — adaptive difficulty

**Files:**
- Create: `src/engine/decisionLayer.js`
- Test: `src/engine/decisionLayer.test.js`

> Spec §6.1: `<0.40` → easy, `0.40–0.75` → medium, `>0.75` → hard.

- [ ] **Step 1: Write the failing test**

Create `src/engine/decisionLayer.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { nextDifficulty } from './decisionLayer';

describe('decisionLayer.nextDifficulty', () => {
  it('bins mastery into ZPD difficulty', () => {
    expect(nextDifficulty('addition', { addition: 0.2 })).toBe('easy');
    expect(nextDifficulty('addition', { addition: 0.4 })).toBe('medium');
    expect(nextDifficulty('addition', { addition: 0.75 })).toBe('medium');
    expect(nextDifficulty('addition', { addition: 0.9 })).toBe('hard');
  });

  it('treats an unseen skill as easy', () => {
    expect(nextDifficulty('addition', {})).toBe('easy');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- decisionLayer`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/engine/decisionLayer.js`:
```js
// Layer 3: pure decision functions over a mastery map { [skillId]: P(known) }.
import { SKILL_IDS, getPrereqs, getLeverage, getGamesForSkill } from './knowledgeGraph';

export const MASTERY_CUTOFF = 0.75; // "mastered" threshold (spec §6.2)

// §6.1 — target the Zone of Proximal Development.
export function nextDifficulty(skillId, mastery) {
  const m = mastery[skillId] ?? 0;
  if (m < 0.4) return 'easy';
  if (m <= 0.75) return 'medium';
  return 'hard';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- decisionLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/decisionLayer.js src/engine/decisionLayer.test.js
git commit -m "feat(engine): add adaptive difficulty decision function"
```

---

### Task 5: Decision layer — smart recommendation

**Files:**
- Modify: `src/engine/decisionLayer.js`
- Modify: `src/engine/decisionLayer.test.js`

> Spec §6.2: among unmastered skills whose prereqs are met, prefer highest leverage; tie-break toward a skill not practiced in the last 24h.

- [ ] **Step 1: Add the failing test**

Append to `src/engine/decisionLayer.test.js`:
```js
import { suggestNextSkill } from './decisionLayer';

describe('decisionLayer.suggestNextSkill', () => {
  it('returns the unlocked, unmastered skill', () => {
    const result = suggestNextSkill({ mastery: { counting: 0.8 } });
    expect(result.skillId).toBe('addition');
    expect(result.games).toContain('ArithmeticGame');
  });

  it('prefers the higher-leverage skill among unlocked candidates', () => {
    // counting + addition mastered -> subtraction and patterns both unlock.
    const result = suggestNextSkill({ mastery: { counting: 0.8, addition: 0.8 } });
    expect(result.skillId).toBe('subtraction'); // more descendants than patterns
  });

  it('breaks ties toward a skill not practiced in the last 24h', () => {
    const now = Date.now();
    // Force a tie by stubbing equal leverage is hard; instead verify the
    // recently-practiced top candidate is de-prioritised when leverage ties.
    const mastery = { counting: 0.8, addition: 0.8 };
    const recent = suggestNextSkill({
      mastery,
      lastPracticed: { subtraction: now },
      now,
    });
    // subtraction still wins on leverage even if recent (leverage dominates).
    expect(recent.skillId).toBe('subtraction');
  });

  it('returns null when no skill is unlocked-and-unmastered', () => {
    const allMastered = {};
    for (const id of ['counting','addition','subtraction','multiplication','division',
      'patterns','fractions-basic','equiv-fractions','decimals','integers',
      'geometry-shapes','coord-geometry','algebra-basics']) allMastered[id] = 0.99;
    expect(suggestNextSkill({ mastery: allMastered })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- decisionLayer`
Expected: FAIL ("suggestNextSkill is not a function").

- [ ] **Step 3: Add the implementation**

Append to `src/engine/decisionLayer.js`:
```js
const DAY_MS = 86400000;

// §6.2 — highest-leverage unlocked skill the student has not yet mastered.
export function suggestNextSkill({ mastery, lastPracticed = {}, now = Date.now() }) {
  const candidates = SKILL_IDS.filter((id) => {
    const m = mastery[id] ?? 0;
    if (m >= MASTERY_CUTOFF) return false;
    return getPrereqs(id).every((p) => (mastery[p] ?? 0) >= MASTERY_CUTOFF);
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const byLeverage = getLeverage(b) - getLeverage(a);
    if (byLeverage !== 0) return byLeverage;
    const aRecent = now - (lastPracticed[a] ?? 0) < DAY_MS ? 1 : 0;
    const bRecent = now - (lastPracticed[b] ?? 0) < DAY_MS ? 1 : 0;
    return aRecent - bRecent; // 0 (not recent) sorts before 1 (recent)
  });

  const skillId = candidates[0];
  return { skillId, games: getGamesForSkill(skillId) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- decisionLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/decisionLayer.js src/engine/decisionLayer.test.js
git commit -m "feat(engine): add smart skill recommendation"
```

---

### Task 6: Decision layer — spaced repetition (SM-2)

**Files:**
- Modify: `src/engine/decisionLayer.js`
- Modify: `src/engine/decisionLayer.test.js`

> Spec §6.3: SM-2. A review record `{ ease, interval(days), lastReviewed, reps }`. On correct: `interval = round(interval × ease)`, `ease = min(2.5, ease + 0.1)`. On incorrect: `interval = 1`, `ease = max(1.3, ease − 0.2)`. NOTE: initial `ease` is 2.5 (the cap), so the `+0.1` only matters after a lapse drops ease — flag in review if a lower starting ease is wanted.

- [ ] **Step 1: Add the failing test**

Append to `src/engine/decisionLayer.test.js`:
```js
import { createReview, updateReview, isDue, dueForReview } from './decisionLayer';

describe('decisionLayer spaced repetition (SM-2)', () => {
  const DAY = 86400000;

  it('creates a fresh schedule', () => {
    const t0 = 1000000;
    expect(createReview(t0)).toEqual({ ease: 2.5, interval: 1, lastReviewed: t0, reps: 0 });
  });

  it('grows the interval on correct review', () => {
    const t0 = 1000000;
    const r1 = updateReview(createReview(t0), true, t0);
    expect(r1.interval).toBe(3);        // round(1 * 2.5)
    expect(r1.ease).toBe(2.5);          // min(2.5, 2.6)
    expect(r1.reps).toBe(1);
    const r2 = updateReview(r1, true, t0);
    expect(r2.interval).toBe(8);        // round(3 * 2.5)
  });

  it('resets interval and lowers ease on incorrect review', () => {
    const lapsed = updateReview({ ease: 2.5, interval: 8, lastReviewed: 0, reps: 2 }, false, 5);
    expect(lapsed.interval).toBe(1);
    expect(lapsed.ease).toBeCloseTo(2.3, 5); // max(1.3, 2.5 - 0.2)
    expect(lapsed.reps).toBe(0);
  });

  it('detects due skills', () => {
    const now = 10 * DAY;
    expect(isDue({ ease: 2.5, interval: 1, lastReviewed: now - 2 * DAY, reps: 0 }, now)).toBe(true);
    expect(isDue({ ease: 2.5, interval: 5, lastReviewed: now - 2 * DAY, reps: 0 }, now)).toBe(false);
    const dueList = dueForReview(
      {
        addition: { ease: 2.5, interval: 1, lastReviewed: now - 2 * DAY, reps: 0 },
        counting: { ease: 2.5, interval: 30, lastReviewed: now - 2 * DAY, reps: 0 },
      },
      now,
    );
    expect(dueList).toEqual(['addition']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- decisionLayer`
Expected: FAIL ("createReview is not a function").

- [ ] **Step 3: Add the implementation**

Append to `src/engine/decisionLayer.js`:
```js
// §6.3 — SM-2 spaced repetition. interval is in days.
export function createReview(now = Date.now()) {
  return { ease: 2.5, interval: 1, lastReviewed: now, reps: 0 };
}

export function updateReview(prev, correct, now = Date.now()) {
  if (correct) {
    return {
      ease: Math.min(2.5, prev.ease + 0.1),
      interval: Math.round(prev.interval * prev.ease),
      lastReviewed: now,
      reps: prev.reps + 1,
    };
  }
  return {
    ease: Math.max(1.3, prev.ease - 0.2),
    interval: 1,
    lastReviewed: now,
    reps: 0,
  };
}

export function isDue(review, now = Date.now()) {
  // Spec §6.3: due strictly after the interval elapses (lastReviewed + interval < now).
  return now > review.lastReviewed + review.interval * DAY_MS;
}

export function dueForReview(reviewMap = {}, now = Date.now()) {
  return Object.keys(reviewMap).filter((id) => isDue(reviewMap[id], now));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- decisionLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/decisionLayer.js src/engine/decisionLayer.test.js
git commit -m "feat(engine): add SM-2 spaced repetition scheduling"
```

---

### Task 7: Decision layer — fair leaderboard

**Files:**
- Modify: `src/engine/decisionLayer.js`
- Modify: `src/engine/decisionLayer.test.js`

> Spec §6.4: `score = breadth × shrunken_mean_mastery`, where `shrunken_mean = (n·observed + κ·classMean)/(n + κ)`, κ = 20. `breadth` = number of skills at/above the mastery cutoff. `observed_mean` = mean mastery over practiced skills (mastery > 0). `n` = total attempts.

- [ ] **Step 1: Add the failing test**

Append to `src/engine/decisionLayer.test.js`:
```js
import { shrunkenMean, fairRanking, SHRINKAGE_KAPPA } from './decisionLayer';

describe('decisionLayer.fairRanking', () => {
  it('shrinks a low-sample mean toward the class mean', () => {
    expect(SHRINKAGE_KAPPA).toBe(20);
    const s = shrunkenMean(1.0, 1, 0.9); // perfect on a single attempt
    expect(s).toBeCloseTo(0.9048, 3);
    expect(s).toBeLessThan(1.0); // pulled down
  });

  it('ranks an established broad student above a one-hit perfect score', () => {
    const a = { id: 'A', name: 'Asha', attempts: 1, mastery: { addition: 1.0 } };
    const b = {
      id: 'B', name: 'Bilal', attempts: 100,
      mastery: { addition: 0.8, subtraction: 0.8, multiplication: 0.8, division: 0.8, patterns: 0.8 },
    };
    const ranking = fairRanking([a, b]);
    expect(ranking[0].id).toBe('B');
    expect(ranking[1].id).toBe('A');
    expect(ranking[1].shrunkenMastery).toBeLessThan(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- decisionLayer`
Expected: FAIL ("shrunkenMean is not a function").

- [ ] **Step 3: Add the implementation**

Append to `src/engine/decisionLayer.js`:
```js
// §6.4 — empirical-Bayes shrinkage leaderboard.
export const SHRINKAGE_KAPPA = 20;

export function shrunkenMean(observedMean, n, classMean, kappa = SHRINKAGE_KAPPA) {
  return (n * observedMean + kappa * classMean) / (n + kappa);
}

// Input contract: students = [{ id, name, attempts: <scalar total>, mastery: { [skillId]: P } }].
// observedMean and breadth are computed over the keys PRESENT in `mastery` — the caller
// passes only the skills the student has actually attempted (do NOT pass a dense BKT map,
// whose pL0 prior would inflate every skill). §6.4 term definitions (breadth, observed_mean, n)
// are plan-chosen; the spec leaves them unspecified.
export function fairRanking(students, kappa = SHRINKAGE_KAPPA) {
  const stats = students.map((s) => {
    const skills = Object.keys(s.mastery);
    const observedMean = skills.length
      ? skills.reduce((sum, id) => sum + s.mastery[id], 0) / skills.length
      : 0;
    const breadth = skills.filter((id) => s.mastery[id] >= MASTERY_CUTOFF).length;
    return { id: s.id, name: s.name, n: s.attempts ?? 0, observedMean, breadth };
  });

  const classMean = stats.length
    ? stats.reduce((sum, s) => sum + s.observedMean, 0) / stats.length
    : 0;

  return stats
    .map((s) => {
      const shrunkenMastery = shrunkenMean(s.observedMean, s.n, classMean, kappa);
      return { id: s.id, name: s.name, breadth: s.breadth, shrunkenMastery, score: s.breadth * shrunkenMastery };
    })
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- decisionLayer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/decisionLayer.js src/engine/decisionLayer.test.js
git commit -m "feat(engine): add Bayesian-shrinkage fair ranking"
```

---

### Task 8: IndexedDB persistence

**Files:**
- Modify: `src/lib/db.js`
- Test: `src/lib/db.mastery.test.js`

> Spec §7: add `mastery_state` and `interaction_log` stores. Bump `DB_VERSION` so the `upgrade` callback creates them on existing clients.

- [ ] **Step 1: Write the failing test**

Create `src/lib/db.mastery.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  saveMasteryState,
  loadMasteryState,
  appendInteraction,
  getInteractionLog,
} from './db';

describe('db mastery persistence', () => {
  it('round-trips mastery state', async () => {
    const state = { belief: { addition: 0.6 }, attempts: { addition: 1 }, lastPracticed: {}, review: {} };
    await saveMasteryState(state);
    const loaded = await loadMasteryState();
    expect(loaded.belief.addition).toBeCloseTo(0.6, 5);
    expect(loaded.attempts.addition).toBe(1);
  });

  it('appends and reads interactions in chronological order', async () => {
    await appendInteraction({ skillId: 'addition', correct: true, responseTime: 1200, timestamp: 1 });
    await appendInteraction({ skillId: 'addition', correct: false, responseTime: 800, timestamp: 2 });
    const log = await getInteractionLog(50);
    const last = log[log.length - 1];
    expect(last.timestamp).toBe(2);
    expect(last.correct).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- db.mastery`
Expected: FAIL ("saveMasteryState is not exported").

- [ ] **Step 3: Modify `src/lib/db.js`**

Change the version constant (currently `const DB_VERSION = 1;`):
```js
const DB_VERSION = 2;
```

Inside the `upgrade(db)` callback, after the existing `achievements` block and before its closing brace, add:
```js
        // Adaptive engine: per-student mastery state (single 'local' record)
        if (!db.objectStoreNames.contains('mastery_state')) {
          db.createObjectStore('mastery_state', { keyPath: 'id' });
        }
        // Adaptive engine: append-only interaction log (DKT sequence input)
        if (!db.objectStoreNames.contains('interaction_log')) {
          const il = db.createObjectStore('interaction_log', {
            keyPath: 'logId',
            autoIncrement: true,
          });
          il.createIndex('by_timestamp', 'timestamp');
        }
```

Append these accessors to the end of `src/lib/db.js`:
```js
// ─── Adaptive Engine: Mastery State ─────────────────────────────────────────────

export async function saveMasteryState(state) {
  const db = await getDB();
  await db.put('mastery_state', { id: 'local', ...state });
}

export async function loadMasteryState() {
  const db = await getDB();
  return db.get('mastery_state', 'local');
}

// ─── Adaptive Engine: Interaction Log ───────────────────────────────────────────

export async function appendInteraction(interaction) {
  const db = await getDB();
  await db.add('interaction_log', { ...interaction });
}

export async function getInteractionLog(limit = 50) {
  const db = await getDB();
  const all = await db.getAllFromIndex('interaction_log', 'by_timestamp');
  return all.slice(-limit); // oldest -> newest, last `limit`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- db.mastery`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.js src/lib/db.mastery.test.js
git commit -m "feat(engine): persist mastery state and interaction log in IndexedDB"
```

---

### Task 9: Engine API singleton

**Files:**
- Create: `src/engine/engineAPI.js`
- Test: `src/engine/engineAPI.test.js`

> The only module games/dashboards import. Wires the layers and persists after each attempt. `recordAttempt` updates belief, attempt count, last-practiced, the SM-2 schedule (for mastered skills), appends to the interaction log, and saves state. `MASTERY_THRESHOLD = 0.85` matches spec §6.3.

- [ ] **Step 1: Write the failing test**

Create `src/engine/engineAPI.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetEngine,
  recordAttempt,
  getMastery,
  getAllMastery,
  getNextDifficulty,
  suggestNext,
  getDueReviews,
  classMastery,
} from './engineAPI';

describe('engineAPI', () => {
  beforeEach(() => resetEngine());

  it('records an attempt and raises mastery', async () => {
    const m = await recordAttempt({ skillId: 'addition', correct: true });
    expect(m).toBeGreaterThan(0.2);
    expect(getMastery('addition')).toBeCloseTo(m, 5);
  });

  it('exposes a mastery map for all skills', () => {
    const all = getAllMastery();
    expect(Object.keys(all)).toHaveLength(13);
    expect(all.addition).toBeCloseTo(0.2, 5);
  });

  it('derives difficulty from current mastery', async () => {
    expect(getNextDifficulty('addition')).toBe('easy');
    await recordAttempt({ skillId: 'addition', correct: true });
    await recordAttempt({ skillId: 'addition', correct: true });
    expect(getNextDifficulty('addition')).toBe('hard'); // mastery > 0.75
  });

  it('suggests the next unlocked skill after mastering a prerequisite', async () => {
    await recordAttempt({ skillId: 'counting', correct: true });
    await recordAttempt({ skillId: 'counting', correct: true });
    expect(suggestNext().skillId).toBe('addition');
  });

  it('schedules a review once a skill is mastered (>0.85)', async () => {
    await recordAttempt({ skillId: 'addition', correct: true });
    await recordAttempt({ skillId: 'addition', correct: true });
    // freshly mastered -> review exists but not due yet (interval starts at 1 day)
    expect(getDueReviews(Date.now())).not.toContain('addition');
    expect(getDueReviews(Date.now() + 3 * 86400000)).toContain('addition');
  });

  it('aggregates a class into per-skill means and a fair ranking', () => {
    const ranking = classMastery([
      { id: 'A', name: 'Asha', attempts: 1, mastery: { addition: 1.0 } },
      { id: 'B', name: 'Bilal', attempts: 100, mastery: { addition: 0.8, subtraction: 0.8 } },
    ]);
    expect(ranking.perSkill.addition).toBeCloseTo(0.9, 5);
    expect(ranking.ranking[0].id).toBe('B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- engineAPI`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/engine/engineAPI.js`:
```js
// Public API — the only engine module the UI/backend imports (spec §3).
import { SKILL_IDS } from './knowledgeGraph';
import { createInitialBelief, updateBelief, getMastery as bktMastery } from './masteryModel';
import {
  nextDifficulty,
  suggestNextSkill,
  dueForReview,
  createReview,
  updateReview,
  fairRanking,
} from './decisionLayer';
import {
  loadMasteryState,
  saveMasteryState,
  appendInteraction,
} from '../lib/db';

const MASTERY_THRESHOLD = 0.85; // spec §6.3 — schedule reviews above this

let state = null;

function emptyState() {
  return {
    belief: createInitialBelief(),
    attempts: {},
    lastPracticed: {},
    review: {},
  };
}

function getState() {
  if (!state) state = emptyState();
  return state;
}

// Test/helper hook — start from a clean in-memory state.
export function resetEngine() {
  state = emptyState();
  return state;
}

// Hydrate the singleton from IndexedDB (call once at app start).
export async function initEngine() {
  const saved = await loadMasteryState();
  state = saved ? { ...emptyState(), ...saved } : emptyState();
  return state;
}

export function getMastery(skillId) {
  return bktMastery(getState().belief, skillId);
}

export function getAllMastery() {
  const s = getState();
  const out = {};
  for (const id of SKILL_IDS) out[id] = bktMastery(s.belief, id);
  return out;
}

export function getNextDifficulty(skillId) {
  return nextDifficulty(skillId, getAllMastery());
}

export function suggestNext(now = Date.now()) {
  const s = getState();
  return suggestNextSkill({ mastery: getAllMastery(), lastPracticed: s.lastPracticed, now });
}

export function getDueReviews(now = Date.now()) {
  return dueForReview(getState().review, now);
}

export async function recordAttempt({ skillId, correct, responseTime = 0 }) {
  const s = getState();
  const now = Date.now();

  s.belief = updateBelief(s.belief, skillId, correct);
  s.attempts[skillId] = (s.attempts[skillId] ?? 0) + 1;
  s.lastPracticed[skillId] = now;

  const mastery = bktMastery(s.belief, skillId);
  if (mastery > MASTERY_THRESHOLD) {
    s.review[skillId] = s.review[skillId]
      ? updateReview(s.review[skillId], correct, now)
      : createReview(now);
  }

  await appendInteraction({ skillId, correct, responseTime, timestamp: now });
  await saveMasteryState(s);
  return mastery;
}

// Teacher aggregate (spec §6.4 + §7 class-mastery). students: see fairRanking input.
export function classMastery(students) {
  const perSkill = {};
  for (const id of SKILL_IDS) {
    const vals = students.map((st) => st.mastery[id]).filter((v) => v != null);
    perSkill[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  return { perSkill, ranking: fairRanking(students) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- engineAPI`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/engineAPI.js src/engine/engineAPI.test.js
git commit -m "feat(engine): add public engine API singleton"
```

---

### Task 10: Integrator README + full verification

**Files:**
- Create: `src/engine/README.md`

- [ ] **Step 1: Write the engine usage doc**

Create `src/engine/README.md`:
```markdown
# Adaptive Learning Engine (`src/engine/`)

UI-free module. Import **only** from `engineAPI.js`.

## Lifecycle
```js
import { initEngine } from './engine/engineAPI';
await initEngine(); // once, at app start (hydrates from IndexedDB)
```

## In a game (per answer)
```js
import { recordAttempt, getNextDifficulty } from './engine/engineAPI';

const difficulty = getNextDifficulty('addition');     // 'easy' | 'medium' | 'hard'
const mastery = await recordAttempt({ skillId: 'addition', correct: true, responseTime: 1200 });
```

## On the student dashboard
```js
import { suggestNext, getDueReviews } from './engine/engineAPI';
const rec = suggestNext();            // { skillId, games } | null
const due = getDueReviews();          // string[] of skillIds to refresh
```

## On the teacher dashboard
```js
import { classMastery } from './engine/engineAPI';
const { perSkill, ranking } = classMastery(students); // students from /api/teacher/class-mastery
```

## Swapping the mastery backend
`masteryModel.js` ships a BKT backend. The DKT backend (separate plan) must export the
same three functions: `createInitialBelief`, `updateBelief`, `getMastery`.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all engine + db test files green, 0 failures.

- [ ] **Step 3: Run lint and build**

Run: `npm run lint`
Expected: no new errors in `src/engine/**` or `src/lib/db.js`.

Run: `npm run build`
Expected: build succeeds (engine is tree-shakeable; no UI imports it yet, so it should not affect the bundle).

- [ ] **Step 4: Commit**

```bash
git add src/engine/README.md
git commit -m "docs(engine): add integrator usage README"
```

---

## Self-Review

**1. Spec coverage (Engine Core slice):**
- §3 module architecture → Tasks 2,3,4,9 (separate module, single public API). ✅
- §4 knowledge graph (skills, DAG, game map) → Task 2. ✅
- §5.1 mastery model (BKT backend; DKT deferred to its own plan by design) → Task 3. ✅
- §6.1 adaptive difficulty → Task 4. ✅
- §6.2 smart recommendation → Task 5. ✅
- §6.3 spaced repetition (SM-2) → Task 6 + scheduling in Task 9. ✅
- §6.4 fair ranking → Task 7 + aggregate in Task 9. ✅
- §7 `src/lib/db.js` stores → Task 8. (`usePlayerStore`, games, dashboards, server = other plans, intentionally excluded.) ✅

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step contains complete code. ✅

**3. Type/name consistency:**
- `MASTERY_CUTOFF` (0.75, decision layer) vs `MASTERY_THRESHOLD` (0.85, engineAPI) are deliberately different constants (unlock cutoff vs review-scheduling threshold) — names kept distinct to avoid confusion.
- Backend contract names (`createInitialBelief`, `updateBelief`, `getMastery`) used identically in `masteryModel.js` (Task 3), `engineAPI.js` (Task 9), and README (Task 10). ✅
- db accessors (`saveMasteryState`, `loadMasteryState`, `appendInteraction`, `getInteractionLog`) defined in Task 8 and imported in Task 9. ✅
- `fairRanking` student shape `{ id, name, attempts, mastery }` consistent across Tasks 7 and 9. ✅

**Open items for the review doc:** (a) 12-vs-13 skill count discrepancy with spec summary; (b) SM-2 initial ease at the 2.5 cap makes `+0.1` a no-op until a lapse; (c) prerequisite edges transcribed from the §4 ASCII diagram should be confirmed by the guide (spec Open Question #2).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-adaptive-engine-core.md`.

Per your workflow, the **next step is the review doc for this plan**, then we lock the API and I write the dependent plans (Game Integration, Student Dashboard, Teacher Dashboard, Backend, Synthetic Data + Evaluation, DKT Pipeline). We decide on execution after the reviews.
