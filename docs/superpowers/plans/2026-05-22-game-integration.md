# Adaptive Learning Engine — Game Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built, already-tested `src/engine/` module into the running app: call `initEngine()` once at startup, and for the **top 8 games** make difficulty come from `getNextDifficulty(skillId)` (instead of random or user-picked) and fire `recordAttempt({ skillId, correct, responseTime })` after **each in-game answer** (not just at game end). The remaining 12 games keep their current behavior in v1 (spec §10 risk note: "Integrate the top 8 games first. Remaining 12 can keep random difficulty in v1 and be migrated in v2.").

**Architecture:** The engine is a UI-free singleton imported **only** through `src/engine/engineAPI.js` (its public API is locked — do NOT redefine or re-import internals). Integration is additive: each game keeps its existing visual design, content, scoring, and XP flow untouched (spec §7 **Critical**: "zero changes to game content or visual design. Only the difficulty knob and answer-recording call change"). We introduce one tiny reusable pattern — a per-game `SKILLS` constant pulled from `GAME_SKILLS`, a `difficulty` initialized from `getNextDifficulty`, and a `recordAttempt(...)` fire-and-forget call inside each game's answer handler.

**Tech Stack:** React 19 + Vite 8, Zustand, React Router 7. Tests: Vitest 4 + `@testing-library/react` + `jsdom` (jsdom and Testing Library are **added by this plan**; Vitest + fake-indexeddb already exist from the engine-core plan).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — this plan implements the game-page portion of §7 ("Files modified" → "Each `src/pages/*Game.jsx`") and applies §4 (game→skill table) and §6.1 (adaptive difficulty bins) at the call sites. It honors §10's "top 8 first" risk mitigation.

**Engine API consumed (locked — implemented in `src/engine/engineAPI.js`, do NOT redefine):**

```js
await initEngine();                                       // once at app start (hydrates from IndexedDB)
getNextDifficulty(skillId);                               // -> 'easy' | 'medium' | 'hard'
await recordAttempt({ skillId, correct, responseTime });  // per in-game answer; returns updated mastery (number)
```

Skill ids and the game→skill map come from `src/engine/knowledgeGraph.js`:

```js
import { GAME_SKILLS, SKILL_IDS } from '../engine/knowledgeGraph';
// GAME_SKILLS.ArithmeticGame === ['addition','subtraction'], GAME_SKILLS.MultiplicationMeteor === ['multiplication'], etc.
```

**Explicitly OUT of scope for this plan** (each is a later plan or already done): the engine core itself (already built + tested), `src/store/usePlayerStore.js`'s `addXP` engine hook (deferred — see Open Questions; games call `recordAttempt` directly so XP flow stays untouched), StudentDashboard / TeacherDashboard widgets (§7 dashboard rows — separate plans), the Express/Mongo backend (§7 server rows), the DKT pipeline, and the 12 non-top-8 games (v2).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `vitest.config.js` | Widen `include` to `.test.jsx` and add jsdom dep note | modify |
| `src/test/setupDom.js` | jsdom-only setup: jest-dom matchers + cleanup (new) | create |
| `src/App.jsx` | Call `initEngine()` once in the existing startup `useEffect` | modify |
| `src/engine/gameSkills.js` | Tiny helper: `skillForGame(name)` (primary skill picker) so games stay one-liners | create |
| `src/engine/gameSkills.test.js` | Unit test for the helper | create |
| `src/pages/ArithmeticGame.jsx` | Difficulty default + `recordAttempt` on each answer | modify |
| `src/pages/MultiplicationMeteor.jsx` | `recordAttempt` per meteor hit/miss; difficulty unused (fixed gen) — see task | modify |
| `src/pages/FractionFrenzy.jsx` | `recordAttempt` per option click | modify |
| `src/pages/PatternPuzzle.jsx` | Difficulty seeds the matrix generator + `recordAttempt` per select | modify |
| `src/pages/MultiplicationFarm.jsx` | `recordAttempt` per answer | modify |
| `src/pages/FractionNinja.jsx` | `recordAttempt` per submit | modify |
| `src/pages/DecimalMall.jsx` | `recordAttempt` per submit | modify |
| `src/pages/IntegerMountain.jsx` | `recordAttempt` per submit | modify |
| `src/pages/ArithmeticGame.integration.test.jsx` | Difficulty-from-engine + recordAttempt-fires tests | create |
| `src/pages/FractionFrenzy.integration.test.jsx` | recordAttempt-fires test (option-click style) | create |
| `src/pages/MultiplicationFarm.integration.test.jsx` | recordAttempt-fires test (usePlayerStore style) | create |

**The reusable integration pattern (applied identically in all 8 games):**

```js
// 1. Import the public API + the game→skill map (NEVER engine internals).
import { getNextDifficulty, recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

// 2. Declare the game's skill once (component-name key matches GAME_SKILLS).
const SKILL = skillForGame('ArithmeticGame'); // -> 'addition'  (primary skill)

// 3. Seed difficulty from the engine instead of random / hardcoded.
const [difficulty, setDifficulty] = useState(() => getNextDifficulty(SKILL)); // 'easy'|'medium'|'hard'

// 4. After EACH answer, record it (fire-and-forget — never await in a UI handler).
recordAttempt({ skillId: SKILL, correct, responseTime });
```

Rationale for `skillForGame` over inlining a `SKILLS` array per game: §4 maps some games to two skills (e.g. `ArithmeticGame → ['addition','subtraction']`). For difficulty *and* per-answer recording we need **one** skill id. `skillForGame` returns the first (primary) skill, keeping every game a one-liner and keeping the multi-skill source of truth in `knowledgeGraph.js`. Games whose two skills are genuinely interleaved per question (none in this top-8 batch) can still call `recordAttempt` with a per-question skill — but for the top 8 a single primary skill is correct (verified per game in each task below).

---

### Task 1: Test tooling for components (Testing Library + jsdom)

