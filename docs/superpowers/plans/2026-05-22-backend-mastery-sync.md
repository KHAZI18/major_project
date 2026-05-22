# Adaptive Learning Engine — Backend Mastery Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **minimal, backward-compatible** Express/Mongo backend changes that persist the adaptive engine's mastery state and expose per-class mastery data to the teacher dashboard. The engine core (`src/engine/`) is already built and unit-tested; this plan only touches the server and the client sync glue.

**Architecture:** Per spec §3 point 4 ("No new server"), there is **no new infrastructure**. The change is exactly three edits plus tests:
1. Two new fields on the existing `ProgressSchema` (`masteryState`, `interactionLog`).
2. The existing `/api/sync` handler persists those two fields (additively — `GAME_SESSION` payloads that omit them must keep working), and a new read-only `GET /api/teacher/class-mastery` endpoint reshapes Mongo docs into the exact array the client's `classMastery(students)` expects.
3. A new `MASTERY_UPDATE` sync op type on the client, mirroring the existing `GAME_SESSION` op so the offline queue can ship mastery snapshots.

**Tech Stack:** Node (ES modules), Express 4, Mongoose 8. Tests: **Vitest** (consistent with the root repo, which already uses `vitest@4`) + **supertest** (HTTP assertions against the Express app) + **mongodb-memory-server** (real in-memory Mongo so Mongoose schema/validation/queries run for real, no hand-rolled mock).

**Spec reference:** `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` — implements the `server/models.js`, `server/server.js`, and `src/lib/syncEngine.js` rows of §7, and §3 point 4 ("two new fields on `Progress` + one new sync op type … the entire backend change").

**Depends on (already built, do NOT modify here):**
- `src/engine/engineAPI.js` — `classMastery(students)` defines the consumed shape: `students = [{ id, name, attempts: <scalar>, mastery: { [skillId]: P } }]`.
- `src/engine/decisionLayer.js` — `fairRanking` input contract (same shape; `mastery` holds **only attempted skills**, not a dense BKT prior map).
- `src/lib/db.js` — `mastery_state` store already exists; `loadMasteryState()` returns `{ id:'local', belief, attempts, lastPracticed, review }`.

**Explicitly OUT of scope:** game-page edits, `usePlayerStore` engine wiring, `StudentDashboard`/`TeacherDashboard` UI, the DKT pipeline, and any auth redesign (the teacher endpoint reuses the existing `auth` middleware as-is — see Open Questions).

---

## Decisions locked by this plan (read before coding)

- **New schema field names:** `masteryState` (Object) and `interactionLog` (Array of Object) — chosen verbatim from spec §7 to match the engine's `loadMasteryState()` payload key-for-key (`belief`, `attempts`, `lastPracticed`, `review`).
- **`masteryState` is stored as a free-form `Object`** (Mongoose `Schema.Types.Mixed` with `default: {}`), not a sub-schema. Rationale: the belief map is keyed by skill id and the engine owns its shape; a rigid sub-schema would couple the server to the BKT internals and break the "drop-in DKT swap" promise (spec §5.2 / §10).
- **`interactionLog` is `[Object]` (Mixed array, `default: []`)** — append-only interaction records `{ skillId, correct, responseTime, timestamp }`. Server does not validate element shape.
- **`/api/teacher/class-mastery` response shape (locked):**
  ```json
  [
    { "id": "<userId>", "name": "Asha",
      "attempts": 42,
      "mastery": { "addition": 0.81, "subtraction": 0.64 } }
  ]
  ```
  - `attempts` is the **scalar total** = sum of the per-skill counts in `masteryState.attempts` (the engine stores attempts as an object `{ [skillId]: count }`; `fairRanking` wants one number).
  - `mastery` contains **only attempted skills** (keys present in `masteryState.attempts`), read from `masteryState.belief`. This honours the `fairRanking` contract note that a dense prior map would inflate every skill.
  - Students with no `masteryState` yet return `attempts: 0, mastery: {}` (so the array length always equals the student count; the client can render an empty row).
