import { create } from 'zustand';

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

  async signup(role, userData) {
    try {
      const resp = await fetch('http://localhost:5000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, role }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      
      const state = { isAuthenticated: true, role, user: data.user, token: data.token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
        set(state);
        return { success: true };
      }

      const resp = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userData.email, password: userData.password }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();

      const state = { isAuthenticated: true, role, user: data.user, token: data.token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      set(state);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  logout() {
    localStorage.removeItem(STORAGE_KEY);
    set({ isAuthenticated: false, role: null, user: null, token: null });
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
