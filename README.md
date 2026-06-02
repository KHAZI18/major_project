# Math Village

**An offline-first, gamified mathematics learning PWA for rural education (Grades 2–6), with an on-device Adaptive Learning Engine and an Express/MongoDB backend for cross-device sync and teacher analytics.**

Math Village delivers 20 math mini-games as an installable Progressive Web App that works fully offline on low-end Android devices. Layered on top is an **Adaptive Learning Engine** that personalizes difficulty per student, recommends what to learn next, schedules spaced-repetition reviews, and powers a fairer, mastery-aware leaderboard.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Prerequisites](#3-prerequisites)
4. [Environment Setup](#4-environment-setup)
5. [Install](#5-install)
6. [Run](#6-run)
7. [Testing](#7-testing)
8. [Seeding Test Data](#8-seeding-test-data)
9. [ML Evaluation Harness](#9-ml-evaluation-harness)
10. [DKT Training (Optional)](#10-dkt-training-optional)
11. [Project Structure](#11-project-structure)
12. [Documentation Reading Order](#12-documentation-reading-order)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Overview

Math Village is a Progressive Web App for teaching mathematics to rural students in Grades 2–6. It is **offline-first**: every game runs entirely in the browser with no network required, and progress is stored locally in IndexedDB. An optional backend adds cross-device sync and a teacher class-analytics view.

The headline feature is the **Adaptive Learning Engine** (`src/engine/`), a self-contained, UI-free module that closes the "uniform difficulty for everyone" personalization gap. It combines:

- **Knowledge Graph** — a hand-authored 13-skill DAG (`counting → addition → … → algebra-basics`) with prerequisite edges and a game-to-skill mapping. It drives "what to teach next" and "which prerequisite to revisit when a student fails."
- **BKT mastery model** — per-skill mastery estimation. The engine ships the **Bayesian Knowledge Tracing (BKT)** backend as the **live default**.
- **Adaptive difficulty** — targets the Zone of Proximal Development (ZPD): a skill is served Easy below 0.40 mastery, Medium between 0.40 and 0.75, and Hard above 0.75.
- **Spaced repetition** — the **SM-2** algorithm schedules reviews of mastered skills (review scheduling begins at 0.85 mastery) to prevent forgetting.
- **Fair ranking** — a Bayesian-shrinkage leaderboard that ranks by mastery and breadth instead of raw XP, so a brand-new high scorer cannot leapfrog established students on a single attempt.

**BKT vs. DKT.** BKT is the default backend that ships and runs everywhere. A **Deep Knowledge Tracing (DKT)** backend (`src/engine/masteryModelDKT.js`, a TensorFlow.js LSTM) is an **optional drop-in** that exposes the exact same engine API. The DKT model is **not trained in this environment** — training requires TensorFlow, which does not install cleanly on Python 3.9/arm64 here, so it is trained off-device (Colab/TF) and exported to `public/models/dkt/`. Once a model exists, set `VITE_MASTERY_BACKEND=dkt` to select it; no other code changes. See [DKT Training](#10-dkt-training-optional).

> Note: the original design spec proposed DKT as the primary model and 12 skills. The shipped implementation locks in **13 skills** and **BKT as the default backend** (DKT optional), with the corresponding DKT input one-hot dimension of `2 × 13 = 26`.

---

## 2. Tech Stack

### Frontend
- **React 19** + **Vite 8** (build tool / dev server)
- **Tailwind CSS 4** (via `@tailwindcss/vite`)
- **zustand** (state management)
- **recharts** (dashboard charts)
- **idb** (IndexedDB wrapper for offline persistence)
- **vite-plugin-pwa** (service worker, manifest, offline caching)
- **framer-motion**, **lucide-react**, **canvas-confetti** (UI / animation)
- **react-router-dom** (routing)

### Backend
- **Express 4** (HTTP API)
- **Mongoose 8** (MongoDB ODM)
- **jsonwebtoken** (JWT auth) + **bcryptjs** (password hashing)
- **cors**, **dotenv**

### ML / Adaptive Engine
- **@tensorflow/tfjs** — the optional on-device DKT backend
- **Python** (numpy / pandas / scikit-learn / pyarrow) — the synthetic-data + evaluation harness in `scripts/`
- **TensorFlow / tensorflowjs** — off-device DKT training (Colab/TF, not run here)

---

## 3. Prerequisites

- **Node.js** — v22 is used here (`v22.21.0`). Any recent LTS Node 20+ should work.
- **A MongoDB connection** — a MongoDB Atlas connection string (`mongodb+srv://…`) is the expected setup. Required only for the backend (sync + teacher analytics); the frontend runs offline without it.
- **Python 3.9** — optional, only for the ML evaluation harness in `scripts/`. The pinned wheels in `requirements.txt` target Python 3.9 (`cp39`). (The off-device DKT trainer needs TensorFlow and a 3.10/3.11 environment or Colab.)

---

## 4. Environment Setup

There is **one `.env` file**, and it lives in the **repository root**. The backend reads it because `npm run server` is launched **from the root** (`server/server.js` calls `dotenv.config()`, which loads the root `.env`). Vite also reads the same root `.env` for any `VITE_`-prefixed keys. The file is **gitignored** — never commit it.

Create `/.env` at the repo root with these keys:

```env
PORT=4200
VITE_API_URL=http://localhost:4200/api
MONGODB_URI=mongodb+srv://<USER>:<PASS>@<cluster>.mongodb.net/<db>?retryWrites=true&w=majority
JWT_SECRET=<a-long-random-secret>
```

**Critical rule:** `VITE_API_URL`'s port **must equal** `PORT`. The backend listens on `PORT`; the frontend calls the API at `VITE_API_URL`. If they disagree, the frontend cannot reach the backend.

- We use **`PORT=4200`** (not the conventional `5000`) because macOS AirPlay Receiver squats on port 5000. See [Troubleshooting](#13-troubleshooting).
- The code defaults (`server.js` falls back to `PORT=5000`; `src/lib/apiBase.js` falls back to `http://localhost:5000/api`) are only used when `.env` is absent — always set the keys above.

**Optional keys:**

```env
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>   # optional, for Google sign-in
VITE_MASTERY_BACKEND=dkt                          # optional, selects DKT once a model is exported
```

---

## 5. Install

Install **two** dependency sets — root (frontend + scripts) and `server/` (backend).

**Root (frontend):** the `--legacy-peer-deps` flag is **required**.

```bash
npm install --legacy-peer-deps
```

> Why the flag is required: there is a peer-dependency conflict between **Vite 8** and **vite-plugin-pwa** (which declares an older Vite peer range). Without `--legacy-peer-deps`, `npm install` fails with an `ERESOLVE` error.

**Backend:** clean install, no flag needed.

```bash
npm --prefix server install
```

---

## 6. Run

Open **two terminals**, both **from the repository root**.

**Terminal 1 — backend:**

```bash
npm run server
```
- Serves the API at **http://localhost:4200**.
- On success it logs `🚀 Server running on port 4200` and `✅ Connected to MongoDB`.

**Terminal 2 — frontend:**

```bash
npm run dev
```
- Serves the app at **http://localhost:5173** (Vite default).

**Offline-first behavior:** the frontend works **without the backend running** — all 20 games and the adaptive engine run locally against IndexedDB. The backend adds two things on top: **cross-device sync** of progress, and the **teacher class-analytics** endpoint (`GET /api/teacher/class-mastery`) that powers the teacher dashboard's mastery heatmap, weakness alerts, and fair-rank table.

---

## 7. Testing

| Suite | Command | Notes |
|---|---|---|
| Frontend / engine (JS) | `npm test` | **88 pass + 2 skipped**. The 2 skipped are DKT model-gated (they only run when an exported DKT model is present). Runs under Vitest. |
| Backend | `npm --prefix server test` | **11 tests** using supertest against an in-memory MongoDB (`mongodb-memory-server`). |
| Python ML eval | `./venv/bin/pytest` | Tests the synthetic-data + evaluation harness in `scripts/`. |

**Linting caveat:** `npm run lint` is **red at baseline** — there are pre-existing lint errors unrelated to engine work. Do **not** treat a clean `npm run lint` as a gate. Instead, lint only the files you changed, e.g. `npx eslint src/path/to/changed-file.jsx`.

---

## 8. Seeding Test Data

```bash
node server/seed_students.js
```

Run from the repo root so the root `.env` (`MONGODB_URI`) is loaded. The seeder:

- Creates **1 teacher + 20 students** with varied, archetype-based mastery (advanced / average / struggling) across the 13 skills, with harder skills (division, fractions, decimals, algebra, coordinate geometry) deliberately kept lower so the teacher's **weakness alerts** fire.
- Is **idempotent** and **safe**: it deletes and recreates only accounts on the `@mathvillage.test` domain — it never touches real accounts.
- Writes all logins plus a per-student mastery summary to **`seed-students-credentials.md`** (repo root, **gitignored** — it contains passwords).

**Accounts created:**

- **Teacher:** `teacher@mathvillage.test` / `Teacher@123` — logging in as the teacher surfaces the class analytics (mastery heatmap, weakness alerts, fair-rank table, XP roster) for all 20 students.
- **Students:** `student01@mathvillage.test` … `student20@mathvillage.test`, all with password `Student@123`.

The generated credentials file also includes a step-by-step "how to verify the ML is working" guide and per-student `avg mastery` / `weakest skill` columns to cross-check the dashboard against.

---

## 9. ML Evaluation Harness

The Python harness in `scripts/` generates synthetic student trajectories and evaluates the engine (next-correct AUC, simulated A/B learning gains, and component ablations) — this is what backs the report's Methodology + Results chapters.

**Recreate the venv and install deps:**

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

**Generate synthetic trajectories** (BKT simulator):

```bash
./venv/bin/python -m scripts.simulate_students -n 2000 -o data/synthetic/trajectories.parquet
```

**Run the evaluation:**

```bash
./venv/bin/python -m scripts.evaluate --traj data/synthetic/trajectories.parquet
```

The evaluator prints: held-out next-correct **AUC** + Brier (§8.1), the simulated **A/B learning-gain %** of adaptive vs. fixed-difficulty (§8.2), and **component ablations** (without knowledge graph / without spaced repetition, §8.4). An optional external sanity check against ASSISTments-2009 is available via `--assistments PATH` (the dataset is gated and not bundled).

> `data/synthetic/` and `*.parquet` are gitignored.

---

## 10. DKT Training (Optional)

The DKT backend is optional and **not runnable in this environment** — the TensorFlow wheel does not install on Python 3.9/arm64 here. Train it off-device (Colab, or any TF-capable machine), then export to `public/models/dkt/`.

**Install the DKT deps (off-device):**

```bash
./venv/bin/pip install -r requirements-dkt.txt
```

**Train + export** (requires the synthetic dataset from [§9](#9-ml-evaluation-harness)):

```bash
python scripts/train_dkt.py \
  --data data/synthetic/trajectories.parquet \
  --out public/models/dkt \
  --auc-gate 0.85
```

The `--auc-gate 0.85` flag fails the export if held-out AUC falls below the spec §8.1 target. Dimensions are **locked at 13 skills** → one-hot input dim `26`, output dim `13`. See `scripts/dkt_README.md` for the full Colab recipe and the int8 quantization option.

**The BKT backend ships by default** — no DKT model is required to run the app. Once a model exists at `public/models/dkt/model.json`, select it with `VITE_MASTERY_BACKEND=dkt` (or the flag in `src/engine/backendConfig.js`). `initEngine()` then loads the model and DKT replaces BKT transparently.

---

## 11. Project Structure

```
major_project/
├── src/
│   ├── engine/          # The Adaptive Learning Engine (UI-free; import only engineAPI.js)
│   │   ├── knowledgeGraph.js     # 13-skill DAG + prereqs + game↔skill map
│   │   ├── masteryModel.js       # BKT backend (default)
│   │   ├── masteryModelDKT.js    # DKT backend (optional, TF.js LSTM)
│   │   ├── decisionLayer.js      # nextDifficulty, suggestNextSkill, SM-2, fairRanking
│   │   ├── engineAPI.js          # public singleton API
│   │   ├── backendConfig.js      # BKT/DKT backend selection
│   │   └── README.md             # engine usage + API
│   ├── pages/           # 20 game pages + Student/Teacher dashboards + Login/Profile
│   ├── components/      # MasteryHeatmap, WeaknessAlerts, FairRankTable, ReviewPrompts, etc.
│   ├── lib/             # db.js (IndexedDB), syncEngine.js, apiBase.js, sessionHydrate.js
│   ├── store/           # zustand stores (auth, player, sync)
│   └── hooks/, test/, assets/
├── server/              # Express API
│   ├── app.js           # createApp() — routes (auth, /api/sync, /api/teacher/class-mastery)
│   ├── models.js        # Mongoose User + Progress schemas (incl. masteryState, interactionLog)
│   ├── server.js        # entry point (connects Mongo, listens on PORT)
│   ├── seed_students.js # test-data seeder
│   └── test/            # supertest + in-memory Mongo tests
├── scripts/             # Python: synthetic data + evaluation harness + DKT trainer
│   ├── simulate_students.py, evaluate.py, train_dkt.py
│   └── eval/            # simulator, BKT baseline, metrics, knowledge graph
├── docs/superpowers/    # specs / plans / reviews (see Documentation Reading Order)
├── public/              # static assets (+ models/dkt/ once a DKT model is exported)
├── requirements.txt           # Python eval-harness deps (Python 3.9)
├── requirements-dkt.txt       # off-device DKT training deps (TensorFlow)
├── vite.config.js, package.json
└── .env                       # ROOT, gitignored — see Environment Setup
```

---

## 12. Documentation Reading Order

**Read the docs in this order** to understand the system before touching code:

**1. Design spec** — the why and the architecture:
- `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md`

**2. Implementation plans** (`docs/superpowers/plans/`) — read in this order:
1. `2026-05-22-adaptive-engine-core.md` — the engine module (knowledge graph, BKT, decision layer, API)
2. `2026-05-22-game-integration.md` — wiring the engine into the 20 games
3. `2026-05-22-student-dashboard.md` — suggested-next, review prompts, fair leaderboard
4. `2026-05-22-teacher-dashboard.md` — mastery heatmap, weakness alerts, fair-rank table
5. `2026-05-22-backend-mastery-sync.md` — Mongo schema, sync op, class-mastery endpoint
6. `2026-05-22-synthetic-data-and-evaluation.md` — Python simulator + evaluation harness
7. `2026-05-22-dkt-pipeline.md` — optional off-device DKT training + on-device backend

**3. Matching review docs** (`docs/superpowers/reviews/`) — read alongside each plan:
- `2026-05-22-adaptive-engine-core-review.md`
- `2026-05-22-game-integration-review.md`
- `2026-05-22-student-dashboard-review.md`
- `2026-05-22-teacher-dashboard-review.md`
- `2026-05-22-backend-mastery-sync-review.md`
- `2026-05-22-synthetic-data-and-evaluation-review.md`
- `2026-05-22-dkt-pipeline-review.md`

**4. Engine API** — the day-to-day usage reference:
- `src/engine/README.md`

---

## 13. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE: :5000` when starting the backend | macOS **AirPlay Receiver** squats on port 5000. | We use `PORT=4200` instead (see Environment Setup). Alternatively, disable AirPlay Receiver in **System Settings → General → AirDrop & Handoff**. |
| `querySrv ECONNREFUSED` on Mongo connect | Your network's only DNS server is an **IPv6 link-local address**, which Node cannot query for the SRV records an `mongodb+srv://` URI needs. | Add public DNS resolvers: **System Settings → Network → Wi-Fi → Details → DNS** → add `1.1.1.1` and `8.8.8.8`. Or set `dns.setServers(['1.1.1.1','8.8.8.8'])` near the top of `server/server.js`. |
| `MongoServerSelectionError` / `ETIMEDOUT :27017` | Atlas is rejecting your IP, or your network blocks outbound port 27017. | In Atlas → **Network Access**, add your current IP (or `0.0.0.0/0` for dev). If that doesn't help, your network is likely blocking 27017 — try a different network or phone hotspot. |
| `npm install` fails with `ERESOLVE` | Peer-dependency conflict (Vite 8 vs. vite-plugin-pwa). | Run the root install with `npm install --legacy-peer-deps`. |
| `npm run lint` shows errors | Pre-existing baseline lint errors. | Expected — don't gate on it. Lint only your changed files: `npx eslint <file>`. |
| 2 JS tests skipped under `npm test` | DKT model-gated tests; no exported DKT model present. | Expected. They run only after a DKT model exists at `public/models/dkt/`. |

---

*Math Village — offline-first gamified math learning with an adaptive, mastery-driven engine.*