- **`MASTERY_UPDATE` op semantics:** identical transport to `GAME_SESSION` — `{ type: 'MASTERY_UPDATE', payload: {...} }` pushed to the IndexedDB `sync_queue`; `syncEngine.sendToAPI` POSTs `operation.payload` to `/api/sync`. Both op types hit the same endpoint; the server merges whatever fields are present. No new client fetch path.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/models.js` | Add `masteryState: Mixed` + `interactionLog: [Mixed]` to `ProgressSchema` (modify) |
| `server/app.js` | Extract the Express app (routes + middleware) into an exported `createApp(deps)` factory so `server.js` and tests share it (new) |
| `server/server.js` | Thin entry: connect Mongo, build app via `createApp`, `listen` (modify) |
| `server/package.json` | Add `test` script + `vitest`, `supertest`, `mongodb-memory-server` devDeps (modify) |
| `server/vitest.config.js` | Node-env Vitest config for the server package (new) |
| `server/test/sync.test.js` | `/api/sync` persists new fields + GAME_SESSION still works (new) |
| `server/test/classMastery.test.js` | `/api/teacher/class-mastery` returns the locked shape (new) |
| `src/lib/syncEngine.js` | Document/handle `MASTERY_UPDATE` op type alongside `GAME_SESSION` (modify) |
| `src/store/usePlayerStore.js` | (touched only to confirm op-push call site is unchanged — no edit required; see Task 6 note) |

> **Why `server/app.js`?** The current `server.js` calls `app.listen` and `mongoose.connect` at import time, which makes it un-testable with supertest (importing it would bind a port and require a live Mongo). Extracting a `createApp()` factory is the standard supertest pattern and keeps `server.js` behaviour byte-for-byte identical at runtime. This is the only structural change; it is mechanical and backward-compatible.

---

### Task 1: Server test tooling (Vitest + supertest + mongodb-memory-server)

The `server/` package has no test runner (only `start`/`dev`). Add one consistent with the root repo (`vitest@4`).

**Files:**
- Modify: `server/package.json`
- Create: `server/vitest.config.js`
- Create: `server/test/sanity.test.js` (temporary; deleted at end of task)

- [ ] **Step 1: Install dev dependencies**

Run from the `server/` directory:
```bash
npm --prefix server install -D vitest supertest mongodb-memory-server
```
Expected: installs succeed and `server/package-lock.json` updates.

> **Peer-deps note:** The **root** repo's `npm install` needs `--legacy-peer-deps` (vite@8 / vitest@4 / react@19 peer ranges — documented in the engine-core plan and review). The `server/` package has **no React/Vite tree** (only Express/Mongoose/JWT), so its deps install cleanly **without** `--legacy-peer-deps`. If npm unexpectedly errors on a peer range, retry with `npm --prefix server install -D vitest supertest mongodb-memory-server --legacy-peer-deps` and record which command worked in the commit message. Do not add `--legacy-peer-deps` to `server/` pre-emptively.

> **First-run note:** `mongodb-memory-server` downloads a Mongo binary on first use (cached under `~/.cache/mongodb-binaries`). The first test run may take 10–30 s and needs network access once. Subsequent runs are offline.

- [ ] **Step 2: Add the test script to `server/package.json`**

In the `"scripts"` block add one line (keep `start` and `dev`):
```json
    "test": "vitest run"
```

- [ ] **Step 3: Create the server Vitest config**

Create `server/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // mongodb-memory-server's first-run binary download can be slow.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

- [ ] **Step 4: Write a sanity test, run it, then delete it**

