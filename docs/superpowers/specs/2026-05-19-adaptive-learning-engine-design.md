# Adaptive Learning Engine — Design Spec

**Project:** Gamified Learning Platform for Rural Education (Math Village)
**Module:** Adaptive Learning Engine (`src/engine/`)
**Authors:** Pranshu Agarwal, Riya Kumari, Nagashree NS, Mohammed Faizan K
**Guide:** Dr. Krishnaraj P.M, M S Ramaiah Institute of Technology
**Date:** 2026-05-19
**Status:** Design — awaiting team review before implementation

---

## 1. Executive Summary

Math Village currently delivers gamified math content with **uniform difficulty for every student**. Our own literature review (Chapter 2, §2.8.1) identifies this as the key unaddressed research gap:

> *"The lack of personalization and adaptive learning mechanisms is also a key research gap. Most existing platforms provide uniform content and difficulty levels for all students, without considering individual learning pace, strengths, or weaknesses."*

This document specifies an **Adaptive Learning Engine** that closes that gap. The engine is a self-contained on-device module that combines:

1. A hand-authored **Knowledge Graph** of math skills with prerequisite relationships
2. A **Deep Knowledge Tracing (DKT)** model that estimates per-skill mastery in real time
3. A **Decision Layer** that drives adaptive difficulty, spaced repetition, weakness alerts, and a fairer leaderboard

The engine runs entirely on-device (TensorFlow.js), preserves the project's offline-first / low-bandwidth USP, and ports cleanly to React Native for the future mobile build.

---

## 2. Goals and Non-Goals

### Goals
- Close the personalization gap stated in our literature review.
- Adapt problem difficulty in real time, per student, per skill.
- Surface per-skill weaknesses to teachers visually (heatmap + alerts).
- Replace grind-rewarding XP leaderboard with a fairer, mastery-aware ranking.
- Schedule spaced repetition of mastered skills to prevent forgetting.
- Run fully offline on low-end Android devices (< 30 ms inference, < 50 MB memory).
- Provide a defensible academic methodology + results chapter for the report.

### Non-Goals (v1)
- On-device model **training** (we ship a pre-trained model; future retraining is a roadmap item).
- Subject domains beyond mathematics.
- Multi-language NLP / word-problem generation.
- Real-time A/B testing in a live classroom (the 2-week sprint uses synthetic evaluation).
- A new game; we enhance the existing 20 games rather than building a 21st.

---

## 3. System Architecture

The engine is a separate module — pure JS/TS, no UI dependencies. Every game and dashboard talks to it through a thin public API.

```
                       ┌─────────────────────────────────────┐
                       │         src/engine/  (NEW)          │
                       │                                     │
   knowledgeGraph.js ──┤  Layer 1: KNOWLEDGE GRAPH           │
                       │  • skills[]                         │
                       │  • prereqs (DAG edges)              │
                       │                                     │
   masteryModel.js ────┤  Layer 2: MASTERY MODEL (DKT)       │
                       │  • TF.js LSTM, inference only       │
                       │                                     │
   decisionLayer.js ───┤  Layer 3: DECISION LAYER            │
                       │  ├ nextDifficulty(skill)            │
                       │  ├ suggestNextSkill(student)        │
                       │  ├ dueForReview()                   │
                       │  └ fairRanking(class)               │
                       │                                     │
   engineAPI.js ───────┤  Public API (only thing UI imports) │
                       │  recordAttempt / suggestNext /      │
                       │  getMastery / getDueReviews         │
                       └──────────────┬──────────────────────┘
                                      │
        ┌─────────────────────────────┼────────────────────────────┐
        ▼                             ▼                            ▼
 ┌────────────────┐         ┌──────────────────┐        ┌──────────────────┐
 │ 20 game pages  │         │ StudentDashboard │        │ TeacherDashboard │
 │ (read suggested│         │ ("AI says try X" │        │ (skill heatmap + │
 │ difficulty &   │         │  + spaced rep    │        │  weakness alerts │
 │ feed attempts) │         │  popups)         │        │  + fair rank)    │
 └────────────────┘         └──────────────────┘        └──────────────────┘
```

### Key architectural choices

