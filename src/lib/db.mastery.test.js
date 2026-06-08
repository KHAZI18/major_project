import { describe, it, expect } from 'vitest';
import {
  saveMasteryState,
  loadMasteryState,
  appendInteraction,
  getInteractionLog,
} from './db';

describe('db mastery persistence', () => {
  it('round-trips mastery state', async () => {
    const state = { belief: { addition: 0.6 }, attempts: { addition: 1 }, lastPracticed: {}, review: {} };
    await saveMasteryState(state);
    const loaded = await loadMasteryState();
    expect(loaded.belief.addition).toBeCloseTo(0.6, 5);
    expect(loaded.attempts.addition).toBe(1);
  });

  it('appends and reads interactions in chronological order', async () => {
    await appendInteraction({ skillId: 'addition', correct: true, responseTime: 1200, timestamp: 1 });
    await appendInteraction({ skillId: 'addition', correct: false, responseTime: 800, timestamp: 2 });
    const log = await getInteractionLog(50);
    const last = log[log.length - 1];
    expect(last.timestamp).toBe(2);
    expect(last.correct).toBe(false);
  });
});