The engine-core plan added Vitest (`environment: 'node'`) + fake-indexeddb. Component tests need a DOM. Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom`, then make the runner pick up `.test.jsx` files and run them under jsdom **per-file** (so the existing Node-env engine tests are unaffected).

**Files:**
- Modify: `package.json` (devDependencies — via npm)
- Modify: `vitest.config.js`
- Create: `src/test/setupDom.js`
- Create: `src/pages/sanity.dom.test.jsx` (temporary; deleted at end of task)

- [ ] **Step 1: Install dev dependencies**

This repo's `npm install` fails on the `vite@^8` vs `vite-plugin-pwa` peer conflict, so `--legacy-peer-deps` is **required**:
```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom --legacy-peer-deps
```
Expected: installs succeed and `package.json` `devDependencies` gains the four packages. If npm still errors, re-run the exact same command (it is idempotent); record the working command in the commit message.

- [ ] **Step 2: Widen the Vitest `include` and keep Node the default env**

Edit `vitest.config.js`. The current file is:
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
Replace it with (adds the React plugin so JSX compiles, widens `include` to `.jsx`, registers the DOM setup file, and keeps `node` as the default env — component test files opt into jsdom via a per-file pragma in Step 4):
```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js', './src/test/setupDom.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
```

- [ ] **Step 3: Create the DOM setup file**

Create `src/test/setupDom.js`:
```js
// Loaded for every test file, but its jest-dom matchers + cleanup only have effect
// when the file opts into the jsdom environment via `// @vitest-environment jsdom`.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Write a sanity DOM test, run it, then delete it**

Create `src/pages/sanity.dom.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function Hello() {
  return <h1>hello dom</h1>;
}

describe('component test tooling', () => {
  it('renders a component into jsdom', () => {
    render(<Hello />);
    expect(screen.getByText('hello dom')).toBeInTheDocument();
  });
});
```
Run:
```bash
npm test -- sanity.dom
```
Expected: PASS (1 passed). Confirm the engine tests still pass under Node:
```bash
npm test
```
Expected: PASS (all engine + db + sanity files green). Then delete the sanity file:
```bash
rm src/pages/sanity.dom.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/test/setupDom.js
git commit -m "chore: add testing-library + jsdom for component tests"
```

---

### Task 2: `skillForGame` helper

A one-line indirection so every game stays a one-liner and the multi-skill source of truth stays in `knowledgeGraph.js`. Returns the **primary** (first) skill a game exercises.

**Files:**
- Create: `src/engine/gameSkills.js`
- Test: `src/engine/gameSkills.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/engine/gameSkills.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { skillForGame, skillsForGame } from './gameSkills';
import { SKILL_IDS } from './knowledgeGraph';

describe('gameSkills', () => {
  it('returns the primary (first) skill for a game', () => {
    expect(skillForGame('ArithmeticGame')).toBe('addition');
    expect(skillForGame('MultiplicationMeteor')).toBe('multiplication');
    expect(skillForGame('FractionFrenzy')).toBe('fractions-basic');
    expect(skillForGame('PatternPuzzle')).toBe('patterns');
    expect(skillForGame('MultiplicationFarm')).toBe('multiplication');
    expect(skillForGame('FractionNinja')).toBe('fractions-basic');
    expect(skillForGame('DecimalMall')).toBe('decimals');
    expect(skillForGame('IntegerMountain')).toBe('integers');
  });

  it('returns the full skill list for a game', () => {
    expect(skillsForGame('ArithmeticGame')).toEqual(['addition', 'subtraction']);
    expect(skillsForGame('FractionNinja')).toEqual(['fractions-basic', 'equiv-fractions']);
  });

  it('every primary skill is a valid skill id', () => {
    for (const game of ['ArithmeticGame', 'MultiplicationMeteor', 'FractionFrenzy',
      'PatternPuzzle', 'MultiplicationFarm', 'FractionNinja', 'DecimalMall', 'IntegerMountain']) {
      expect(SKILL_IDS).toContain(skillForGame(game));
    }
  });

  it('throws for an unknown game name (typo guard)', () => {
    expect(() => skillForGame('NotARealGame')).toThrow(/unknown game/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- gameSkills
```
Expected: FAIL ("Failed to resolve import ./gameSkills" / functions undefined).

- [ ] **Step 3: Write the implementation**

Create `src/engine/gameSkills.js`:
```js
// Thin convenience over GAME_SKILLS so game pages stay one-liners and the
// multi-skill source of truth remains in knowledgeGraph.js. UI imports the
// public engine API for behavior; this is the only graph helper games need.
import { GAME_SKILLS } from './knowledgeGraph';

// All skills a game exercises (spec §4 game→skill table).
export function skillsForGame(gameName) {
  const skills = GAME_SKILLS[gameName];
  if (!skills) throw new Error(`gameSkills: unknown game "${gameName}"`);
  return skills;
}

// The primary (first) skill — used for difficulty selection and per-answer recording.
export function skillForGame(gameName) {
  return skillsForGame(gameName)[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- gameSkills
```
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add src/engine/gameSkills.js src/engine/gameSkills.test.js
git commit -m "feat(engine): add skillForGame helper for game integration"
```

---

### Task 3: Initialize the engine once at app start

`initEngine()` hydrates the engine singleton from IndexedDB and must run exactly once, before any game reads difficulty or records an attempt. `App.jsx` already has a single startup `useEffect` (it calls `initSyncEngine`, `initListeners`, `hydrate`); add `initEngine()` there. `main.jsx` is rejected because it has no effect hook and runs before the Router mounts — `App.jsx` is the established init site.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import**

In `src/App.jsx`, the existing imports include:
```js
import { initSyncEngine } from './lib/syncEngine';
```
Add directly below it:
```js
import { initEngine } from './engine/engineAPI';
```

- [ ] **Step 2: Call `initEngine()` in the existing startup effect**

The current effect is:
```js
  useEffect(() => {
    // Init offline sync engine
    initSyncEngine(setStatus);
    // Init online/offline listeners
    initListeners();
    // Hydrate player data from IndexedDB
    hydrate();
  }, []);
