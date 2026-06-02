import { describe, it, expect, beforeEach } from 'vitest';
import { resetEngine, recordAttempt } from './engineAPI';
import { getAllSyncQueueItems, getDB } from '../lib/db';

// Clear the sync_queue between tests so the count assertion is exact.
async function clearSyncQueue() {
  const db = await getDB();
  await db.clear('sync_queue');
}

describe('engineAPI -> sync queue producer', () => {
  beforeEach(async () => {
    resetEngine();
    await clearSyncQueue();
  });

  it('enqueues exactly one MASTERY_UPDATE op per recordAttempt', async () => {
    await recordAttempt({ skillId: 'addition', correct: true });

    const items = await getAllSyncQueueItems();
    const mastery = items.filter((i) => i.type === 'MASTERY_UPDATE');
    expect(mastery).toHaveLength(1);
  });

  it('ships the saved mastery state (belief/attempts/...) under payload.masteryState', async () => {
    await recordAttempt({ skillId: 'addition', correct: true });

    const [op] = (await getAllSyncQueueItems()).filter((i) => i.type === 'MASTERY_UPDATE');
    expect(op.payload).toBeTruthy();
    expect(op.payload.masteryState).toBeTruthy();
    // Same shape the engine persists via saveMasteryState / loadMasteryState.
    expect(op.payload.masteryState).toHaveProperty('belief');
    expect(op.payload.masteryState).toHaveProperty('attempts');
    expect(op.payload.masteryState.attempts.addition).toBe(1);
  });

  it('enqueues one MASTERY_UPDATE per attempt (two attempts -> two ops)', async () => {
    await recordAttempt({ skillId: 'addition', correct: true });
    await recordAttempt({ skillId: 'addition', correct: false });

    const items = await getAllSyncQueueItems();
    expect(items.filter((i) => i.type === 'MASTERY_UPDATE')).toHaveLength(2);
  });
});
