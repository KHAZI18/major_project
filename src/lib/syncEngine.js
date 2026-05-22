import {
  getAllSyncQueueItems,
  removeSyncQueueItem,
  incrementSyncRetry,
  flushPendingSyncWrites,
} from './db';

const MAX_RETRIES = 5;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let syncing = false;

// Recognised offline sync operations. Both currently POST their `payload`
// to /api/sync; the server merges fields additively (GAME_SESSION carries
// xp/coins/..., MASTERY_UPDATE carries masteryState/interactionLog).
export const SYNC_OP_TYPES = {
  GAME_SESSION: 'GAME_SESSION',
  MASTERY_UPDATE: 'MASTERY_UPDATE',
};

async function sendToAPI(operation) {
  const authData = JSON.parse(localStorage.getItem('mv_auth') || '{}');
  const token = authData.token;
  const currentUserId = authData.user?._id || authData.user?.id;

  if (!token) {
    console.log('[SyncEngine] No token found, skipping sync');
    return true; // Can't sync without auth
  }
  
  const operationUserId = operation.userId || operation.payload?.currentUserId;
  if (operationUserId && operationUserId !== currentUserId) {
     console.log('[SyncEngine] Operation user mismatch, dropping to prevent cross-contamination');
     return true;
  }

  // Both known op types POST their payload to /api/sync (server merges additively).
  if (
    operation.type !== SYNC_OP_TYPES.GAME_SESSION &&
    operation.type !== SYNC_OP_TYPES.MASTERY_UPDATE
  ) {
    console.warn('[SyncEngine] Unknown op type, skipping:', operation.type);
    return true; // drop unknown ops so they don't wedge the queue
  }

  try {
    console.log('[SyncEngine] POST to ' + API_BASE + '/sync');
    const res = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(operation.payload),
    });
    console.log('[SyncEngine] Response status: ' + res.status);
    return res.ok;
  } catch (e) {
    console.error('[SyncEngine] Fetch error:', e);
    return false;
  }
}

export async function processSyncQueue(onStatusUpdate) {
  if (syncing || !navigator.onLine) {
    console.log('[SyncEngine] Skip sync: syncing=' + syncing + ', online=' + navigator.onLine);
    return;
  }
  syncing = true;
  onStatusUpdate?.('syncing');

  try {
    await flushPendingSyncWrites();
    const items = await getAllSyncQueueItems();
    console.log('[SyncEngine] processSyncQueue: found ' + items.length + ' items to sync');
    let successCount = 0;

    for (const item of items) {
      if (item.retries >= MAX_RETRIES) {
        console.log('[SyncEngine] Max retries reached for item, removing');
        await removeSyncQueueItem(item.id);
        continue;
      }
      try {
        console.log('[SyncEngine] Sending item to API:', item);
        const ok = await sendToAPI(item);
        if (ok) {
          console.log('[SyncEngine] Item synced successfully');
          await removeSyncQueueItem(item.id);
          successCount++;
        } else {
          console.log('[SyncEngine] Item sync failed, retrying later');
          await incrementSyncRetry(item.id);
        }
      } catch (e) {
        console.error('[SyncEngine] Error during sync:', e);
        await incrementSyncRetry(item.id);
      }
    }

    const finalStatus = items.length === 0 || successCount === items.length ? 'synced' : 'partial';
    console.log('[SyncEngine] Sync complete: status=' + finalStatus + ', successCount=' + successCount + '/' + items.length);
    onStatusUpdate?.(finalStatus);
  } catch (err) {
    console.error('[SyncEngine] Error:', err);
    onStatusUpdate?.('error');
  } finally {
    syncing = false;
  }
}

export function initSyncEngine(onStatusUpdate) {
  // Sync when coming back online
  window.addEventListener('online', () => {
    console.log('[SyncEngine] Online detected, syncing...');
    processSyncQueue(onStatusUpdate);
  });

  // Sync when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('[SyncEngine] Tab visible, syncing...');
      processSyncQueue(onStatusUpdate);
    }
  });

  // Initial sync attempt on load
  if (navigator.onLine) {
    setTimeout(() => {
      console.log('[SyncEngine] Initial sync on load...');
      processSyncQueue(onStatusUpdate);
    }, 2000);
  }

  // Periodic sync check every 10 seconds if online (catches missed events)
  const syncInterval = setInterval(() => {
    if (navigator.onLine) {
      console.log('[SyncEngine] Periodic sync interval fired');
      processSyncQueue(onStatusUpdate).catch(() => {});
    }
  }, 10000);

  // Return cleanup function
  return () => clearInterval(syncInterval);
}
