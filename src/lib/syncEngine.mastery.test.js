import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the db module so we control the queue contents without IndexedDB writes.
vi.mock('./db', () => ({
  getAllSyncQueueItems: vi.fn(),
  removeSyncQueueItem: vi.fn(async () => {}),
  incrementSyncRetry: vi.fn(async () => {}),
  flushPendingSyncWrites: vi.fn(async () => {}),
}));

import { getAllSyncQueueItems, removeSyncQueueItem } from './db';
import { processSyncQueue, SYNC_OP_TYPES } from './syncEngine';

// Minimal in-memory localStorage stand-in (node env has no Web Storage).
function makeLocalStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

describe('syncEngine MASTERY_UPDATE op', () => {
  beforeEach(() => {
    // stubGlobal overrides even read-only globals (e.g. navigator on Node >=21)
    // and is reverted by unstubAllGlobals in afterEach.
    vi.stubGlobal('localStorage', makeLocalStorage({
      mv_auth: JSON.stringify({ token: 'tkn' }),
    }));
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('declares both op types', () => {
    expect(SYNC_OP_TYPES.GAME_SESSION).toBe('GAME_SESSION');
    expect(SYNC_OP_TYPES.MASTERY_UPDATE).toBe('MASTERY_UPDATE');
  });

  it('POSTs a MASTERY_UPDATE payload to /api/sync and clears it on success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    // This payload mirrors the producer contract (engine-wiring plan):
    //   pushToSyncQueue({ type: 'MASTERY_UPDATE', payload: { masteryState, interactionLog } })
    getAllSyncQueueItems.mockResolvedValue([
      { id: 1, type: 'MASTERY_UPDATE', retries: 0,
        payload: {
          masteryState: { belief: { addition: 0.9 }, attempts: { addition: 5 } },
          interactionLog: [{ skillId: 'addition', correct: true, responseTime: 1, timestamp: 1 }],
        } },
    ]);

    await processSyncQueue();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/sync$/);
    // sendToAPI POSTs operation.payload verbatim -> body keys are masteryState/interactionLog,
    // exactly the keys the server's /api/sync SYNCABLE allow-list and Progress schema use.
    const body = JSON.parse(opts.body);
    expect(body.masteryState.belief.addition).toBe(0.9);
    expect(body.interactionLog[0].skillId).toBe('addition');
    expect(removeSyncQueueItem).toHaveBeenCalledWith(1);
  });

  it('drops an unknown op type without POSTing (and clears it from the queue)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    getAllSyncQueueItems.mockResolvedValue([
      { id: 7, type: 'BOGUS_OP', retries: 0, payload: {} },
    ]);

    await processSyncQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    // sendToAPI returns true for unknown ops, so the item is treated as handled and removed.
    expect(removeSyncQueueItem).toHaveBeenCalledWith(7);
  });
});