Create `server/test/sanity.test.js`:
```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

describe('server test tooling', () => {
  it('runs supertest against a trivial express app', async () => {
    const app = express();
    app.get('/ping', (_req, res) => res.send({ ok: true }));
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
```
Run:
```bash
npm --prefix server test
```
Expected: PASS (1 passed). Then delete the file:
```bash
rm server/test/sanity.test.js
```

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json server/vitest.config.js
git commit -m "chore(server): add vitest + supertest + mongodb-memory-server test tooling"
```

---

### Task 2: Add `masteryState` + `interactionLog` to the Progress schema

**Files:**
- Modify: `server/models.js`
- Test: `server/test/models.test.js`

> Spec §7: "Add `masteryState: Object` + `interactionLog: [Object]` to `ProgressSchema`." We use `Schema.Types.Mixed` (Mongoose's typed name for a free-form Object) with safe defaults so existing docs and `GAME_SESSION`-only syncs are unaffected.

- [ ] **Step 1: Write the failing test**

Create `server/test/models.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Progress } from '../models.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('ProgressSchema mastery fields', () => {
  it('defaults masteryState to {} and interactionLog to [] for legacy docs', async () => {
    const p = await Progress.create({ userId: new mongoose.Types.ObjectId() });
    expect(p.masteryState).toEqual({});
    expect(p.interactionLog).toEqual([]);
  });

  it('stores an arbitrary mastery belief map without a fixed sub-schema', async () => {
    const userId = new mongoose.Types.ObjectId();
    const masteryState = {
      belief: { addition: 0.81, subtraction: 0.64 },
      attempts: { addition: 30, subtraction: 12 },
      lastPracticed: { addition: 1716000000000 },
      review: {},
    };
    const interactionLog = [
      { skillId: 'addition', correct: true, responseTime: 1200, timestamp: 1716000000000 },
    ];
    const p = await Progress.create({ userId, masteryState, interactionLog });
    const reloaded = await Progress.findById(p._id).lean();
    expect(reloaded.masteryState.belief.addition).toBeCloseTo(0.81, 5);
    expect(reloaded.masteryState.attempts.subtraction).toBe(12);
    expect(reloaded.interactionLog[0].skillId).toBe('addition');
    expect(reloaded.interactionLog[0].correct).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- models`
Expected: FAIL (the second assertion fails: `masteryState` is dropped because it is not yet declared on the schema, so `reloaded.masteryState` is `undefined`).

- [ ] **Step 3: Modify `server/models.js`**

Add the two fields to `ProgressSchema`. Locate the existing tail of the schema:
```js
  achievements: [String],
  updatedAt: { type: Date, default: Date.now }
});
```
Replace it with (note the comma after `achievements`):
```js
  achievements: [String],
  // Adaptive engine (spec §7): free-form per-student mastery snapshot.
  // Stored as Mixed so the server stays agnostic to the BKT/DKT belief shape.
  masteryState: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Adaptive engine (spec §7): append-only interaction records
  // ({ skillId, correct, responseTime, timestamp }); server does not validate element shape.
  interactionLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  updatedAt: { type: Date, default: Date.now }
});
```

> **Mongoose Mixed caveat (do NOT skip):** Mongoose does not auto-detect in-place mutations of a `Mixed` path. This plan never mutates `masteryState` in place — the `/api/sync` handler (Task 4) **assigns a whole new object** via `findOneAndUpdate`, which Mongoose tracks correctly. If a future task mutates it in place, it must call `doc.markModified('masteryState')`. Flag this in any review.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test -- models`
Expected: PASS (both assertions; the legacy-default test also confirms backward compatibility).

- [ ] **Step 5: Commit**

```bash
git add server/models.js server/test/models.test.js
git commit -m "feat(server): add masteryState + interactionLog to Progress schema"
```

---

### Task 3: Extract a testable `createApp()` factory

`server.js` binds a port and connects to Mongo at import time, so it can't be driven by supertest. Extract the routes into `server/app.js` with no behaviour change.

**Files:**
- Create: `server/app.js`
- Modify: `server/server.js`

> This is a pure refactor — every route, the `auth` middleware, and the JSON/CORS setup move verbatim into `createApp()`. `server.js` keeps owning `mongoose.connect` and `app.listen`. Tests inject their own connection (Task 4/5) and never call `listen`.

- [ ] **Step 1: Create `server/app.js`**

Create `server/app.js` (routes copied verbatim from the current `server.js` lines 10–100, wrapped in a factory):
```js
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Progress } from './models.js';

// Factory so server.js and tests share the exact same app instance.
// Mongo connection is the caller's responsibility (server.js connects to
// the real DB; tests connect to mongodb-memory-server before calling this).
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Auth Middleware
  const auth = async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) throw new Error();
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.id;
      next();
    } catch (e) {
      res.status(401).send({ error: 'Please authenticate.' });
    }
  };

  // Routes
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password, role, grade, avatar } = req.body;
      const hashedPassword = await bcrypt.hash(password, 8);

      const user = new User({ name, email, password: hashedPassword, role, grade, avatar });
      await user.save();

      const progress = new Progress({ userId: user._id });
      await progress.save();

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.status(201).send({ user, token });
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new Error('Invalid login credentials');
      }
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.status(200).send({ user, token });
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  app.get('/api/progress', auth, async (req, res) => {
    try {
      const progress = await Progress.findOne({ userId: req.userId });
      res.send(progress);
    } catch (e) {
      res.status(500).send();
    }
  });

  app.post('/api/sync', auth, async (req, res) => {
    try {
      const { xp, coins, level, streak, history, achievements } = req.body;
      const progress = await Progress.findOneAndUpdate(
        { userId: req.userId },
        { xp, coins, level, streak, history, achievements, updatedAt: new Date() },
        { new: true, upsert: true }
      );
      res.send(progress);
    } catch (e) {
      res.status(400).send(e.message);
    }
  });

  app.get('/api/teacher/students', auth, async (req, res) => {
    try {
      const students = await User.find({ role: 'student' });
      const studentData = await Promise.all(students.map(async (s) => {
        const p = await Progress.findOne({ userId: s._id });
        return { ...s._doc, progress: p };
      }));
      res.send(studentData);
    } catch (e) {
      res.status(500).send();
    }
  });

  return app;
}
```

