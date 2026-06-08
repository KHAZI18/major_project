import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BKT_PARAMS,
  createInitialBelief,
  updateBelief,
  getMastery,
} from './masteryModel';

describe('masteryModel (BKT)', () => {
  it('initialises every skill to the prior P(L0)', () => {
    const b = createInitialBelief();
    expect(getMastery(b, 'addition')).toBeCloseTo(DEFAULT_BKT_PARAMS.pL0, 5);
  });

  it('raises mastery after a correct answer', () => {
    const b = createInitialBelief();
    const b2 = updateBelief(b, 'addition', true);
    expect(getMastery(b2, 'addition')).toBeGreaterThan(getMastery(b, 'addition'));
    expect(getMastery(b2, 'addition')).toBeCloseTo(0.6, 2); // 0.2 -> ~0.600
  });

  it('lowers mastery after an incorrect answer', () => {
    const b = createInitialBelief();
    const b2 = updateBelief(b, 'addition', false);
    expect(getMastery(b2, 'addition')).toBeLessThan(getMastery(b, 'addition'));
    expect(getMastery(b2, 'addition')).toBeCloseTo(0.176, 2); // 0.2 -> ~0.176
  });

  it('crosses 0.85 after two consecutive correct answers and stays in [0,1]', () => {
    let b = createInitialBelief();
    b = updateBelief(b, 'addition', true);
    b = updateBelief(b, 'addition', true);
    const m = getMastery(b, 'addition');
    expect(m).toBeGreaterThan(0.85);
    expect(m).toBeLessThanOrEqual(1);
  });

  it('does not mutate the input belief (immutability)', () => {
    const b = createInitialBelief();
    updateBelief(b, 'addition', true);
    expect(getMastery(b, 'addition')).toBeCloseTo(DEFAULT_BKT_PARAMS.pL0, 5);
  });
});