1. **Engine is a separate module, not scattered into games.** Each game calls `engine.recordAttempt({ skillId, correct, responseTime })` and reads `engine.suggestDifficulty(skillId)`. Games can be migrated one-by-one; the engine ports cleanly to React Native (pure JS, no DOM).

2. **Inference on device, training off-device.** DKT is trained once in a Colab notebook (`notebooks/train_dkt.ipynb`), exported via `tfjs-converter`, and shipped as a ~1–3 MB static asset (`public/models/dkt_model.json`). The mobile app downloads it once on first launch. No on-device training, no GPU, no continuous model updates for v1.

3. **Per-student state is tiny.** Last 50 interactions + per-skill mastery vector + SM-2 schedule ≈ 5–10 KB per student. Plugs into existing IndexedDB + sync queue with no new infrastructure.

4. **No new server.** Existing Express + Mongo backend gets two new fields on `Progress` (`masteryState`, `interactionLog`) and one new sync op type (`MASTERY_UPDATE`). That is the entire backend change.

---

## 4. Knowledge Graph

A hand-authored DAG declared in `src/engine/knowledgeGraph.js`. Each node is a math skill; each edge is a prerequisite relationship.

### Skills (v1: 12 nodes)

| Skill ID | Description | Grade band |
|---|---|---|
| `counting` | Number recognition, ordering | 2 |
| `addition` | Single & multi-digit addition | 2-3 |
| `subtraction` | Single & multi-digit subtraction | 2-3 |
| `multiplication` | Times tables, multi-digit | 3-4 |
| `division` | Basic division, remainders | 4-5 |
| `patterns` | Sequences, AP/GP basics | 3-5 |
| `fractions-basic` | Identifying & comparing fractions | 4-5 |
| `equiv-fractions` | Equivalence, addition of fractions | 5-6 |
| `decimals` | Decimal operations | 5-6 |
| `integers` | Negative numbers | 5-6 |
| `geometry-shapes` | Shapes, angles, area, perimeter | 4-6 |
| `coord-geometry` | Coordinate plane, distance | 6+ |
| `algebra-basics` | Variables, simple equations | 6+ |

### Prerequisite DAG

```
counting ── addition ── subtraction ── multiplication ── division
                │              │              │             │
                └──────────────┴──────┐       ▼             ▼
                                      ▼   integers      fractions-basic ── equiv-fractions
                                  patterns                  │
                                      │                     ▼
                                      ▼                  decimals
                                  algebra-basics            │
                                      │                     ▼
                                      ▼                 coord-geometry
                                  (equations)
                                      │
                                      ▼
                                  geometry-shapes
```

### Game-to-skill mapping

Each of the 20 game pages will declare a `SKILLS` constant. Sample:

| Game | Skills exercised |
|---|---|
| `ArithmeticGame` | `addition`, `subtraction` |
| `MultiplicationMeteor` | `multiplication` |
| `MultiplicationFarm` | `multiplication` |
| `FractionFrenzy` | `fractions-basic` |
| `FractionNinja` | `fractions-basic`, `equiv-fractions` |
| `EquationBalancer` | `algebra-basics` |
| `AlgebraDungeon` | `algebra-basics` |
| `GeometryGame` | `geometry-shapes` |
| `CoordinateTreasure` | `coord-geometry` |
| `DecimalMall` | `decimals` |
| `IntegerMountain` | `integers` |
| `PatternPuzzle` | `patterns` |
| `NumberCatcher`, `BalloonPopSequence` | `counting`, `patterns` |
| `FruitRush`, `MathRacing` | `addition`, `multiplication` |

The graph drives two decisions: (a) recommending a *prerequisite* game when a student fails, and (b) deciding *what to teach next* once a skill is mastered.

---

## 5. The Mastery Model — Deep Knowledge Tracing (DKT)

### 5.1 Model specification

| Aspect | Choice | Rationale |
|---|---|---|
| Architecture | LSTM, 1 layer, 100 hidden units, sigmoid output of size `2 × num_skills` | Matches Piech et al. 2015 (DKT) baseline — most-cited model in the field |
| Input encoding | One-hot `(skill, correct)` pair, dim = `2 × 12 = 24` | Standard DKT input format |
| Output | `P(correct | skill_k)` for each of 12 skills, at every timestep — interpreted as per-skill mastery probability | Matches DKT paper |
| Sequence length | Last 50 interactions per student | Trade-off: longer = better signal, more memory. 50 fits in < 10 KB and covers ~10 game sessions. |
| Loss | Binary cross-entropy on the *next* interaction's correctness | Per Piech et al. 2015 |
| Regularization | Dropout 0.2 on LSTM hidden state | Standard |
| Training optimizer | Adam, lr=1e-3 | Standard |

