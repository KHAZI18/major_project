import { describe, it, expect } from 'vitest';
import { MASTERY_BACKEND } from './backendConfig';
import { activeBackend, ensureBackendReady } from './masteryBackend';

describe('masteryBackend shim', () => {
  it('defaults to the BKT backend', () => {
    expect(MASTERY_BACKEND).toBe('bkt');
  });

  it('exposes the three-function contract', () => {
    expect(typeof activeBackend.createInitialBelief).toBe('function');
    expect(typeof activeBackend.updateBelief).toBe('function');
    expect(typeof activeBackend.getMastery).toBe('function');
  });

  it('ensureBackendReady resolves for the default (BKT no-op)', async () => {
    await expect(ensureBackendReady()).resolves.toBeUndefined();
  });

  it('the resolved backend behaves like BKT (rises after correct)', () => {
    const b0 = activeBackend.createInitialBelief();
    const b1 = activeBackend.updateBelief(b0, 'addition', true);
    expect(activeBackend.getMastery(b1, 'addition'))
      .toBeGreaterThan(activeBackend.getMastery(b0, 'addition'));
  });
});