```
Replace it with (adds the one call; `initEngine` returns a promise we intentionally do not await — games default to `'easy'`/prior mastery until hydration resolves a few ms later, which is correct cold-start behavior):
```js
  useEffect(() => {
    // Init offline sync engine
    initSyncEngine(setStatus);
    // Init online/offline listeners
    initListeners();
    // Hydrate player data from IndexedDB
    hydrate();
    // Hydrate the adaptive learning engine from IndexedDB (once, at startup)
    initEngine().catch(() => {});
  }, []);
```

- [ ] **Step 3: Verify the app still builds**

```bash
npm run build
```
Expected: build succeeds. (No runtime assertion here — engine hydration is exercised by the engine-core tests; this step only confirms the import path resolves and the bundle compiles.)

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): initialize adaptive engine once at startup"
```

---

### Task 4: ArithmeticGame — difficulty from engine + per-answer recording

`ArithmeticGame` (route `/games/arithmetic`, `useGamification`) currently lets the user pick difficulty via three buttons and seeds `useState('easy')`. We **keep the buttons** (visual design is untouched — spec §7 Critical) but change the *initial* difficulty to the engine's recommendation, and we record every answer in `handleSubmit`. Skill: `skillForGame('ArithmeticGame') === 'addition'` (primary of `['addition','subtraction']`; both are arithmetic, addition is the canonical generator skill).

**Files:**
- Modify: `src/pages/ArithmeticGame.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/ArithmeticGame.jsx` is:
```js
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, Timer, Check, X, Award, Flame } from 'lucide-react';

const GAME_DURATION = 30;
```
Replace it with:
```js
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { getNextDifficulty, recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';
import { ChevronLeft, Timer, Check, X, Award, Flame } from 'lucide-react';

const GAME_DURATION = 30;
const SKILL = skillForGame('ArithmeticGame'); // 'addition'
```

- [ ] **Step 2: Seed difficulty from the engine**

The current difficulty state is:
```js
  const [difficulty, setDifficulty] = useState('easy'); // easy, medium, hard
```
Replace it with (engine recommendation as the default; the user can still override with the buttons):
```js
  const [difficulty, setDifficulty] = useState(() => getNextDifficulty(SKILL)); // 'easy' | 'medium' | 'hard'
```

- [ ] **Step 3: Track answer start time for `responseTime`**

The current state block ends with:
```js
  const [feedback, setFeedback] = useState(null); // 'correct' or 'wrong'
  
  const inputRef = useRef(null);
```
Replace it with (adds a ref to time each answer):
```js
  const [feedback, setFeedback] = useState(null); // 'correct' or 'wrong'

  const inputRef = useRef(null);
  const questionStartRef = useRef(Date.now());
```

In `startGame`, the current body sets up the first question:
```js
  const startGame = () => {
    setIsPlaying(true);
    setTimeLeft(GAME_DURATION);
    setScore(0);
    setCombo(0);
    setInputValue('');
    setCurrentQuestion(generateQuestion(difficulty));
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 100);
  };
```
Replace it with (start the timer for the first question):
```js
  const startGame = () => {
    setIsPlaying(true);
    setTimeLeft(GAME_DURATION);
    setScore(0);
    setCombo(0);
    setInputValue('');
    setCurrentQuestion(generateQuestion(difficulty));
    questionStartRef.current = Date.now();
    setTimeout(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 100);
  };
```

- [ ] **Step 4: Record the attempt inside `handleSubmit`**

The current handler is:
```js
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPlaying) return;

    if (parseInt(inputValue) === currentQuestion.a) {
      setScore(score + 1);
      setCombo(c => c + 1);
      setFeedback('correct');
    } else {
      setCombo(0); // Break combo
      setFeedback('wrong');
    }

    setInputValue('');
    setCurrentQuestion(generateQuestion(difficulty));
    
    setTimeout(() => setFeedback(null), 300);
  };
```
Replace it with (record correctness + responseTime per answer; fire-and-forget, then reset the timer for the next question):
```js
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPlaying) return;

    const correct = parseInt(inputValue) === currentQuestion.a;
    const responseTime = Date.now() - questionStartRef.current;
    recordAttempt({ skillId: SKILL, correct, responseTime });

    if (correct) {
      setScore(score + 1);
      setCombo(c => c + 1);
      setFeedback('correct');
    } else {
      setCombo(0); // Break combo
      setFeedback('wrong');
    }

    setInputValue('');
    setCurrentQuestion(generateQuestion(difficulty));
    questionStartRef.current = Date.now();

    setTimeout(() => setFeedback(null), 300);
  };
```

- [ ] **Step 5: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors in `src/pages/ArithmeticGame.jsx`. (Behavioral verification is the integration test in Task 12.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/ArithmeticGame.jsx
git commit -m "feat(game): adaptive difficulty + per-answer recording in ArithmeticGame"
```

---

### Task 5: MultiplicationMeteor — per-answer recording

`MultiplicationMeteor` (route `/games/meteor`, `useGamification`) generates fixed-range problems (`generateProblem` has no difficulty parameter) and the player types answers that destroy meteors. There is **no difficulty knob to wire** — its visual/physics design must stay untouched (spec §7 Critical), so we only add `recordAttempt`. A submission is **correct** when it matches a meteor's answer (`hitMeteorIndex !== -1`) and **incorrect** otherwise (a wrong/no-match guess). Skill: `'multiplication'`.

**Files:**
- Modify: `src/pages/MultiplicationMeteor.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/MultiplicationMeteor.jsx` is:
```js
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, Rocket, Shield, Crosshair, Flame } from 'lucide-react';
```
Replace it with:
```js
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';
import { ChevronLeft, Rocket, Shield, Crosshair, Flame } from 'lucide-react';