### 5.2 Why DKT (vs. BKT, vs. SAKT/Transformer)

- **vs. Bayesian Knowledge Tracing:** DKT learns cross-skill correlations (a student strong in multiplication is more likely to learn division quickly). BKT treats each skill independently. Our knowledge graph encodes prerequisites, but DKT can discover *softer* statistical relationships. Stronger viva story.
- **vs. SAKT / Transformer-based KT:** SAKT outperforms DKT on large datasets but the gap is small (<2% AUC on ASSISTments-2009) and SAKT is heavier to deploy on-device. DKT is the better trade-off for low-end mobile.
- **vs. Attention-DKT / DKVMN:** Same trade-off — marginal gains, higher inference cost.

### 5.3 Training data: synthetic learners

Math Village is a brand-new platform — there is **no real student log data** yet. This is a classic *cold-start* problem in educational ML. Our approach:

1. Build a **generative BKT simulator** (`scripts/simulate_students.py`). Each synthetic student has:
   - A latent ability vector over the 12 skills (sampled from a Beta distribution)
   - Per-skill guess rate `~Beta(2, 8)` and slip rate `~Beta(2, 8)` (literature-typical values)
   - A learning rate per skill `~Beta(2, 5)`
   - Prerequisite constraints from the knowledge graph (a student cannot learn `fractions-basic` until `division` mastery > 0.5)
2. Generate **10,000 simulated students × ~80 interactions each** by walking the platform per a plausible policy (random game choice, weighted by current skill level).
3. Train DKT on the simulated trajectories.
4. Validate on a held-out 20% of synthetic students **and** on the public ASSISTments-2009 dataset as an external sanity check.

**Why this is defensible in viva:** Synthetic learner simulation is an accepted method in the ITS literature when no real-platform data exists. See Yudelson et al. 2013 ("Individualized Bayesian Knowledge Tracing Models") and Käser et al. 2014 ("Modeling Math Learning on an Open Online Platform"). Our report's own problem statement frames this as a cold-start scenario — the lack of real student data is a *feature* of the research problem, not a flaw in the method.

### 5.4 Deployment pipeline

```
   Colab notebook                Static asset                    Browser / React Native
   ──────────────────            ─────────────                   ──────────────────────
   1. Simulate students    →     dkt_model.json   (~1-3 MB)  →   tfjs / tfjs-react-native
   2. Train DKT in Keras         dkt_weights.bin                 loads once, infers in
   3. tfjs-converter             public/models/                  ~5-10 ms per attempt
```

---

## 6. Decision Layer

Four pure functions over the mastery vector + interaction history.

### 6.1 Adaptive difficulty — `nextDifficulty(skill, mastery)`

Target the Zone of Proximal Development (ZPD): pick the difficulty bin where `P(correct) ≈ 0.75`, i.e. challenging but achievable. Bin via mastery thresholds:

| Mastery `P(know skill)` | Difficulty bin |
|---|---|
| `< 0.40` | Easy |
| `0.40 – 0.75` | Medium |
| `> 0.75` | Hard |

Each game's problem generator already produces a problem given a difficulty integer; we just stop randomizing it.

**Theoretical basis:** Vygotsky's ZPD (1978); Csikszentmihalyi's flow theory (1990) — flow occurs when challenge matches skill.

### 6.2 Smart recommendation — `suggestNextSkill(student)`

Walks the knowledge graph and returns the highest-leverage next skill:

1. Filter to skills the student has not yet mastered (`P < 0.75`).
2. Filter to skills whose prerequisites are mastered.
3. Among these, prefer skills with the most downstream descendants (highest leverage).
4. Tie-break: skill not practiced in last 24 h (encourages variety).

Returns the recommended skill + the game(s) tagged with it.

### 6.3 Spaced repetition — `dueForReview(student)`

