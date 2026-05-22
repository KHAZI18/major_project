import { create } from 'zustand';
import { API_BASE } from '../lib/apiBase';
import { usePlayerStore } from './usePlayerStore';

const STORAGE_KEY = 'mv_auth';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const saved = loadSaved();

export const useAuthStore = create((set, get) => ({
  isAuthenticated: !!saved,
  role: saved?.role || null,
  user: saved?.user || null,
  token: saved?.token || null,

  async googleAuth(role, credential) {
    try {
      const resp = await fetch(`${API_BASE}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, role }),
      });
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || 'Google login failed');
      }
      
      const data = await resp.json();
      const userRole = data.user.role || role; 
      const state = { isAuthenticated: true, role: userRole, user: data.user, token: data.token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const userId = data.user._id || data.user.id;
      usePlayerStore.getState().initForUser(userId);
      set(state);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async signup(role, userData) {
    try {
      const resp = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, role }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      
      const state = { isAuthenticated: true, role, user: data.user, token: data.token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const userId = data.user._id || data.user.id;
      usePlayerStore.getState().initForUser(userId);
      set(state);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async login(role, userData) {
    try {
      // If no password, treat as local-only for now or legacy
      if (!userData.password) {
        const user = { id: userData.id || `local_${Date.now()}`, ...userData };
        const state = { isAuthenticated: true, role, user, token: null };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        usePlayerStore.getState().initForUser(user.id);
        set(state);
        return { success: true };
      }

      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userData.email, password: userData.password }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      const state = { isAuthenticated: true, role, user: data.user, token: data.token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const userId = data.user._id || data.user.id;
      usePlayerStore.getState().initForUser(userId);
      set(state);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  logout() {
    localStorage.removeItem(STORAGE_KEY);
    usePlayerStore.getState().initForUser(null);
    set({ isAuthenticated: false, role: null, user: null, token: null });
  },

  async deleteAccount() {
    try {
      const state = get();
      if (!state.token) return { success: false };
      
      const resp = await fetch(`${API_BASE}/auth/account`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });
      
      if (!resp.ok) throw new Error('Failed to delete account');
      
      // Treat perfectly deleted account exactly as a logout on the frontend
      state.logout();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  updateUser(patch) {
    const updated = { ...get().user, ...patch };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ role: get().role, user: updated })
    );
    set({ user: updated });
  },
}));
