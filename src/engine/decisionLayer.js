// Layer 3: pure decision functions over a mastery map { [skillId]: P(known) }.
import { SKILL_IDS, getPrereqs, getLeverage, getGamesForSkill } from './knowledgeGraph';

export const MASTERY_CUTOFF = 0.75; // "mastered" threshold for unlocking (spec §6.2)
const DAY_MS = 86400000;

// §6.1 — target the Zone of Proximal Development.
// Semantics at the 0.75 boundary: a skill at exactly 0.75 counts as "mastered" for
// unlocking/prereqs/breadth (>= 0.75) but is still served at Medium difficulty; only
// strictly > 0.75 is served at Hard.
export function nextDifficulty(skillId, mastery) {
  const m = mastery[skillId] ?? 0;
  if (m < 0.4) return 'easy';
  if (m <= 0.75) return 'medium';
  return 'hard';
}

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

// §6.3 — SM-2 spaced repetition. interval is in days.
export function createReview(now = Date.now()) {
  return { ease: 2.5, interval: 1, lastReviewed: now, reps: 0 };
}

export function updateReview(prev, correct, now = Date.now()) {
  if (correct) {
    return {
      ease: Math.min(2.5, prev.ease + 0.1),
      interval: Math.round(prev.interval * prev.ease), // standard SM-2 rounding to whole days
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