Once a skill hits mastery (`P > 0.85`), schedule reviews to prevent forgetting. We use the **SM-2 algorithm** (Wozniak 1990, the classic SuperMemo algorithm — same one Anki and Duolingo use, well-known and viva-defensible).

Each mastered skill carries `(ease, interval, lastReviewed)`. On the next attempt:
- If `correct`: `interval ← interval × ease`, `ease ← ease + 0.1` (capped at 2.5)
- If `incorrect`: `interval ← 1 day`, `ease ← max(1.3, ease − 0.2)`

`dueForReview()` returns the list of skills whose `lastReviewed + interval < now`. Surfaced to the student as a "Time to refresh!" prompt on the StudentDashboard.

**Alternative considered:** Half-life regression (Settles & Meeder 2016, used by Duolingo). More accurate but requires a second trained model. Deferred to v2.

### 6.4 Fair leaderboard — `fairRanking(students)`

The current leaderboard ranks by raw XP, which rewards time spent rather than mastery. The new ranking uses **Bayesian shrinkage** toward the class mean:

```
score(student) = skill_breadth × shrunken_mean_mastery

shrunken_mean_mastery = (n × observed_mean + κ × class_mean) / (n + κ)
```

where `n` = number of attempts, `κ` = pseudo-count (default 20) representing the prior strength. Students with few attempts are pulled toward the class mean; students with many attempts get a near-observed score. This prevents a brand-new top scorer from displacing established students on rank-1 attempt.

**Theoretical basis:** Efron & Morris 1977 ("Stein's Paradox in Statistics") — empirical Bayes shrinkage. Standard in sports-analytics ratings (Baseball Reference, FanGraphs).

---

## 7. Integration into the Existing App

### Files added

| File | Purpose |
|---|---|
| `src/engine/knowledgeGraph.js` | Skill nodes + prerequisite edges |
| `src/engine/masteryModel.js` | TF.js DKT wrapper, inference only |
| `src/engine/decisionLayer.js` | The 4 decision functions |
| `src/engine/engineAPI.js` | Public API (`recordAttempt`, `suggestNext`, `getMastery`, `getDueReviews`, `classMastery`) |
| `public/models/dkt_model.json` + `.bin` | Pre-trained DKT weights |
| `notebooks/train_dkt.ipynb` | Colab notebook for training |
| `scripts/simulate_students.py` | BKT-based synthetic student generator |
| `docs/superpowers/specs/2026-05-19-adaptive-learning-engine-design.md` | This document |

### Files modified

| File | Change |
|---|---|
| `src/lib/db.js` | Add `mastery_state` and `interaction_log` IndexedDB stores |
| `src/store/usePlayerStore.js` | In `addXP`, also call `engine.recordAttempt(...)` |
| `src/lib/syncEngine.js` | Add `MASTERY_UPDATE` op type |
| `server/models.js` | Add `masteryState: Object` + `interactionLog: [Object]` to `ProgressSchema` |
| `server/server.js` | Persist new fields in `/api/sync`; expose `/api/teacher/class-mastery` |
| Each `src/pages/*Game.jsx` (20 files) | (a) Export `SKILLS` constant; (b) replace random difficulty with `engine.nextDifficulty(skillId)`; (c) call `engine.recordAttempt(...)` after each in-game answer (not just on game completion) |
| `src/pages/StudentDashboard.jsx` | Add "🧠 Suggested for you" card; add "Time to refresh!" review prompts; replace current XP leaderboard widget with fair-rank widget |
| `src/pages/TeacherDashboard.jsx` | Replace hardcoded `xp > 5000` thresholds with `engine.classMastery()` heatmap; add per-skill weakness alerts; show fair-rank table next to old XP table |

**Critical:** zero changes to game *content* or *visual design*. Only the difficulty knob and answer-recording call change. Visual + UX work from the recent dashboard redesign remains untouched.

---

## 8. Evaluation Plan

Four evaluation dimensions for the Methodology + Results chapters:

### 8.1 Model accuracy (offline)

| Metric | Dataset | Expected |
|---|---|---|
| AUC (next-correct prediction) | 20% held-out synthetic students | ≥ 0.85 |
| AUC | ASSISTments-2009 test set (external sanity check) | ≥ 0.80 (per Piech et al.) |
| Per-skill calibration | Synthetic test set | Brier score < 0.20 per skill |