- [ ] **Step 2: Rewrite `server/server.js` to use the factory**

Replace the entire contents of `server/server.js` with:
```js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const app = createApp();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm --prefix server test`
Expected: PASS (only the `models` test exists so far; the refactor must not break it). Optionally start the server (`npm --prefix server run dev`) against a real Mongo URI to confirm routes still respond, then stop it.

- [ ] **Step 4: Commit**

```bash
git add server/app.js server/server.js
git commit -m "refactor(server): extract createApp factory for testability (no behaviour change)"
```

---

### Task 4: Persist `masteryState` + `interactionLog` in `/api/sync`

**Files:**
- Modify: `server/app.js`
- Test: `server/test/sync.test.js`

> Spec §7: "Persist new fields in `/api/sync`." The merge must be **additive**: a `GAME_SESSION` payload (no mastery fields) must still update xp/coins/etc. without wiping mastery, and a `MASTERY_UPDATE` payload must not require xp/coins. We achieve both by **building the update object from only the keys present in the body** (`undefined` keys are skipped, so Mongo leaves them untouched).

- [ ] **Step 1: Write the failing test**

Create `server/test/sync.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app.js';
import { User, Progress } from '../models.js';

let mongod;
let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Progress.deleteMany({});
});

async function makeStudent() {
  const user = await User.create({
    name: 'Asha', email: `asha${Math.random()}@x.com`,
    password: 'hash', role: 'student',
  });
  await Progress.create({ userId: user._id });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  return { user, token };
}

describe('POST /api/sync', () => {
  it('persists masteryState and interactionLog (MASTERY_UPDATE payload)', async () => {
    const { user, token } = await makeStudent();
    const masteryState = {
      belief: { addition: 0.81 },
      attempts: { addition: 30 },
      lastPracticed: {}, review: {},
    };
    const interactionLog = [
      { skillId: 'addition', correct: true, responseTime: 1200, timestamp: 1 },
    ];

    const res = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ masteryState, interactionLog });

    expect(res.status).toBe(200);
    const saved = await Progress.findOne({ userId: user._id }).lean();
    expect(saved.masteryState.belief.addition).toBeCloseTo(0.81, 5);
    expect(saved.interactionLog[0].skillId).toBe('addition');
  });

  it('still works for a GAME_SESSION payload (no mastery fields)', async () => {
    const { user, token } = await makeStudent();
    const res = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ xp: 500, coins: 50, level: 3, streak: 2, history: [], achievements: ['first'] });

    expect(res.status).toBe(200);
    const saved = await Progress.findOne({ userId: user._id }).lean();
    expect(saved.xp).toBe(500);
    expect(saved.achievements).toEqual(['first']);
  });

  it('does NOT wipe mastery when a later GAME_SESSION sync omits it', async () => {
    const { user, token } = await makeStudent();
    // First: a mastery sync.
    await request(app).post('/api/sync').set('Authorization', `Bearer ${token}`)
      .send({ masteryState: { belief: { addition: 0.9 }, attempts: { addition: 5 } } });
    // Then: a game-session sync with no mastery fields.
    await request(app).post('/api/sync').set('Authorization', `Bearer ${token}`)
      .send({ xp: 999 });

    const saved = await Progress.findOne({ userId: user._id }).lean();
    expect(saved.xp).toBe(999);
    expect(saved.masteryState.belief.addition).toBeCloseTo(0.9, 5); // preserved
  });

  it('rejects an unauthenticated sync', async () => {
    const res = await request(app).post('/api/sync').send({ xp: 1 });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- sync`
