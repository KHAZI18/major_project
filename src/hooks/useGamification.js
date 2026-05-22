import { useCallback } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';

// Thin compatibility shim — delegates to the central usePlayerStore so that
// all XP gains, mission checks, and badge unlocks share a single source of truth.
export function useGamification() {
  const { xp, level, gamesPlayed, history, addXP: storeAddXP } = usePlayerStore();

  // useCallback gives addXP a stable reference so games that put it in a
  // useEffect dependency array (e.g. MultiplicationMeteor) don't re-run
  // their effects on every render.
  const addXP = useCallback((amount, gameName, score, accuracy = 0, topic = null) => {
    storeAddXP(amount, gameName, score, accuracy, topic);
  // storeAddXP from Zustand is already a stable reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calculateLevel = (xp) => Math.floor(Math.sqrt(xp / 100)) + 1;
  const getXPForNextLevel = (lvl) => Math.pow(lvl, 2) * 100;

  return {
    progress: { xp, level, gamesPlayed, history },
    addXP,
    xpToNext: getXPForNextLevel(level) - xp,
    totalXpForNextLevel: getXPForNextLevel(level) - getXPForNextLevel(level - 1),
  };
}