### 8.2 Learning gains (simulated A/B)

Run 1,000 simulated learners through two platforms in parallel:
- **Control:** fixed-difficulty (current Math Village)
- **Treatment:** adaptive (proposed engine)

Measure: simulated post-test score after 50 problems. Expected: **25–40% relative improvement** for the treatment arm (consistent with classical ITS literature; Corbett & Anderson 1995, Koedinger & Aleven 2007).

### 8.3 System performance

| Metric | Target | Device |
|---|---|---|
| Inference latency per attempt | < 30 ms | Mid-range Android (e.g., Redmi Note 8) in mobile Chrome |
| Model load time | < 2 s | Same |
| Memory footprint | < 50 MB | Same |
| Cold start | < 3 s additional vs. current app | Same |

### 8.4 Component ablation (defensibility)

Two ablations on synthetic A/B:
1. **Without knowledge graph** (random skill selection instead of `suggestNextSkill`)
2. **Without spaced repetition** (no review schedule)

Each ablation should hurt the learning-gain metric, demonstrating that each component contributes.

---

## 9. 2-Week Sprint Plan

Team of 4 working in parallel.

| Days | Person 1 (ML lead) | Person 2 (Frontend) | Person 3 (Backend + KG) | Person 4 (Eval + Docs) |
|---|---|---|---|---|
| **1–2** | Build BKT simulator → 10k synthetic students | Scaffold `src/engine/` module + API | Author 12-skill knowledge graph + tag 20 games | Set up evaluation harness; download ASSISTments-2009 |
| **3–5** | Train DKT in Colab → export to TF.js | Wire `engine.recordAttempt` into all 20 games | Add Mongo schema fields + new sync op | Run ASSISTments baseline; reproduce Piech et al. AUC |
| **6–8** | Tune model + finalize export | Adaptive difficulty + SM-2 popups in StudentDashboard | Implement `/api/teacher/class-mastery` endpoint | Run simulated A/B; collect learning-gain metrics |
| **9–11** | Mobile-browser inference perf testing | Teacher heatmap + weakness alerts | Integration testing | Write Methodology + Results report chapters |
| **12–14** | Buffer / polish | Buffer / polish | Buffer / polish | Polish report + prepare demo script |

**Critical path:** DKT model training (days 3–5) blocks frontend integration of adaptive difficulty (days 6–8). Person 2 should mock the model output for days 3–5 to unblock UI work.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DKT under-trains on synthetic data | Medium | High | (a) Generate more synthetic students (20k if needed). (b) Have BKT as drop-in fallback — same engine API, swap the model file. |
| TF.js inference too slow on low-end Android | Low | High | DKT is a small LSTM; if needed, quantize to int8 (`tfjs-converter --quantization_bytes=1`). Worst case, swap to BKT (4 params/skill, runs in 1ms). |
| Team can't finish all 20 game integrations in 2 weeks | Medium | Medium | Integrate the top 8 games first (the most-played ones). Remaining 12 can keep random difficulty in v1 and be migrated in v2. |
| Examiner challenges "synthetic data isn't real evaluation" | Medium | Medium | Cite Yudelson et al. 2013, Käser et al. 2014. Frame as cold-start; commit to a live trial as future work. The ASSISTments external check strengthens this defense. |
| Mobile port (React Native) reveals platform incompatibility in TF.js | Low | Medium | Engine is pure JS aside from the model file; `tfjs-react-native` supports the same model format. Validate with a "hello world" inference on RN early. |

---

## 11. Future Work (out of scope for v1)

- On-device fine-tuning of DKT on real student logs (federated-style updates).
- Replace SM-2 with half-life regression spaced-rep model (Settles & Meeder 2016).
- Extend knowledge graph to other subjects (science, language).
- Add a transformer-based KT model (SAKT) and compare.
- Live classroom A/B trial with real students (for a journal publication).
- Multi-language word-problem generation via a small on-device LLM.
- Teacher-side "explainability" — show which interactions drove a mastery estimate.

---

## 12. References

