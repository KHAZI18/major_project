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
// students: [{ id, name, attempts: <scalar total>, mastery: { [skillId]: P } }]
// Pass only the skills a student has actually attempted (not a dense BKT map).
const { perSkill, ranking } = classMastery(students); // from /api/teacher/class-mastery
```

## Layers
- `knowledgeGraph.js` — 13-skill DAG, prereqs, game↔skill map, graph helpers.
- `masteryModel.js` — mastery estimation. Ships the **BKT** backend.
- `decisionLayer.js` — `nextDifficulty`, `suggestNextSkill`, SM-2 (`createReview`/`updateReview`/`isDue`/`dueForReview`), `fairRanking`.
- `engineAPI.js` — the singleton public API above.

## Thresholds
- `0.75` = "mastered" (unlock downstream skills, count toward breadth). A skill at exactly
  0.75 is still served at **Medium** difficulty; only **> 0.75** is served at **Hard**.
- `0.85` = mastery level at which spaced-repetition review scheduling begins.

## Swapping the mastery backend (future DKT)
`masteryModel.js` ships a BKT backend. The DKT backend (separate plan) must export the
same three functions: `createInitialBelief`, `updateBelief`, `getMastery`. Because the
graph has 13 skills, the DKT input dimension is `2 × SKILL_IDS.length = 26`.

## Tests
`npm test` — pure-logic + IndexedDB (fake-indexeddb) unit tests, Node environment.

## DKT backend (optional swap)

`masteryModel.js` ships the **BKT** backend (default). The **DKT** backend
(`masteryModelDKT.js`) is a TF.js LSTM with the same three exports. Select it
with the flag in `backendConfig.js` or `VITE_MASTERY_BACKEND=dkt`. Nothing else
changes — `initEngine()` loads the model (`public/models/dkt/model.json`).

DKT belief is sequence-based: it stores the last 50 interactions and re-runs
inference on read (memoized per belief), staying immutable/serializable like BKT.

### Performance verification (spec §8.3: inference < 30 ms, load < 2 s)
Targets are for a mid-range Android device; physical-device testing is out of
scope here. Method for the report's Results chapter:
1. `VITE_MASTERY_BACKEND=dkt npm run build && npm run preview`, open in mobile
   Chrome (or DevTools device emulation, Redmi-Note-class CPU throttle 4x).
2. **Model load:** DevTools → Network, reload, read the `model.json` + `.bin`
   transfer + parse time; or wrap `loadModel()` in `performance.now()`.
3. **Inference:** DevTools → Performance, record while answering; or log
   `performance.now()` around `getMastery`. Confirm < 30 ms/attempt, < 2 s load.
4. The Node micro-benchmark (`perf-dkt.bench.test.js`) only guards against gross
   regressions — it is NOT the device target.
