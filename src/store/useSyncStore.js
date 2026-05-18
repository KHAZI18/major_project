import { create } from 'zustand';
import { getAllSyncQueueItems } from '../lib/db';

export const useSyncStore = create((set, get) => ({
  status: navigator.onLine ? 'synced' : 'offline', // 'synced' | 'syncing' | 'offline' | 'error' | 'partial'
  queueCount: 0,
  lastSynced: localStorage.getItem('mv_last_synced') || null,

  setStatus(status) {
    if (status === 'synced') {
      const now = new Date().toISOString();
      localStorage.setItem('mv_last_synced', now);
      set({ status, lastSynced: now });
    } else {
      set({ status });
    }
  },

  async refreshQueueCount() {
    const items = await getAllSyncQueueItems();
    set({ queueCount: items.length });
  },

  initListeners() {
    window.addEventListener('online', () => set({ status: 'synced' }));
    window.addEventListener('offline', () => set({ status: 'offline' }));
  },
}));
