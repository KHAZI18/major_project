import { describe, it, expect } from 'vitest';
import { practicedMastery, buildLocalClass, BKT_PRIOR } from './engineSource';

describe('engineSource', () => {
  it('keeps only skills that moved off the BKT prior', () => {
    const all = { counting: 0.9, addition: BKT_PRIOR, subtraction: 0.5 };
    expect(practicedMastery(all)).toEqual({ counting: 0.9, subtraction: 0.5 });
  });

  it('builds a single-student class for the offline fallback', () => {
    const cls = buildLocalClass({
      id: 'me',
      name: 'Asha',
      attempts: 7,
      allMastery: { counting: 0.9, addition: BKT_PRIOR },
    });
    expect(cls).toEqual([
      { id: 'me', name: 'Asha', attempts: 7, mastery: { counting: 0.9 } },
    ]);
  });

  it('falls back to default id/name when missing', () => {
    const cls = buildLocalClass({ attempts: 0, allMastery: {} });
    expect(cls[0].id).toBe('me');
    expect(cls[0].name).toBe('You');
    expect(cls[0].mastery).toEqual({});
  });
});
