import { create } from 'zustand';
import { saveProgress, loadProgress, pushToSyncQueue, saveGameSession, trackSyncWrite } from '../lib/db';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const calcLevel = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;
const xpForLevel = (lvl) => Math.pow(lvl, 2) * 100;

const ALL_BADGES = [
  { id: 'first_game',    label: 'First Step',     icon: '👣', desc: 'Play your first game',         condition: (s) => s.gamesPlayed >= 1 },
  { id: 'three_streak',  label: 'On Fire!',        icon: '🔥', desc: '3-day streak',                 condition: (s) => s.streak >= 3 },
  { id: 'seven_streak',  label: 'Week Warrior',    icon: '⚡', desc: '7-day streak',                 condition: (s) => s.streak >= 7 },
  { id: 'thirty_streak', label: 'Legend',          icon: '🏆', desc: '30-day streak',                condition: (s) => s.streak >= 30 },
  { id: 'xp_500',        label: 'Rising Star',     icon: '⭐', desc: 'Earn 500 XP',                  condition: (s) => s.xp >= 500 },
  { id: 'xp_1000',       label: 'Scholar',         icon: '📚', desc: 'Earn 1000 XP',                 condition: (s) => s.xp >= 1000 },
  { id: 'xp_5000',       label: 'Math Master',     icon: '🧙', desc: 'Earn 5000 XP',                 condition: (s) => s.xp >= 5000 },
  { id: 'ten_games',     label: 'Dedicated',       icon: '🎯', desc: 'Play 10 games',                condition: (s) => s.gamesPlayed >= 10 },
  { id: 'fifty_games',   label: 'Veteran',         icon: '🎖️', desc: 'Play 50 games',               condition: (s) => s.gamesPlayed >= 50 },
  { id: 'level_5',       label: 'Level 5 Hero',    icon: '🦸', desc: 'Reach Level 5',               condition: (s) => s.level >= 5 },
  { id: 'level_10',      label: 'Level 10 Hero',   icon: '🦅', desc: 'Reach Level 10',              condition: (s) => s.level >= 10 },
  { id: 'coins_100',     label: 'First Coins',     icon: '🪙', desc: 'Earn 100 coins',              condition: (s) => s.coins >= 100 },
  { id: 'coins_1000',    label: 'Village Merchant',icon: '💰', desc: 'Earn 1000 coins',             condition: (s) => s.coins >= 1000 },
];

const GAME_ID_TO_NAME = {
  'arithmetic': 'Number Ninja',
  'number-catcher': 'Number Catcher',
  'balloon-pop': 'Balloon Pop',
  'geometry': 'Shape Explorer',
  'meteor': 'Multiplication Meteor',
  'fractions': 'Fraction Frenzy',
  'farm-multiply': 'Multiplication Farm',
  'math-racing': 'Math Racing',
  'balancer': 'Equation Balancer',
  'decimal-mall': 'Decimal Mall',
  'fraction-ninja': 'Fraction Ninja',
  'patterns': 'Pattern Puzzle',
  'coordinate-treasure': 'Treasure Map',
  'integer-mountain': 'Integer Mountain',
  'algebra-dungeon': 'Algebra Dungeon'
};

const DAILY_MISSIONS_POOL = [
  { id: 'dm_play2',    text: 'Play 2 games today',        target: 2,  type: 'games',    reward: { xp: 50, coins: 20 } },
  { id: 'dm_play5',    text: 'Play 5 games today',        target: 5,  type: 'games',    reward: { xp: 120, coins: 50 } },
  { id: 'dm_earn100',  text: 'Earn 100 XP today',         target: 100,type: 'xp',       reward: { xp: 0, coins: 30 } },
  { id: 'dm_earn300',  text: 'Earn 300 XP today',         target: 300,type: 'xp',       reward: { xp: 0, coins: 80 } },
  { id: 'dm_score80',  text: 'Score 80%+ in any game',    target: 80, type: 'accuracy', reward: { xp: 75, coins: 40 } },
  { id: 'dm_combo',    text: 'Get a 5-combo in any game', target: 5,  type: 'combo',    reward: { xp: 100, coins: 60 } },
];

