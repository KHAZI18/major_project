// Web login: the server DB is the source of truth. On student login we pull the
// user's saved progress from MongoDB and seed the adaptive engine + player store;
// IndexedDB then serves as the offline cache (and the sync queue ships changes back).
import { API_BASE } from './apiBase';
import { initEngine, hydrateEngineFromServer, clearEngine } from '../engine/engineAPI';
import { usePlayerStore } from '../store/usePlayerStore';

const ENGINE_USER_KEY = 'mv_engine_user';
let _promise = null;
let _token = null;

// Idempotent per token: multiple callers (App + dashboard) share one fetch.
export function bootstrapFromServer(token, role, userId) {
  if (!token || role !== 'student') return Promise.resolve(false);
  if (_promise && _token === token) return _promise;
  _token = token;
  _promise = (async () => {
    try {
      await initEngine();           // load the local IndexedDB cache first, so the
                                    // server merge can balance against offline progress

      // If the cached local data belongs to a DIFFERENT user, discard it (don't merge
      // across users). Same user → keep it so un-synced offline progress balances in.
      const cachedUser = localStorage.getItem(ENGINE_USER_KEY);
      if (userId && cachedUser && cachedUser !== String(userId)) {
        await clearEngine();
        usePlayerStore.getState().resetLocal();
      }
      if (userId) localStorage.setItem(ENGINE_USER_KEY, String(userId));

      const res = await fetch(`${API_BASE}/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const progress = await res.json();
      if (!progress) return false;
      const loaded = await hydrateEngineFromServer(progress.masteryState);
      usePlayerStore.getState().hydrateFromServer(progress);
      return loaded;
    } catch {
      return false; // offline → keep the local IndexedDB cache
    }
  })();
  return _promise;
}

// Clear the cache so a different user logging in re-pulls their own data.
export function resetBootstrap() {
  _promise = null;
  _token = null;
}
