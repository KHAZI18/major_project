import {
  getAllSyncQueueItems,
  removeSyncQueueItem,
  incrementSyncRetry,
} from './db';

const MAX_RETRIES = 5;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let syncing = false;

async function sendToAPI(operation) {
  const authData = JSON.parse(localStorage.getItem('mv_auth') || '{}');
  const token = authData.token;

  if (!token) return true; // Can't sync without auth

  try {
    const res = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(operation.payload), // Backend expects the payload directly
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function processSyncQueue(onStatusUpdate) {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  onStatusUpdate?.('syncing');

  try {
    const items = await getAllSyncQueueItems();
    let successCount = 0;

    for (const item of items) {
      if (item.retries >= MAX_RETRIES) {
        await removeSyncQueueItem(item.id);
        continue;
      }
      try {
        const ok = await sendToAPI(item);
        if (ok) {
          await removeSyncQueueItem(item.id);
          successCount++;
        } else {
          await incrementSyncRetry(item.id);
        }
      } catch {
        await incrementSyncRetry(item.id);
      }
    }

    onStatusUpdate?.(items.length === 0 || successCount === items.length ? 'synced' : 'partial');
  } catch (err) {
    console.error('[SyncEngine] Error:', err);
    onStatusUpdate?.('error');
  } finally {
    syncing = false;
  }
}

export function initSyncEngine(onStatusUpdate) {
  window.addEventListener('online', () => {
    processSyncQueue(onStatusUpdate);
  });

  // Also try on page focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      processSyncQueue(onStatusUpdate);
    }
  });

  // Initial sync attempt on load
  if (navigator.onLine) {
    setTimeout(() => processSyncQueue(onStatusUpdate), 2000);
  }
}
