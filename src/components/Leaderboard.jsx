import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { useEffect, useState } from 'react';
import { API_BASE } from '../lib/apiBase';

const RANK_STYLES = [
  'from-yellow-400 to-amber-500 text-black',
  'from-slate-300 to-slate-400 text-black',
  'from-amber-600 to-amber-700 text-white',
];

export default function Leaderboard({ compact = false }) {
  const { xp, level, streak, avatar } = usePlayerStore();
  const { user } = useAuthStore();
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch(`${API_BASE}/leaderboard`);
        if (res.ok) {
          const data = await res.json();
          setLeaderboardData(data);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard', err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  const entries = [
    ...leaderboardData.filter(e => e.id !== user?._id && e.id !== user?.id),
    { id: 'me', name: user?.name || 'You', avatar, level, xp, streak, grade: user?.grade || 3, isMe: true },
  ]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, compact ? 5 : 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return (
    <div className={compact ? '' : 'card-base p-6'}>
      {!compact && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🏆</span>
          <h3 className="font-display font-bold text-lg">Village Leaderboard</h3>
        </div>
      )}

      <div className="space-y-2">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
              entry.isMe
                ? 'bg-primary/10 border-primary/40 shadow-primary-glow'
                : 'bg-white border-slate-100 shadow-sm'
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              entry.rank <= 3
                ? `bg-gradient-to-br ${RANK_STYLES[entry.rank - 1]}`
                : 'bg-slate-100 text-slate-500'
            }`}>
              {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : entry.rank}
            </div>

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-lg shrink-0">
              {entry.avatar}
            </div>

            {/* Name + grade */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${entry.isMe ? 'text-primary' : 'text-slate-800'}`}>
                {entry.name} {entry.isMe && <span className="text-xs text-primary">(You)</span>}
              </p>
              <p className="text-xs text-slate-500">Grade {entry.grade} • Lv.{entry.level}</p>
            </div>

            {/* XP + streak */}
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-primary">{entry.xp.toLocaleString()}</p>
              <p className="text-xs text-orange-400">🔥{entry.streak}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
