import { describe, it, expect } from 'vitest';
import {
  nextDifficulty,
  suggestNextSkill,
  createReview,
  updateReview,
  isDue,
  dueForReview,
  shrunkenMean,
  fairRanking,
  SHRINKAGE_KAPPA,
} from './decisionLayer';

describe('decisionLayer.nextDifficulty', () => {
  it('bins mastery into ZPD difficulty', () => {
    expect(nextDifficulty('addition', { addition: 0.2 })).toBe('easy');
    expect(nextDifficulty('addition', { addition: 0.4 })).toBe('medium');
    expect(nextDifficulty('addition', { addition: 0.75 })).toBe('medium'); // boundary: 0.75 = medium
    expect(nextDifficulty('addition', { addition: 0.9 })).toBe('hard');
  });

  it('treats an unseen skill as easy', () => {
    expect(nextDifficulty('addition', {})).toBe('easy');
  });
});

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

  it('leverage dominates even when the top candidate was practiced recently', () => {
    const now = Date.now();
    const result = suggestNextSkill({
      mastery: { counting: 0.8, addition: 0.8 },
      lastPracticed: { subtraction: now },
      now,
    });
    expect(result.skillId).toBe('subtraction');
  });

  it('returns null when no skill is unlocked-and-unmastered', () => {
    const allMastered = {};
    for (const id of ['counting','addition','subtraction','multiplication','division',
      'patterns','fractions-basic','equiv-fractions','decimals','integers',
      'geometry-shapes','coord-geometry','algebra-basics']) allMastered[id] = 0.99;
    expect(suggestNextSkill({ mastery: allMastered })).toBeNull();
  });
});

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

  it('detects due skills (strictly after the interval elapses)', () => {
    const now = 10 * DAY;
    expect(isDue({ ease: 2.5, interval: 1, lastReviewed: now - 2 * DAY, reps: 0 }, now)).toBe(true);
    expect(isDue({ ease: 2.5, interval: 5, lastReviewed: now - 2 * DAY, reps: 0 }, now)).toBe(false);
    // boundary: exactly at lastReviewed + interval is NOT yet due (strict >)
    expect(isDue({ ease: 2.5, interval: 1, lastReviewed: now - 1 * DAY, reps: 0 }, now)).toBe(false);
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
