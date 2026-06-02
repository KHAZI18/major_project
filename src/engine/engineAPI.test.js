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
    const { perSkill, ranking } = classMastery([
      { id: 'A', name: 'Asha', attempts: 1, mastery: { addition: 1.0 } },
      { id: 'B', name: 'Bilal', attempts: 100, mastery: { addition: 0.8, subtraction: 0.8 } },
    ]);
    expect(perSkill.addition).toBeCloseTo(0.9, 5);
    expect(ranking[0].id).toBe('B');
  });
});