function pickDailyMissions() {
  const shuffled = [...DAILY_MISSIONS_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((m) => ({
    ...m,
    progress: 0,
    completed: false,
    rewardClaimed: false,
  }));
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isSameSupportAssignment(a, b) {
  if (!a?.gameId || !b?.gameId) return false;
  const aAssignedAt = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
  const bAssignedAt = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
  return a.gameId === b.gameId && aAssignedAt === bAssignedAt;
}

const DEFAULT_STATE = {
  currentUserId: null,
  xp: 0,
  level: 1,
  coins: 0,
  streak: 0,
  lastActiveDate: null,
  gamesPlayed: 0,
  totalAccuracy: 0,
  avatar: '🧒',
  badges: [],
  dailyMissions: pickDailyMissions(),
  dailyMissionsDate: getTodayKey(),
  history: [],
  assignedSupport: null,
  recentlyUnlocked: [], // badges unlocked this session
};

function loadLocal() {
  // Let hydrate take over for initial load based on auth state
  return DEFAULT_STATE;
}

export const usePlayerStore = create((set, get) => {
  const saved = loadLocal() || DEFAULT_STATE;

  // Refresh daily missions if date changed
  if (saved.dailyMissionsDate !== getTodayKey()) {
    saved.dailyMissions = pickDailyMissions();
    saved.dailyMissionsDate = getTodayKey();
  }

  return {
    ...saved,

    // ─── Initialize For User ──────────────────────────────────────────────
    async initForUser(userId) {
      if (!userId) {
        set({ ...DEFAULT_STATE, dailyMissions: pickDailyMissions(), currentUserId: null });
        return;
      }

      let userData = { ...DEFAULT_STATE, currentUserId: userId };

      // 1. Check local storage
      try {
        const raw = localStorage.getItem(`mv_player_${userId}`);
        if (raw) {
          userData = { ...userData, ...JSON.parse(raw) };
        }
      } catch (err) {}

      // 2. Check IndexedDB
      try {
        const dbData = await loadProgress(userId);
        if (dbData) {
          userData = { ...userData, ...dbData };
        }
      } catch (err) {}

      // Check server API if online
      if (navigator.onLine) {
        try {
          const authData = JSON.parse(localStorage.getItem('mv_auth') || '{}');
          if (authData.token) {
             const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/progress`, {
                headers: { Authorization: `Bearer ${authData.token}` }
             });
             if (res.ok) {
                const serveData = await res.json();
                if (serveData && Object.keys(serveData).length > 0) {
                   const serverXp = serveData.xp || 0;
                   if (serveData.assignedSupport && serveData.assignedSupport.gameId) {
                      // Keep a local completion only for the exact same assignment.
                      // A newer teacher assignment should show up even when it reuses the same game.
                      const localAlreadyCompleted =
                        userData.assignedSupport?.completed === true &&
                        isSameSupportAssignment(userData.assignedSupport, serveData.assignedSupport);
                      if (!localAlreadyCompleted) {
                         userData.assignedSupport = serveData.assignedSupport;
                      }
                   }
                   // Save local history before server merge (it may have gameName that server lacks)
                   const localHistory = Array.isArray(userData.history) ? [...userData.history] : [];
                   if (serverXp >= userData.xp) {
                       // Override local with server if server is ahead or equal
                       const cleanData = {};
                       for (const key in serveData) {
                          if (serveData[key] != null) cleanData[key] = serveData[key];
                       }
                       // Preserve locally-completed assignedSupport so it isn't
                       // overwritten by the server's stale completed:false copy
                       const localAssignedSupport = userData.assignedSupport;
                       userData = { ...userData, ...cleanData };
                       const localCompleted =
                         localAssignedSupport?.completed === true &&
                         isSameSupportAssignment(localAssignedSupport, userData.assignedSupport);
                       if (localCompleted && userData.assignedSupport) {
                          userData.assignedSupport = { ...userData.assignedSupport, completed: true };
                       }
                       // Restore gameName/gameId from local history that the server may have stripped
                       if (Array.isArray(userData.history) && localHistory.length > 0) {
                          // Build a lookup from local history by timestamp for matching
                          const localByTs = {};
                          localHistory.forEach(lh => {
                            const ts = lh.date || lh.timestamp;
                            if (ts) localByTs[String(ts)] = lh;
                          });
                          let enriched = false;
                          userData.history = userData.history.map((h, i) => {
                            if (h.gameName && h.gameId) return h; // already has full info
                            // Try to find matching local entry
                            const ts = h.date || h.timestamp;
                            const localMatch = (ts && localByTs[String(ts)]) || localHistory[i];
                            if (localMatch) {
                              const updates = {};
                              if (!h.gameName && localMatch.gameName) { updates.gameName = localMatch.gameName; enriched = true; }
                              if (!h.gameId && localMatch.gameId) { updates.gameId = localMatch.gameId; enriched = true; }
                              if (!h.date && localMatch.date) { updates.date = localMatch.date; enriched = true; }
                              if (Object.keys(updates).length > 0) return { ...h, ...updates };
                            }
                            // Fallback: resolve gameName from gameId via GAME_ID_TO_NAME
                            if (!h.gameName && h.gameId && GAME_ID_TO_NAME[h.gameId]) {
                              enriched = true;
                              return { ...h, gameName: GAME_ID_TO_NAME[h.gameId] };
                            }
                            return h;
                          });
                          // If we enriched any entries, re-sync to update the server
                          if (enriched) {
                            const toSync = { ...userData };
                            delete toSync.recentlyUnlocked;
                            trackSyncWrite(pushToSyncQueue({ type: 'PROGRESS_UPDATE', payload: toSync })).catch(() => {});
                          }
                       }
                   } else {
                      // Local is ahead of server (sync was delayed/missed before logout)
                      // Include server-assigned support only when local does not
                      // already know the assignment was completed.
                      const payload = { ...userData };
                      const localCompleted =
                        userData.assignedSupport?.completed === true &&
                        isSameSupportAssignment(userData.assignedSupport, serveData.assignedSupport);
                      if (serveData.assignedSupport && serveData.assignedSupport.gameId && !localCompleted) {
                         payload.assignedSupport = serveData.assignedSupport;
                      }
                      trackSyncWrite(pushToSyncQueue({ type: 'PROGRESS_UPDATE', payload })).catch(() => {});
                   }
                }
             }
          }
        } catch(e) {}
      }

      // Refresh daily missions date
      if (userData.dailyMissionsDate !== getTodayKey()) {
        userData.dailyMissions = pickDailyMissions();
        userData.dailyMissionsDate = getTodayKey();
      }

      set({ ...userData, currentUserId: userId });
    },

    // ─── Persist ──────────────────────────────────────────────────────────
    _persist(state) {
      console.log('[PlayerStore] _persist called:', state);
      if (!state.currentUserId) return;
      const toSave = { ...state };
      delete toSave.recentlyUnlocked;
      localStorage.setItem(`mv_player_${state.currentUserId}`, JSON.stringify(toSave));
      saveProgress(state.currentUserId, toSave).catch(() => {});

      // Push the full updated state to the sync queue for the backend
      console.log('[PlayerStore] Persisting to sync queue, xp=' + state.xp + ', history=' + (state.history ? state.history.length : 0) + ' items');
      trackSyncWrite(pushToSyncQueue({ type: 'PROGRESS_UPDATE', payload: toSave })).catch((e) => {
        console.error('[PlayerStore] Error pushing to sync queue:', e);
      });
    },

    // ─── Hydrate from IndexedDB / Server ───────────────────────────────────
    async hydrate() {
      // Triggered by App.jsx, will sync with the currently active user
      const authRaw = localStorage.getItem('mv_auth');
      if (authRaw) {
         try {
            const auth = JSON.parse(authRaw);
            const id = auth.user?._id || auth.user?.id;
            if (id) {
               await get().initForUser(id);
               return;
            }
         } catch(e) {}
      }
      set({ ...DEFAULT_STATE });
    },

    // ─── Avatar ───────────────────────────────────────────────────────────
    setAvatar(avatar) {
      set((s) => {
        const next = { ...s, avatar };
        get()._persist(next);
        return next;
      });
    },

    // ─── Add XP & Coins ───────────────────────────────────────────────────
    addXP(amount, gameName, score, accuracy = 0, topic = null) {
      console.log('[PlayerStore] addXP called:', { amount, gameName, score, accuracy, topic });
      set((s) => {
        let bonusXP = 0;
        let bonusCoins = 0;
        let updatedAssignedSupport = s.assignedSupport;

        if (s.assignedSupport && !s.assignedSupport.completed) {
          const expectedName = GAME_ID_TO_NAME[s.assignedSupport.gameId];
          // Strip parenthetical difficulty suffixes, e.g. "Number Ninja (easy)" -> "Number Ninja"
          const normalizedGameName = gameName.replace(/\s*\(.*?\)\s*$/, '').trim();
          const isMatch =
            s.assignedSupport.gameId === gameName ||
            s.assignedSupport.gameId === normalizedGameName ||
            (expectedName && expectedName.toLowerCase() === gameName.toLowerCase()) ||
            (expectedName && expectedName.toLowerCase() === normalizedGameName.toLowerCase());
          if (isMatch) {
            bonusXP = 100;
            bonusCoins = 50;
            updatedAssignedSupport = {
              ...s.assignedSupport,
              completed: true
            };
            console.log('[PlayerStore] Assigned support successfully completed! Crediting +' + bonusXP + ' XP, +' + bonusCoins + ' coins!');
          }
        }

        const totalAmount = amount + bonusXP;
        const newXP = s.xp + totalAmount;
        const newLevel = calcLevel(newXP);
        const leveledUp = newLevel > s.level;
        const coinsEarned = Math.floor(amount / 10) + bonusCoins;

        const sessionId = `${gameName}_${Date.now()}`;
        // Reverse-lookup gameId from gameName for server compatibility
        const normalizedName = gameName.replace(/\s*\(.*?\)\s*$/, '').trim();
        const gameId = Object.entries(GAME_ID_TO_NAME).find(
          ([, name]) => name.toLowerCase() === normalizedName.toLowerCase()
        )?.[0] || gameName;
        const session = {
          sessionId,
          gameId,
          gameName,
          topic,
          score,
          accuracy,
          xpEarned: amount,
          coinsEarned,
          date: new Date().toISOString(),
        };

        saveGameSession(session).catch(() => {});

        const newState = {
          ...s,
          xp: newXP,
          level: newLevel,
          coins: s.coins + coinsEarned,
          gamesPlayed: s.gamesPlayed + 1,
          totalAccuracy: accuracy > 0
            ? Math.round((s.totalAccuracy * s.gamesPlayed + accuracy) / (s.gamesPlayed + 1))
            : s.totalAccuracy,
          history: [session, ...s.history].slice(0, 50),
          assignedSupport: updatedAssignedSupport,
          leveledUp,
        };

        // Mission progress
        newState.dailyMissions = s.dailyMissions.map((m) => {
          if (m.completed) return m;
          let prog = m.progress;
          if (m.type === 'games') prog = Math.min(m.target, prog + 1);
          if (m.type === 'xp') prog = Math.min(m.target, prog + amount);
          if (m.type === 'accuracy' && accuracy >= m.target) prog = m.target;
          return { ...m, progress: prog, completed: prog >= m.target };
        });

        // Badge unlock check
        const newBadges = [...s.badges];
        const recentlyUnlocked = [];
        for (const badge of ALL_BADGES) {
          if (!newBadges.includes(badge.id) && badge.condition(newState)) {
            newBadges.push(badge.id);
            recentlyUnlocked.push(badge);
          }
        }
        newState.badges = newBadges;
        newState.recentlyUnlocked = recentlyUnlocked;

        get()._persist(newState);
        return newState;
      });
    },

    // ─── Streak ───────────────────────────────────────────────────────────
    checkStreak() {
      set((s) => {
        const today = getTodayKey();
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        let newStreak = s.streak;
        if (s.lastActiveDate === today) return s;
        if (s.lastActiveDate === yesterday) newStreak = s.streak + 1;
        else if (s.lastActiveDate !== today) newStreak = 1;

        const next = { ...s, streak: newStreak, lastActiveDate: today };
        get()._persist(next);
        return next;
      });
    },

    // ─── Claim Mission Reward ─────────────────────────────────────────────
    claimMissionReward(missionId) {
      set((s) => {
        const missions = s.dailyMissions.map((m) => {
          if (m.id !== missionId || !m.completed || m.rewardClaimed) return m;
          return { ...m, rewardClaimed: true };
        });
        const mission = s.dailyMissions.find((m) => m.id === missionId);
        if (!mission?.completed || mission.rewardClaimed) return { dailyMissions: missions };

        const next = {
          ...s,
          dailyMissions: missions,
          xp: s.xp + (mission.reward.xp || 0),
          coins: s.coins + (mission.reward.coins || 0),
        };
        get()._persist(next);
        return next;
      });
    },

    // ─── Clear Level Up ───────────────────────────────────────────────────
    clearLevelUp() {
      set({ leveledUp: false, recentlyUnlocked: [] });
    },

    // ─── Helpers (derived, not stored) ────────────────────────────────────
    get xpToNext() {
      const s = get();
      return xpForLevel(s.level) - s.xp;
    },
    get totalXpForLevel() {
      const s = get();
      return xpForLevel(s.level) - xpForLevel(s.level - 1);
    },
    get allBadgesMeta() {
      return ALL_BADGES;
    },
  };
});
