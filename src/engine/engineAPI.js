// Public API — the only engine module the UI/backend imports (spec §3).
import { SKILL_IDS } from './knowledgeGraph';
import { activeBackend, ensureBackendReady } from './masteryBackend';
const { createInitialBelief, updateBelief, getMastery: bktMastery } = activeBackend;
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
  pushToSyncQueue,
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
  await ensureBackendReady();          // BKT: no-op | DKT: loads the tfjs model
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
  // Tell the offline sync queue that mastery changed so it ships to /api/sync.
  // Payload key `masteryState` and shape ({ belief, attempts, lastPracticed, review })
  // match the backend MASTERY_UPDATE handler (sibling backend-mastery-sync plan).
  await pushToSyncQueue({ type: 'MASTERY_UPDATE', payload: { masteryState: s } });
  return mastery;
}

// Teacher aggregate (spec §6.4 + §7 class-mastery).
// students: [{ id, name, attempts: <scalar>, mastery: { [skillId]: P } }] — see fairRanking contract.
export function classMastery(students) {
  const perSkill = {};
  for (const id of SKILL_IDS) {
    const vals = students.map((st) => st.mastery[id]).filter((v) => v != null);
    perSkill[id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  return { perSkill, ranking: fairRanking(students) };
}
