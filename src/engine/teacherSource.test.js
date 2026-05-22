import { describe, it, expect } from 'vitest';
import {
  statusFromMastery,
  meanPracticedMastery,
  buildHeatmapMatrix,
  weakSkills,
  WEAKNESS_THRESHOLD,
} from './teacherSource';

describe('teacherSource', () => {
  it('maps mean mastery to a status bucket', () => {
    expect(statusFromMastery({ addition: 0.9, subtraction: 0.8 })).toBe('excellent');
    expect(statusFromMastery({ addition: 0.6, subtraction: 0.5 })).toBe('good');
    expect(statusFromMastery({ addition: 0.35 })).toBe('needs_review');
    expect(statusFromMastery({ addition: 0.1 })).toBe('at_risk');
    expect(statusFromMastery({})).toBe('at_risk'); // no signal
  });

  it('computes mean over practiced skills only', () => {
    expect(meanPracticedMastery({ a: 0.4, b: 0.6 })).toBeCloseTo(0.5, 5);
    expect(meanPracticedMastery({})).toBe(0);
  });

  it('builds a students x skills matrix in skill order', () => {
    const students = [
      { id: 'A', name: 'Asha', mastery: { addition: 0.9 } },
      { id: 'B', name: 'Bilal', mastery: { subtraction: 0.4 } },
    ];
    const m = buildHeatmapMatrix(students, ['addition', 'subtraction']);
    expect(m.skills).toEqual(['addition', 'subtraction']);
    expect(m.rows[0]).toMatchObject({ id: 'A', name: 'Asha', cells: [0.9, null] });
    expect(m.rows[1]).toMatchObject({ id: 'B', name: 'Bilal', cells: [null, 0.4] });
  });

  it('flags skills whose class-mean mastery is below the threshold', () => {
    expect(WEAKNESS_THRESHOLD).toBe(0.5);
    const perSkill = { addition: 0.8, fractions_basic: 0.3, decimals: 0.45 };
    const learnerCounts = { addition: 5, fractions_basic: 4, decimals: 2 };
    const weak = weakSkills(perSkill, learnerCounts);
    expect(weak.map((w) => w.skillId)).toEqual(['fractions_basic', 'decimals']); // sorted weakest-first
    expect(weak[0]).toMatchObject({ skillId: 'fractions_basic', mean: 0.3, learners: 4 });
  });

  it('ignores skills below minLearners', () => {
    const weak = weakSkills({ decimals: 0.2 }, { decimals: 1 }, 0.5, 2);
    expect(weak).toHaveLength(0);
  });
});