const SKILL = skillForGame('MultiplicationMeteor'); // 'multiplication'
```

> Note: this game has no difficulty parameter (fixed `generateProblem`), so `getNextDifficulty` is intentionally **not** imported here — wiring it would require changing the problem generator and thus the game's content/feel, which §7 forbids. Recording attempts still feeds mastery; difficulty adapts in games that already expose the knob (Tasks 4, 7).

- [ ] **Step 2: Record the attempt inside `handleSubmit`**

The current handler is:
```js
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPlaying) return;
    
    const ans = parseInt(inputValue);
    const hitMeteorIndex = meteors.findIndex(m => m.a === ans);
    
    if (hitMeteorIndex !== -1) {
      const target = meteors[hitMeteorIndex];
      
      // Calculate laser angle
      const dx = target.left - 50;
      const dy = 100 - target.top;
      const angle = Math.atan2(dx, dy) * (180 / Math.PI);

      const hitId = Date.now();
      
      // Spawn laser & explosion visuals
      setLasers(prev => [...prev, { id: hitId, angle }]);
      setExplosions(prev => [...prev, { id: hitId, top: target.top, left: target.left, type: 'destroy' }]);
      setTurretAngle(angle);
      
      // Remove visual effects after 300ms
      setTimeout(() => {
         setLasers(prev => prev.filter(l => l.id !== hitId));
         setExplosions(prev => prev.filter(ex => ex.id !== hitId));
         setTurretAngle(0); // Reset turret to face forward after firing lock
      }, 300);

      setMeteors(prev => prev.filter((_, idx) => idx !== hitMeteorIndex));
      setScore(s => s + 1);
    }
    setInputValue('');
  };
```
Replace it with (record a hit as correct, a non-matching guess as incorrect; ignore empty submissions so an accidental Enter on an empty field is not logged as a miss):
```js
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPlaying) return;

    const ans = parseInt(inputValue);
    if (Number.isNaN(ans)) { setInputValue(''); return; } // empty/invalid: don't record

    const hitMeteorIndex = meteors.findIndex(m => m.a === ans);
    recordAttempt({ skillId: SKILL, correct: hitMeteorIndex !== -1, responseTime: 0 });

    if (hitMeteorIndex !== -1) {
      const target = meteors[hitMeteorIndex];

      // Calculate laser angle
      const dx = target.left - 50;
      const dy = 100 - target.top;
      const angle = Math.atan2(dx, dy) * (180 / Math.PI);

      const hitId = Date.now();

      // Spawn laser & explosion visuals
      setLasers(prev => [...prev, { id: hitId, angle }]);
      setExplosions(prev => [...prev, { id: hitId, top: target.top, left: target.left, type: 'destroy' }]);
      setTurretAngle(angle);

      // Remove visual effects after 300ms
      setTimeout(() => {
         setLasers(prev => prev.filter(l => l.id !== hitId));
         setExplosions(prev => prev.filter(ex => ex.id !== hitId));
         setTurretAngle(0); // Reset turret to face forward after firing lock
      }, 300);

      setMeteors(prev => prev.filter((_, idx) => idx !== hitMeteorIndex));
      setScore(s => s + 1);
    }
    setInputValue('');
  };
```

- [ ] **Step 3: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MultiplicationMeteor.jsx
git commit -m "feat(game): per-answer recording in MultiplicationMeteor"
```

---

### Task 6: FractionFrenzy — per-answer recording

`FractionFrenzy` (route `/games/fractions`, `useGamification`) is a 10-round multiple-choice match game (`handleOptionClick`). Generator (`generateDynamicQuestion`) has no difficulty parameter, so we add `recordAttempt` only (no `getNextDifficulty` — wiring it would change content). Skill: `'fractions-basic'`. Correctness already computed as `isCorrect`.

**Files:**
- Modify: `src/pages/FractionFrenzy.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/FractionFrenzy.jsx` is:
```js
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, PieChart, Check, X, Award, Flame } from 'lucide-react';
```
Replace it with:
```js
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';
import { ChevronLeft, PieChart, Check, X, Award, Flame } from 'lucide-react';

const SKILL = skillForGame('FractionFrenzy'); // 'fractions-basic'
```

- [ ] **Step 2: Record the attempt inside `handleOptionClick`**

The current handler is:
```js
  const handleOptionClick = (option) => {
    if (feedback) return;
    const isCorrect = option.numerator === current.target.numerator && option.denominator === current.target.denominator;
    
    if (isCorrect) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
      setFeedback('correct');
    } else {
      setStreak(0);
      setFeedback('wrong');
    }
```
Replace it with (record immediately when correctness is known):
```js
  const handleOptionClick = (option) => {
    if (feedback) return;
    const isCorrect = option.numerator === current.target.numerator && option.denominator === current.target.denominator;
    recordAttempt({ skillId: SKILL, correct: isCorrect, responseTime: 0 });

    if (isCorrect) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
      setFeedback('correct');
    } else {
      setStreak(0);
      setFeedback('wrong');
    }
```