Expected: FAIL — the first test fails (`masteryState`/`interactionLog` are ignored by the current handler) and the "does NOT wipe" test fails (current handler sets unrelated fields to `undefined`).

- [ ] **Step 3: Modify the `/api/sync` handler in `server/app.js`**

Replace the existing handler:
```js
  app.post('/api/sync', auth, async (req, res) => {
    try {
      const { xp, coins, level, streak, history, achievements } = req.body;
      const progress = await Progress.findOneAndUpdate(
        { userId: req.userId },
        { xp, coins, level, streak, history, achievements, updatedAt: new Date() },
        { new: true, upsert: true }
      );
      res.send(progress);
    } catch (e) {
      res.status(400).send(e.message);
    }
  });
```
with an additive version that only writes the keys present in the body:
```js
  app.post('/api/sync', auth, async (req, res) => {
    try {
      // Build the update from only the fields the payload actually carries, so a
      // GAME_SESSION sync (xp/coins/...) and a MASTERY_UPDATE sync (masteryState/
      // interactionLog) can each touch their own fields without clobbering the other.
      const SYNCABLE = ['xp', 'coins', 'level', 'streak', 'history',
        'achievements', 'masteryState', 'interactionLog'];
      const update = { updatedAt: new Date() };
      for (const key of SYNCABLE) {
        if (req.body[key] !== undefined) update[key] = req.body[key];
      }
      const progress = await Progress.findOneAndUpdate(
        { userId: req.userId },
        { $set: update },
        { new: true, upsert: true }
      );
      res.send(progress);
    } catch (e) {
      res.status(400).send(e.message);
    }
  });
```

> **Why `$set` with a filtered object (not the old positional form):** the original handler passed `{ xp, coins, ... }` where omitted keys were `undefined`. With `findOneAndUpdate`, Mongoose strips top-level `undefined`, so the old GAME_SESSION path happened to work — but it would still overwrite mastery fields if they were ever added to the same object. Filtering explicitly + `$set` makes the additive behaviour intentional and test-guaranteed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test -- sync`
Expected: PASS (all four cases, including backward-compat and no-wipe).

- [ ] **Step 5: Commit**

```bash
git add server/app.js server/test/sync.test.js
git commit -m "feat(server): persist masteryState + interactionLog additively in /api/sync"
```

---

### Task 5: `GET /api/teacher/class-mastery` endpoint

**Files:**
- Modify: `server/app.js`
- Test: `server/test/classMastery.test.js`

> Spec §7: "expose `/api/teacher/class-mastery`." Returns, per student, exactly the shape `src/engine/engineAPI.js`'s `classMastery(students)` (and `decisionLayer.fairRanking`) consume: `[{ id, name, attempts, mastery }]`. The endpoint does NOT compute the aggregate/ranking itself — the client engine does that (single source of truth). The server only reshapes Mongo docs.

- [ ] **Step 1: Write the failing test**

Create `server/test/classMastery.test.js`:
```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../app.js';
import { User, Progress } from '../models.js';

let mongod;
let app;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Progress.deleteMany({});
});

async function makeTeacherToken() {
  const t = await User.create({
    name: 'Teach', email: `t${Math.random()}@x.com`,
    password: 'hash', role: 'teacher',
  });
  return jwt.sign({ id: t._id }, process.env.JWT_SECRET);
}

async function seedStudent(name, masteryState) {
  const u = await User.create({
    name, email: `${name}${Math.random()}@x.com`,
    password: 'hash', role: 'student',
  });
  await Progress.create({ userId: u._id, masteryState });
  return u;
}

