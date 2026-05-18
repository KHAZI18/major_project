import { create } from 'zustand';
import { saveProgress, loadProgress, pushToSyncQueue, saveGameSession } from '../lib/db';

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

const DEFAULT_STATE = {
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
  recentlyUnlocked: [], // badges unlocked this session
};

function loadLocal() {
  try {
    const raw = localStorage.getItem('mv_player');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

    // ─── Persist ──────────────────────────────────────────────────────────
    _persist(state) {
      const toSave = { ...state };
      delete toSave.recentlyUnlocked;
      localStorage.setItem('mv_player', JSON.stringify(toSave));
      saveProgress(toSave).catch(() => {});
    },

    // ─── Hydrate from IndexedDB ────────────────────────────────────────────
    async hydrate() {
      const dbData = await loadProgress();
      if (dbData) {
        const refreshed = dbData.dailyMissionsDate !== getTodayKey()
          ? { ...dbData, dailyMissions: pickDailyMissions(), dailyMissionsDate: getTodayKey() }
          : dbData;
        set(refreshed);
      }
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
    addXP(amount, gameName, score, accuracy = 0) {
      set((s) => {
        const newXP = s.xp + amount;
        const newLevel = calcLevel(newXP);
        const leveledUp = newLevel > s.level;
        const coinsEarned = Math.floor(amount / 10);

        const sessionId = `${gameName}_${Date.now()}`;
        const session = {
          sessionId,
          gameName,
          score,
          accuracy,
          xpEarned: amount,
          coinsEarned,
          date: new Date().toISOString(),
        };

        saveGameSession(session).catch(() => {});
        pushToSyncQueue({ type: 'GAME_SESSION', payload: session }).catch(() => {});

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