- [ ] **Step 3: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/FractionFrenzy.jsx
git commit -m "feat(game): per-answer recording in FractionFrenzy"
```

---

### Task 7: PatternPuzzle — difficulty from engine + per-answer recording

`PatternPuzzle` (route `/games/patterns`, `useGamification`) is the one top-8 game whose generator **does** take a difficulty input: `generateMatrixPattern(difficultyLevel)` where a higher integer unlocks more pattern types. Currently it ramps an internal `levelTracker` (1..10) and feeds that as the difficulty. We seed the *starting* difficulty integer from the engine's `'easy'|'medium'|'hard'` while preserving the per-round ramp and all visuals. Skill: `'patterns'`. Correctness already computed as `opt === currentPattern.answer`.

Difficulty mapping (engine string → starting integer for `generateMatrixPattern`): `easy → 1`, `medium → 3`, `hard → 5`. These keep the existing 1..(levelTracker) ramp semantics; `maxIdx = min(5, 1 + floor(level/2))` so 1→1 type, 3→2 types, 5→3 types — a gentle, content-preserving lift.

**Files:**
- Modify: `src/pages/PatternPuzzle.jsx`

- [ ] **Step 1: Add the engine imports + a difficulty→integer map**

The current top of `src/pages/PatternPuzzle.jsx` is:
```js
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, Puzzle, Award, RefreshCcw, Check, X, Sparkles, BrainCircuit, Grid3X3 } from 'lucide-react';
```
Replace it with:
```js
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { getNextDifficulty, recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';
import { ChevronLeft, Puzzle, Award, RefreshCcw, Check, X, Sparkles, BrainCircuit, Grid3X3 } from 'lucide-react';

const SKILL = skillForGame('PatternPuzzle'); // 'patterns'
const DIFFICULTY_START = { easy: 1, medium: 3, hard: 5 }; // engine string -> starting matrix difficulty
function startLevelFromEngine() {
  return DIFFICULTY_START[getNextDifficulty(SKILL)] ?? 1;
}
```

- [ ] **Step 2: Seed the starting difficulty from the engine**

The current state init is:
```js
  const TOTAL_ROUNDS = 10;
  const [levelTracker, setLevelTracker] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [currentPattern, setCurrentPattern] = useState(generateMatrixPattern(1));
  const [feedback, setFeedback] = useState(null);
  const [gameOver, setGameOver] = useState(false);
```
Replace it with (lazy init so `getNextDifficulty` is read once on mount; the first matrix is generated at the engine-recommended difficulty):
```js
  const TOTAL_ROUNDS = 10;
  const [levelTracker, setLevelTracker] = useState(() => startLevelFromEngine());
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [currentPattern, setCurrentPattern] = useState(() => generateMatrixPattern(startLevelFromEngine()));
  const [feedback, setFeedback] = useState(null);
  const [gameOver, setGameOver] = useState(false);
```

- [ ] **Step 3: Re-seed difficulty on replay in `initGame`**

The current reset is:
```js
  const initGame = () => {
    setLevelTracker(1);
    setScore(0);
    setStreak(0);
    setGameOver(false);
    setCurrentPattern(generateMatrixPattern(1));
    setFeedback(null);
  };
```
Replace it with (replay uses the latest engine recommendation, which may have shifted after the previous round's recorded attempts):
```js
  const initGame = () => {
    const start = startLevelFromEngine();
    setLevelTracker(start);
    setScore(0);
    setStreak(0);
    setGameOver(false);
    setCurrentPattern(generateMatrixPattern(start));
    setFeedback(null);
  };
```

- [ ] **Step 4: Record the attempt inside `handleSelect`**

The current handler is:
```js
  const handleSelect = (opt) => {
    if (feedback) return;
    
    if (opt === currentPattern.answer) {
      setFeedback('correct');
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setFeedback('wrong');
      setStreak(0);
    }
```
Replace it with (record correctness per selection):
```js
  const handleSelect = (opt) => {
    if (feedback) return;
    const correct = opt === currentPattern.answer;
    recordAttempt({ skillId: SKILL, correct, responseTime: 0 });

    if (correct) {
      setFeedback('correct');
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setFeedback('wrong');
      setStreak(0);
    }
```

> The per-round ramp `generateMatrixPattern(levelTracker + 1)` inside `handleSelect`'s `setTimeout` is left **unchanged** — it continues to escalate from whatever start the engine chose, preserving the existing in-game progression. Only the *starting* point is now adaptive.

- [ ] **Step 5: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PatternPuzzle.jsx
git commit -m "feat(game): adaptive starting difficulty + per-answer recording in PatternPuzzle"
```

---

### Task 8: MultiplicationFarm — per-answer recording

`MultiplicationFarm` (route `/games/farm-multiply`, `usePlayerStore`) is an 8-round multiple-choice game (`handleAnswer`). Generator (`genQ`) has no difficulty parameter → add `recordAttempt` only. Skill: `'multiplication'`. Correctness: `n === q.answer`.

**Files:**
- Modify: `src/pages/MultiplicationFarm.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/MultiplicationFarm.jsx` is:
```js
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
```
Replace it with:
```js
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('MultiplicationFarm'); // 'multiplication'
```

- [ ] **Step 2: Record the attempt inside `handleAnswer`**

The current handler is:
```js
  const handleAnswer=(n)=>{
    if(selected!==null)return;
    setSelected(n);
    if(n===q.answer){
      setScore(s=>s+20);
      setFeedback({text:`✅ ${q.rows}×${q.cols}=${q.answer} crops!`,correct:true});
    }else{
      setFeedback({text:`❌ ${q.rows}×${q.cols}=${q.answer}`,correct:false});
    }
```
Replace it with (record correctness per choice):
```js
  const handleAnswer=(n)=>{
    if(selected!==null)return;
    setSelected(n);
    const correct=n===q.answer;
    recordAttempt({ skillId: SKILL, correct, responseTime: 0 });
    if(correct){
      setScore(s=>s+20);
      setFeedback({text:`✅ ${q.rows}×${q.cols}=${q.answer} crops!`,correct:true});
    }else{
      setFeedback({text:`❌ ${q.rows}×${q.cols}=${q.answer}`,correct:false});
    }
```

> Note the existing line below the handler — `if(round>=TOTAL_ROUNDS){...addXP(score+(n===q.answer?20:0),...)}` — is left unchanged; it still uses `n===q.answer` for the final XP bonus. We do not refactor it to `correct` to keep the diff minimal and the XP flow byte-identical.

- [ ] **Step 3: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MultiplicationFarm.jsx
git commit -m "feat(game): per-answer recording in MultiplicationFarm"
```

---

### Task 9: FractionNinja — per-answer recording

`FractionNinja` (route `/games/fraction-ninja`, `usePlayerStore`) is an 8-round "slice the roti" game; the answer is submitted once per round in `handleSubmit` where `correct = slashed.size === target`. No difficulty parameter → add `recordAttempt` only. Skill: `'fractions-basic'` (primary of `['fractions-basic','equiv-fractions']`).

**Files:**
- Modify: `src/pages/FractionNinja.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/FractionNinja.jsx` is:
```js
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
```
Replace it with:
```js
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('FractionNinja'); // 'fractions-basic'
```

- [ ] **Step 2: Record the attempt inside `handleSubmit`**

The current handler is:
```js
  const handleSubmit=()=>{
    const correct=slashed.size===target;
    if(correct){
      setScore(s=>s+25);setFeedback({text:'🥷 Perfect Cut!',correct:true});
    }else{
      setFeedback({text:`❌ Need ${target} slices, you cut ${slashed.size}`,correct:false});
    }
```
Replace it with (record the round's correctness; `correct` is already in scope):
```js
  const handleSubmit=()=>{
    const correct=slashed.size===target;
    recordAttempt({ skillId: SKILL, correct, responseTime: 0 });
    if(correct){
      setScore(s=>s+25);setFeedback({text:'🥷 Perfect Cut!',correct:true});
    }else{
      setFeedback({text:`❌ Need ${target} slices, you cut ${slashed.size}`,correct:false});
    }
```

- [ ] **Step 3: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/FractionNinja.jsx
git commit -m "feat(game): per-answer recording in FractionNinja"
```

---

### Task 10: DecimalMall — per-answer recording

`DecimalMall` (route `/games/decimal-mall`, `usePlayerStore`) is a 60-second timed fraction→decimal typing game; each `handleSubmit` is one answer with correctness `Math.abs(userAns - correct) < 0.015`. No difficulty parameter → add `recordAttempt` only. Skill: `'decimals'`.

**Files:**
- Modify: `src/pages/DecimalMall.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/DecimalMall.jsx` is:
```js
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
```
Replace it with:
```js
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('DecimalMall'); // 'decimals'
```

- [ ] **Step 2: Record the attempt inside `handleSubmit`**

The current handler is:
```js
  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const userAns=parseFloat(input);
    const correct=parseFloat(q.decimal);
    if(Math.abs(userAns-correct)<0.015){
      const pts=15+combo*3;setScore(s=>s+pts);setCombo(c=>c+1);
      setFeedback({text:`✅ Correct! +${pts}`,correct:true});
    }else{
      setCombo(0);setFeedback({text:`❌ Answer: ${q.decimal}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},600);
  };
```
Note: the existing local `const correct` here holds the *expected decimal value*, not a boolean. To avoid shadowing confusion we compute a separate boolean `isCorrect` and record it; we also skip recording empty/invalid input. Replace the handler with:
```js
  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const userAns=parseFloat(input);
    const correct=parseFloat(q.decimal);
    const isCorrect=!Number.isNaN(userAns)&&Math.abs(userAns-correct)<0.015;
    if(!Number.isNaN(userAns)) recordAttempt({ skillId: SKILL, correct: isCorrect, responseTime: 0 });
    if(isCorrect){
      const pts=15+combo*3;setScore(s=>s+pts);setCombo(c=>c+1);
      setFeedback({text:`✅ Correct! +${pts}`,correct:true});
    }else{
      setCombo(0);setFeedback({text:`❌ Answer: ${q.decimal}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},600);
  };
```

- [ ] **Step 3: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/DecimalMall.jsx
git commit -m "feat(game): per-answer recording in DecimalMall"
```

---

### Task 11: IntegerMountain — per-answer recording

`IntegerMountain` (route `/games/integer-mountain`, `usePlayerStore`) is a 60-second timed integer-arithmetic climb; each `handleSubmit` is one answer with correctness `val === q.answer`. No difficulty parameter → add `recordAttempt` only. Skill: `'integers'`.

**Files:**
- Modify: `src/pages/IntegerMountain.jsx`

- [ ] **Step 1: Add the engine imports**

The current top of `src/pages/IntegerMountain.jsx` is:
```js
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
```
Replace it with:
```js
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('IntegerMountain'); // 'integers'
```

- [ ] **Step 2: Record the attempt inside `handleSubmit`**

The current handler is:
```js
  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const val=parseInt(input,10);
    if(val===q.answer){
      setPosition(p=>Math.min(MOUNTAIN_HEIGHT,p+1));
      setScore(s=>s+20);
      setFeedback({text:'⛰️ Climb!',correct:true});
    }else{
      setPosition(p=>Math.max(0,p-1));
      setFeedback({text:`❌ Was ${q.answer}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},500);
  };
```
Replace it with (record correctness; skip empty/invalid input so a blank Enter isn't a logged miss):
```js
  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const val=parseInt(input,10);
    if(Number.isNaN(val)){setInput('');return;} // empty/invalid: don't record
    const correct=val===q.answer;
    recordAttempt({ skillId: SKILL, correct, responseTime: 0 });
    if(correct){
      setPosition(p=>Math.min(MOUNTAIN_HEIGHT,p+1));
      setScore(s=>s+20);
      setFeedback({text:'⛰️ Climb!',correct:true});
    }else{
      setPosition(p=>Math.max(0,p-1));
      setFeedback({text:`❌ Was ${q.answer}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},500);
  };
```

- [ ] **Step 3: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: build succeeds; no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/IntegerMountain.jsx
git commit -m "feat(game): per-answer recording in IntegerMountain"
```

---

### Task 12: Component tests — difficulty-from-engine + recordAttempt-fires

Three representative behavior tests cover the two integration shapes: (a) a typed-answer game that **also** seeds difficulty from the engine (`ArithmeticGame`), (b) an option-click `useGamification` game (`FractionFrenzy`), and (c) an option-click `usePlayerStore` game (`MultiplicationFarm`). Tests mock the engine module so we assert against the integration, not the BKT math (which the engine-core tests already cover). Each test file uses `// @vitest-environment jsdom`.

**Files:**
- Create: `src/pages/ArithmeticGame.integration.test.jsx`
- Create: `src/pages/FractionFrenzy.integration.test.jsx`
- Create: `src/pages/MultiplicationFarm.integration.test.jsx`

- [ ] **Step 1: ArithmeticGame test — difficulty comes from engine + recordAttempt fires**

Create `src/pages/ArithmeticGame.integration.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock the public engine API so we assert the integration, not the BKT math.
const getNextDifficulty = vi.fn(() => 'hard');
const recordAttempt = vi.fn(() => Promise.resolve(0.5));
vi.mock('../engine/engineAPI', () => ({
  getNextDifficulty: (...a) => getNextDifficulty(...a),
  recordAttempt: (...a) => recordAttempt(...a),
}));

import ArithmeticGame from './ArithmeticGame';

function renderGame() {
  return render(
    <MemoryRouter>
      <ArithmeticGame />
    </MemoryRouter>
  );
}

describe('ArithmeticGame engine integration', () => {
  beforeEach(() => {
    getNextDifficulty.mockClear();
    recordAttempt.mockClear();
    getNextDifficulty.mockReturnValue('hard');
  });

  it('asks the engine for difficulty for the addition skill', () => {
    renderGame();
    expect(getNextDifficulty).toHaveBeenCalledWith('addition');
  });

  it('seeds the selected difficulty from the engine recommendation', () => {
    renderGame();
    // 'hard' -> the Hard button is the active (btn-primary) one on the start screen.
    const hardBtn = screen.getByRole('button', { name: /hard/i });
    expect(hardBtn.className).toContain('btn-primary');
  });

  it('records an attempt with the addition skill after an answer', async () => {
    const user = userEvent.setup();
    renderGame();
    await user.click(screen.getByRole('button', { name: /start match/i }));

    // After Start, the answer input is present; type any value and submit (Enter).
    const input = await screen.findByPlaceholderText('?');
    await user.type(input, '7{enter}');

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    const arg = recordAttempt.mock.calls[0][0];
    expect(arg.skillId).toBe('addition');
    expect(typeof arg.correct).toBe('boolean');
    expect(typeof arg.responseTime).toBe('number');
  });
});
```

- [ ] **Step 2: FractionFrenzy test — recordAttempt fires on option click**

Create `src/pages/FractionFrenzy.integration.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const recordAttempt = vi.fn(() => Promise.resolve(0.5));
vi.mock('../engine/engineAPI', () => ({
  // FractionFrenzy imports only recordAttempt; provide getNextDifficulty as a no-op
  // so the module's import list resolves regardless of future edits.
  recordAttempt: (...a) => recordAttempt(...a),
  getNextDifficulty: () => 'easy',
}));

import FractionFrenzy from './FractionFrenzy';

describe('FractionFrenzy engine integration', () => {
  beforeEach(() => recordAttempt.mockClear());

  it('records an attempt with the fractions-basic skill on an option click', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FractionFrenzy />
      </MemoryRouter>
    );

    // The game starts immediately (no start screen); the four fraction options are buttons.
    // Click the first answer option (the numerator/denominator buttons render as button roles).
    const optionButtons = screen.getAllByRole('button').filter((b) => b.className.includes('rounded-2xl'));
    expect(optionButtons.length).toBeGreaterThan(0);
    await user.click(optionButtons[0]);

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    const arg = recordAttempt.mock.calls[0][0];
    expect(arg.skillId).toBe('fractions-basic');
    expect(typeof arg.correct).toBe('boolean');
  });
});
```

- [ ] **Step 3: MultiplicationFarm test — recordAttempt fires on option click (usePlayerStore game)**

Create `src/pages/MultiplicationFarm.integration.test.jsx`:
```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const recordAttempt = vi.fn(() => Promise.resolve(0.5));
vi.mock('../engine/engineAPI', () => ({
  recordAttempt: (...a) => recordAttempt(...a),
  getNextDifficulty: () => 'easy',
}));

import MultiplicationFarm from './MultiplicationFarm';

describe('MultiplicationFarm engine integration', () => {
  beforeEach(() => recordAttempt.mockClear());

  it('records an attempt with the multiplication skill on an answer choice', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MultiplicationFarm />
      </MemoryRouter>
    );

    // Four numeric answer buttons render in a grid; click the first.
    const answerButtons = screen.getAllByRole('button').filter((b) => /^\d+$/.test(b.textContent.trim()));
    expect(answerButtons.length).toBeGreaterThan(0);
    await user.click(answerButtons[0]);

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    const arg = recordAttempt.mock.calls[0][0];
    expect(arg.skillId).toBe('multiplication');
    expect(typeof arg.correct).toBe('boolean');
  });
});
```

- [ ] **Step 4: Run the new component tests**

```bash
npm test -- integration
```
Expected: PASS (3 files, all assertions). If the option-button `.filter` selectors do not match (because Tailwind class names shifted), debug by logging `screen.debug()` in the failing test and adjust the selector to target a stable attribute — do **not** change the game's markup to suit the test.

- [ ] **Step 5: Run the full suite (engine + db + game integration)**

```bash
npm test
```
Expected: PASS — engine-core tests (Node env) and game integration tests (jsdom env) all green, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ArithmeticGame.integration.test.jsx src/pages/FractionFrenzy.integration.test.jsx src/pages/MultiplicationFarm.integration.test.jsx
git commit -m "test(game): verify difficulty-from-engine and recordAttempt firing"
```

---

### Task 13: Full verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: PASS, 0 failures.

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no new errors in `src/App.jsx`, `src/engine/gameSkills.js`, or any of the 8 modified `src/pages/*.jsx`.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: build succeeds (the 8 games now import from `src/engine/engineAPI`, pulling the engine into the bundle for the first time — confirm no resolution or tree-shake errors).

- [ ] **Step 4: Manual smoke (optional but recommended)**

```bash
npm run dev
```
Then in the browser, play each of the 8 games once and confirm: (a) the game looks/plays identically to before (no visual change — §7 Critical), (b) DevTools → Application → IndexedDB shows `mastery_state` updating and `interaction_log` growing as you answer. No console errors from the engine.

- [ ] **Step 5: Final commit (if any uncommitted verification fixes)**

```bash
git status   # expect clean; commit only if a verification step required a fix
```

---

## Self-Review

**1. Spec coverage (Game Integration slice):**
- §7 "Each `src/pages/*Game.jsx`" → (a) declare game's skill, (b) replace random/picked difficulty with engine difficulty, (c) `recordAttempt` after each in-game answer → Tasks 4–11 (top 8). ✅
- §4 game→skill table → consumed via `GAME_SKILLS`/`skillForGame` (Task 2); each game's skill verified against the table in its task header. ✅
- §6.1 difficulty bins (`easy/medium/hard`) → consumed verbatim from `getNextDifficulty` (Tasks 4, 7; games already use these exact strings). ✅
- §10 "integrate top 8 first; remaining 12 keep current behavior in v1" → exactly 8 games modified; 12 untouched. ✅
- §7 **Critical** "zero changes to game content or visual design" → every task is additive (imports + one `recordAttempt` call + difficulty *default* only); no markup/JSX/styling/scoring/XP changed. Each task explicitly preserves the existing generators and XP calls. ✅
- `initEngine()` once at startup → Task 3 (in `App.jsx`'s existing effect; rationale for App over main.jsx documented). ✅

**2. Placeholder scan:** No "TBD" / "similar to above" / "add error handling later". Every modify step shows the exact current code and the exact replacement, in full. Every create step has complete file contents. ✅

**3. Type / name consistency:**
- Public API names used identically everywhere: `initEngine`, `getNextDifficulty`, `recordAttempt` — matched against `src/engine/engineAPI.js` (read; exact match). ✅
- `recordAttempt` argument shape `{ skillId, correct, responseTime }` consistent across all 8 games and all tests, matching the engine's locked signature. ✅
- `skillForGame(name)` keys are component names matching `GAME_SKILLS` keys in `knowledgeGraph.js` exactly: `ArithmeticGame`, `MultiplicationMeteor`, `FractionFrenzy`, `PatternPuzzle`, `MultiplicationFarm`, `FractionNinja`, `DecimalMall`, `IntegerMountain` (read; exact match). ✅
- Difficulty strings `'easy'|'medium'|'hard'` match what the games already use and what `getNextDifficulty` returns. ✅
- Import paths: games live in `src/pages/`, so `../engine/engineAPI` and `../engine/gameSkills` are correct relative paths (verified against existing `../store/...` and `../hooks/...` imports). ✅
- Test env: `vitest.config.js` default stays `node` (engine tests unaffected); component tests opt into jsdom via `// @vitest-environment jsdom` and the `include` glob widened to `.test.{js,jsx}`. ✅
- `npm install` uses `--legacy-peer-deps` (vite 8 vs vite-plugin-pwa peer conflict) — stated in Task 1. ✅

**4. Per-game correctness signal (verified against each file's actual handler):**
| Game | Handler | Correctness expression recorded | Difficulty wired? |
|---|---|---|---|
| ArithmeticGame | `handleSubmit` | `parseInt(inputValue) === currentQuestion.a` | Yes (default from engine; buttons kept) |
| MultiplicationMeteor | `handleSubmit` | `hitMeteorIndex !== -1` | No (fixed generator — §7 forbids content change) |
| FractionFrenzy | `handleOptionClick` | `isCorrect` | No (fixed generator) |
| PatternPuzzle | `handleSelect` | `opt === currentPattern.answer` | Yes (starting matrix difficulty from engine) |
| MultiplicationFarm | `handleAnswer` | `n === q.answer` | No (fixed generator) |
| FractionNinja | `handleSubmit` | `slashed.size === target` | No (fixed generator) |
| DecimalMall | `handleSubmit` | `Math.abs(userAns - q.decimal) < 0.015` (guarded vs NaN) | No (fixed generator) |
| IntegerMountain | `handleSubmit` | `val === q.answer` (guarded vs NaN) | No (fixed generator) |

---

## Open Questions

1. **`usePlayerStore.addXP` engine hook (spec §7 row):** The spec lists "`usePlayerStore.js` — in `addXP`, also call `engine.recordAttempt(...)`". This plan deliberately records **per in-game answer at the call site** instead, because `addXP` fires once per *game session* (not per answer) and the task brief mandates per-answer recording. Recommendation: drop the `addXP` hook entirely (per-answer is strictly better signal), or keep it only as a coarse fallback for the 12 un-integrated games. Confirm with the team before touching `usePlayerStore`.

2. **Two-skill games (`ArithmeticGame`, `FractionNinja`):** We record against the **primary** skill only (`addition`, `fractions-basic`). Should `ArithmeticGame` record `subtraction` when the generated op is `-`, and should `FractionNinja` ever record `equiv-fractions`? Doing so requires reading the per-question op/type — feasible but a slightly larger diff. Deferred; flag if finer per-skill attribution is wanted for the report's mastery heatmap.

3. **`responseTime` for non-typed games:** Option-click and timed games pass `responseTime: 0` (no clean per-question start timestamp without extra state). Only `ArithmeticGame` measures it. Is `responseTime` actually consumed by the BKT backend? (It is recorded to `interaction_log` but BKT ignores it.) If the DKT plan needs it, add per-question `Date.now()` timers to the other 7 games in a follow-up.

4. **Which 8 are the "most-played"?** Spec §10 says integrate the top 8 *most-played* games but the platform has no real usage data yet (cold start). This plan picks a representative spread across skill bands and code styles (typed vs option-click; `useGamification` vs `usePlayerStore`). If the team has a different top-8 in mind (e.g. by grade-band priority), swap the game list — the per-game tasks are independent and the pattern is identical.

5. **PatternPuzzle difficulty mapping (`easy→1, medium→3, hard→5`):** Chosen to map cleanly onto the existing `maxIdx = min(5, 1 + floor(level/2))` ramp (1/3/5 → 1/2/3 pattern types). Confirm these starting points feel right, or tune the map without touching the generator.

6. **Component-test selectors:** The integration tests target buttons by Tailwind class fragments / text patterns (no `data-testid` exists, and §7 forbids adding markup). If a future visual refresh changes those class names, the selectors break. Acceptable for v1; consider negotiating a few `data-testid`s with the design owner if these tests prove brittle.