describe('GET /api/teacher/class-mastery', () => {
  it('returns [{ id, name, attempts, mastery }] with attempts summed and only attempted skills', async () => {
    const token = await makeTeacherToken();
    await seedStudent('Asha', {
      belief: { addition: 0.81, subtraction: 0.64, multiplication: 0.2 },
      attempts: { addition: 30, subtraction: 12 }, // multiplication NOT attempted
      lastPracticed: {}, review: {},
    });

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const row = res.body[0];
    expect(row).toHaveProperty('id');
    expect(row.name).toBe('Asha');
    expect(row.attempts).toBe(42);                 // 30 + 12 (scalar total)
    expect(row.mastery.addition).toBeCloseTo(0.81, 5);
    expect(row.mastery.subtraction).toBeCloseTo(0.64, 5);
    expect(row.mastery).not.toHaveProperty('multiplication'); // belief present but 0 attempts
  });

  it('returns attempts:0 and mastery:{} for a student with no masteryState', async () => {
    const token = await makeTeacherToken();
    await seedStudent('Newbie', undefined); // Progress created, masteryState defaults to {}

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.find((r) => r.name === 'Newbie');
    expect(row.attempts).toBe(0);
    expect(row.mastery).toEqual({});
  });

  it('excludes teachers and is the right length for the class', async () => {
    const token = await makeTeacherToken(); // a teacher exists
    await seedStudent('A', { belief: { addition: 0.5 }, attempts: { addition: 1 } });
    await seedStudent('B', { belief: { addition: 0.6 }, attempts: { addition: 2 } });

    const res = await request(app)
      .get('/api/teacher/class-mastery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2); // only students, not the teacher
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/teacher/class-mastery');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- classMastery`
Expected: FAIL (404 / route not found — endpoint doesn't exist yet).

- [ ] **Step 3: Add the endpoint to `server/app.js`**

Insert after the existing `app.get('/api/teacher/students', ...)` handler and before `return app;`:
```js
  // Adaptive engine (spec §7): per-student mastery for the teacher dashboard.
  // Returns exactly the shape src/engine/engineAPI.classMastery(students) consumes:
  //   [{ id, name, attempts: <scalar>, mastery: { [skillId]: P } }]
  // The client engine computes perSkill means + fairRanking; the server only reshapes.
  app.get('/api/teacher/class-mastery', auth, async (req, res) => {
    try {
      const students = await User.find({ role: 'student' });
      const rows = await Promise.all(students.map(async (s) => {
        const p = await Progress.findOne({ userId: s._id }).lean();
        const ms = p?.masteryState ?? {};
        const belief = ms.belief ?? {};
        const attemptsMap = ms.attempts ?? {};

        // Scalar total attempts = sum of per-skill counts.
        const attempts = Object.values(attemptsMap)
          .reduce((sum, n) => sum + (Number(n) || 0), 0);

        // Only skills the student has actually attempted (fairRanking contract:
        // a dense prior belief map would inflate every skill's mastery).
        const mastery = {};
        for (const skillId of Object.keys(attemptsMap)) {
          if (belief[skillId] != null) mastery[skillId] = belief[skillId];
        }

        return { id: s._id, name: s.name, attempts, mastery };
      }));
      res.send(rows);
    } catch (e) {
      res.status(500).send();
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test -- classMastery`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add server/app.js server/test/classMastery.test.js
git commit -m "feat(server): add GET /api/teacher/class-mastery endpoint"
```

---

### Task 6: Add the `MASTERY_UPDATE` sync op type (client)

**Files:**
- Modify: `src/lib/syncEngine.js`
- Test: `src/lib/syncEngine.mastery.test.js`

> Spec §7: "Add `MASTERY_UPDATE` op type." The existing op (`GAME_SESSION`) is pushed in `usePlayerStore.js` as `{ type: 'GAME_SESSION', payload }` and `syncEngine.sendToAPI` POSTs `operation.payload` to `/api/sync` regardless of `type`. `MASTERY_UPDATE` reuses the **same** transport and endpoint; the only addition is making `type` a recognised, documented constant and routing both op types through the same code path (so a future op type can diverge cleanly). No new fetch path is needed because the server merges additively (Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/lib/syncEngine.mastery.test.js` (runs under the **root** Vitest config, which already exists):
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module so we control the queue contents without IndexedDB writes.
vi.mock('./db', () => ({
  getAllSyncQueueItems: vi.fn(),
  removeSyncQueueItem: vi.fn(async () => {}),
  incrementSyncRetry: vi.fn(async () => {}),
}));

import { getAllSyncQueueItems, removeSyncQueueItem } from './db';
import { processSyncQueue, SYNC_OP_TYPES } from './syncEngine';

describe('syncEngine MASTERY_UPDATE op', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem('mv_auth', JSON.stringify({ token: 'tkn' }));
    // jsdom-less node: stub the bits processSyncQueue touches.
    globalThis.navigator = { onLine: true };
  });

  it('declares both op types', () => {
    expect(SYNC_OP_TYPES.GAME_SESSION).toBe('GAME_SESSION');
    expect(SYNC_OP_TYPES.MASTERY_UPDATE).toBe('MASTERY_UPDATE');
  });

  it('POSTs a MASTERY_UPDATE payload to /api/sync and clears it on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    globalThis.fetch = fetchMock;

    getAllSyncQueueItems.mockResolvedValue([
      { id: 1, type: 'MASTERY_UPDATE', retries: 0,
        payload: { masteryState: { belief: { addition: 0.9 } } } },
    ]);

    await processSyncQueue();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/sync$/);
    expect(JSON.parse(opts.body).masteryState.belief.addition).toBe(0.9);
    expect(removeSyncQueueItem).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npm test -- syncEngine.mastery`
Expected: FAIL (`SYNC_OP_TYPES` is not exported).

- [ ] **Step 3: Modify `src/lib/syncEngine.js`**

Add the op-type constant near the top, after the existing imports/consts (after `let syncing = false;`):
```js
// Recognised offline sync operations. Both currently POST their `payload`
// to /api/sync; the server merges fields additively (GAME_SESSION carries
// xp/coins/..., MASTERY_UPDATE carries masteryState/interactionLog).
export const SYNC_OP_TYPES = {
  GAME_SESSION: 'GAME_SESSION',
  MASTERY_UPDATE: 'MASTERY_UPDATE',
};
```

Then make `sendToAPI` explicit about the op type it handles (replace the existing `sendToAPI` body's `try` block return) so the routing is documented and a future op type fails loudly instead of silently POSTing:
```js
async function sendToAPI(operation) {
  const authData = JSON.parse(localStorage.getItem('mv_auth') || '{}');
  const token = authData.token;

  if (!token) return true; // Can't sync without auth

  // Both known op types POST their payload to /api/sync (server merges additively).
  if (
    operation.type !== SYNC_OP_TYPES.GAME_SESSION &&
    operation.type !== SYNC_OP_TYPES.MASTERY_UPDATE
  ) {
    console.warn('[SyncEngine] Unknown op type, skipping:', operation.type);
    return true; // drop unknown ops so they don't wedge the queue
  }

  try {
    const res = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(operation.payload),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}
```

> The producer side (pushing a `MASTERY_UPDATE` op when the engine saves) belongs to the **engine-wiring plan** (`usePlayerStore` / engine integration), not here — that plan will call `pushToSyncQueue({ type: SYNC_OP_TYPES.MASTERY_UPDATE, payload: { masteryState, interactionLog } })`, mirroring the existing `GAME_SESSION` push at `usePlayerStore.js:133`. This plan only makes the transport recognise and correctly ship the op. Note that in this plan's task list, `src/store/usePlayerStore.js` is **not edited**.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- syncEngine.mastery`
Expected: PASS. Also run the existing suite to confirm no regression: `npm test -- syncEngine` (if a prior syncEngine test exists) and the full `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/syncEngine.js src/lib/syncEngine.mastery.test.js
git commit -m "feat(sync): recognise MASTERY_UPDATE op type in sync engine"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the server test suite**

Run: `npm --prefix server test`
Expected: PASS — `models`, `sync`, `classMastery` all green, 0 failures.

- [ ] **Step 2: Run the root (client) test suite**

Run (from repo root): `npm test`
Expected: PASS — existing engine/db tests plus the new `syncEngine.mastery` test green, 0 failures. (If the root install was never done in this environment, run `npm install --legacy-peer-deps` first — the root repo's documented constraint.)

- [ ] **Step 3: Smoke-check the server boots**

Run: `npm --prefix server run dev` against a dev `MONGODB_URI`, confirm `/api/teacher/class-mastery` returns `[]` (empty class) with a valid teacher token, then stop. (Optional if no Mongo available locally — the supertest suite already exercises the route.)

- [ ] **Step 4: Confirm backward compatibility**

Manually re-read the diff for `server/app.js` `/api/sync`: a body of `{ xp, coins, level, streak, history, achievements }` (the current client GAME_SESSION shape via `usePlayerStore`) must still update those fields. The Task 4 test `still works for a GAME_SESSION payload` proves this.

---

## Self-Review

**1. Spec coverage (Backend slice of §7):**
- `server/models.js` → `masteryState: Object` + `interactionLog: [Object]` → Task 2. ✅
- `server/server.js` → persist new fields in `/api/sync` + expose `/api/teacher/class-mastery` → Tasks 4 & 5 (handlers live in the extracted `server/app.js`; `server.js` is the thin entry). ✅
- `src/lib/syncEngine.js` → `MASTERY_UPDATE` op type → Task 6. ✅
- §3 point 4 ("two new fields + one new sync op = the entire backend change") → honoured; no new collections, no new infra. The only extra file (`server/app.js`) is a behaviour-preserving refactor required to make the server testable. ✅

**2. Backward compatibility:**
- `masteryState`/`interactionLog` default to `{}`/`[]`, so existing `Progress` docs and the `GAME_SESSION` sync path are unaffected (Task 2 legacy-default test + Task 4 GAME_SESSION + no-wipe tests). ✅
- `/api/sync` writes only keys present in the body, so neither op type clobbers the other's fields. ✅
- Existing `/api/teacher/students`, `/api/progress`, auth routes are copied verbatim into `createApp()` — no signature changes. ✅

**3. Shape consistency (client ↔ server):**
- `/api/teacher/class-mastery` returns `[{ id, name, attempts, mastery }]` — matches `classMastery(students)` / `fairRanking` input in `src/engine/engineAPI.js` and `src/engine/decisionLayer.js` exactly. ✅
- `attempts` is a **scalar** (summed from the engine's per-skill `attempts` object) — `fairRanking` uses `s.attempts ?? 0` as `n`. ✅
- `mastery` includes **only attempted skills** (keys of `masteryState.attempts`), honouring the `fairRanking` "do NOT pass a dense BKT map" note. ✅

**4. Placeholder scan:** No "TBD"/"similar to Task N"/"add error handling". Every code step contains complete, runnable code (full `createApp`, full handlers, full test files). ✅

**5. Test stack realism:** Vitest matches the root repo (`vitest@4`); supertest drives the real Express app via the `createApp` factory; `mongodb-memory-server` runs a real in-memory Mongo so Mongoose validation/Mixed behaviour is exercised for real (not mocked). The client-side `MASTERY_UPDATE` test mocks only `./db` and `fetch`, which is appropriate for a pure transport unit. ✅

---

## Open Questions

1. **Auth / authorization on the teacher endpoint (IMPORTANT).** `GET /api/teacher/class-mastery` (like the existing `/api/teacher/students`) uses the shared `auth` middleware, which only verifies a **valid JWT** — it does **not** check `role === 'teacher'`. So any authenticated *student* could fetch the whole class's mastery. The existing code has this same gap, so this plan preserves current behaviour rather than silently changing the security model. **Recommendation:** add a `requireTeacher` middleware (`User.findById(req.userId).role === 'teacher'`) to both teacher routes — flagged here as a follow-up rather than scope-creeping this plan. Confirm with the team whether to fix it now.

2. **Student identity in `class-mastery`.** Each student maps to one `Progress` doc via `userId`, and `id` in the response is the Mongo `_id`. But the on-device engine stores a single `mastery_state` record keyed `'local'` (one device = one student). This assumes **one student per device/account** — correct for the rural-school single-login model, but if a device is shared by multiple students under one account, their mastery would merge. Confirm the deployment assumption (per-student login vs. shared device).

3. **`attempts` semantics for `fairRanking`.** We sum per-skill attempt counts into a scalar `n`. The engine also has the raw `interactionLog` length (could differ if a future engine records interactions without incrementing `attempts`). Confirm summed-`attempts` is the intended `n` for shrinkage, or switch to `interactionLog.length`.

4. **`interactionLog` growth.** The engine caps the on-device log at the last 50 interactions, but the server schema `interactionLog: [Mixed]` is unbounded. If clients ever sync the full log, server docs could grow without limit. Recommend the client always sync only the trailing window (it already does), and/or cap server-side on write. Out of scope here; flag for the engine-wiring plan.

5. **Where the `MASTERY_UPDATE` op is produced.** This plan makes the sync engine *recognise and ship* the op but does not *enqueue* it — that belongs to the engine-wiring plan (`usePlayerStore`/engine integration). Confirm that sequencing is acceptable (this plan is independently testable and shippable; mastery just won't flow to the server until the wiring plan lands).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-backend-mastery-sync.md`.

Recommended next step: a quick review of Open Question #1 (teacher-role authorization) and #5 (op producer sequencing) before execution, since both affect whether this plan ships standalone or waits on the engine-wiring plan. The seven tasks are otherwise self-contained and TDD-ordered.
