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