### Knowledge Tracing
1. Piech, C., Bassen, J., Huang, J., Ganguli, S., Sahami, M., Guibas, L. J., & Sohl-Dickstein, J. (2015). *Deep Knowledge Tracing*. NeurIPS 2015. [arXiv:1506.05908]
2. Corbett, A. T., & Anderson, J. R. (1995). *Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge*. User Modeling and User-Adapted Interaction, 4(4), 253–278.
3. Yudelson, M. V., Koedinger, K. R., & Gordon, G. J. (2013). *Individualized Bayesian Knowledge Tracing Models*. AIED 2013, LNCS 7926, 171–180.
4. Käser, T., Klingler, S., Schwing, A. G., & Gross, M. (2014). *Beyond Knowledge Tracing: Modeling Skill Topologies with Bayesian Networks*. Intelligent Tutoring Systems 2014.
5. Pandey, S., & Karypis, G. (2019). *A Self-Attentive Model for Knowledge Tracing (SAKT)*. EDM 2019. [arXiv:1907.06837]
6. Zhang, J., Shi, X., King, I., & Yeung, D.-Y. (2017). *Dynamic Key-Value Memory Networks for Knowledge Tracing (DKVMN)*. WWW 2017.

### Spaced Repetition
7. Wozniak, P. A. (1990). *Optimization of Learning: A New Approach and Computer Application*. SuperMemo. (The SM-2 algorithm.)
8. Settles, B., & Meeder, B. (2016). *A Trainable Spaced Repetition Model for Language Learning*. ACL 2016 (Duolingo's half-life regression).
9. Ebbinghaus, H. (1885). *Memory: A Contribution to Experimental Psychology*. (Forgetting curve — the original.)

### Adaptive / Personalized Learning & ITS
10. Koedinger, K. R., & Aleven, V. (2007). *Exploring the Assistance Dilemma in Experiments with Cognitive Tutors*. Educational Psychology Review, 19(3), 239–264.
11. Anderson, J. R., Corbett, A. T., Koedinger, K. R., & Pelletier, R. (1995). *Cognitive Tutors: Lessons Learned*. Journal of the Learning Sciences, 4(2), 167–207.
12. Vanlehn, K. (2011). *The Relative Effectiveness of Human Tutoring, Intelligent Tutoring Systems, and Other Tutoring Systems*. Educational Psychologist, 46(4), 197–221.

### Learning Theory
13. Vygotsky, L. S. (1978). *Mind in Society: The Development of Higher Psychological Processes*. (Zone of Proximal Development.)
14. Csikszentmihalyi, M. (1990). *Flow: The Psychology of Optimal Experience*. Harper & Row.

### Statistics / Ranking
15. Efron, B., & Morris, C. (1977). *Stein's Paradox in Statistics*. Scientific American, 236(5), 119–127. (Empirical Bayes shrinkage.)

### Datasets
16. Feng, M., Heffernan, N. T., & Koedinger, K. R. (2009). *Addressing the assessment challenge in an Online System that tutors as it assesses*. UMUAI. (ASSISTments-2009 dataset.)

### Already cited in our report (Chapter 2)
17. Pechenkina, E., Laurence, D., Oates, G., Eldridge, D., & Hunter, D. (2017). *Using a gamified mobile app to increase student engagement, retention and academic achievement*. IJETHE 14(31).
18. Nah, F. F.-H., Zeng, Q., Telaprolu, V., Ayyappa, B., & Eschenbrenner, M. (2020). *Gamification of Education: A Review of Literature*. Computers in Human Behavior.
19. Prieto, L. P. (2019). *Teacher Dashboards for Learning Analytics: A Review of Design Principles*. British Journal of Educational Technology.

---

## 13. Open Questions for Team Review

1. **Skill count:** Is 12 skills the right granularity, or should we split further (e.g., separate `multiplication-tables` and `multiplication-multidigit`)? Trade-off: more skills = finer-grained mastery but more data needed per skill.
2. **Game-skill mapping:** Do we trust ourselves to tag the 20 games, or should we get our guide Dr. Krishnaraj to review the tagging?
3. **Knowledge graph:** Should we publish the graph + game tags as a data file for future researchers, or keep it embedded in code?
4. **Demo emphasis:** For the final demo to the Dean, do we lead with the *student* experience (live adaptive difficulty), the *teacher* experience (skill heatmap), or both side-by-side?
5. **Fallback:** If DKT under-trains in week 1, do we proactively swap to BKT for the demo (with DKT as "future work"), or push through?

---

*End of design spec.*
