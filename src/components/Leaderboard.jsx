import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';

const MOCK_LEADERBOARD = [
  { id: 'l1', name: 'Priya S.',   avatar: '👧', level: 12, xp: 14200, streak: 15, grade: 5 },
  { id: 'l2', name: 'Arjun K.',   avatar: '👦', level: 10, xp: 11800, streak: 7,  grade: 5 },
  { id: 'l3', name: 'Meena R.',   avatar: '👩', level: 9,  xp: 10500, streak: 22, grade: 4 },
  { id: 'l4', name: 'Vikram D.',  avatar: '🧑', level: 8,  xp: 9200,  streak: 4,  grade: 6 },
  { id: 'l5', name: 'Sunita B.',  avatar: '👧🏽', level: 7,  xp: 8100, streak: 11, grade: 4 },
  { id: 'l6', name: 'Rohan M.',   avatar: '🧒', level: 6,  xp: 7300,  streak: 3,  grade: 3 },
  { id: 'l7', name: 'Kavya T.',   avatar: '👧', level: 5,  xp: 6100,  streak: 8,  grade: 3 },
  { id: 'l8', name: 'Ravi P.',    avatar: '👨', level: 5,  xp: 5800,  streak: 2,  grade: 2 },
  { id: 'l9', name: 'Ananya G.',  avatar: '🧒🏽', level: 4, xp: 4900,  streak: 5,  grade: 2 },
  { id: 'l10', name: 'Dev L.',    avatar: '👦', level: 3,  xp: 3200,  streak: 1,  grade: 2 },
];

const RANK_STYLES = [
  'from-yellow-400 to-amber-500 text-black',
  'from-slate-300 to-slate-400 text-black',
  'from-amber-600 to-amber-700 text-white',
];

export default function Leaderboard({ compact = false }) {
  const { xp, level, streak, avatar } = usePlayerStore();
  const { user } = useAuthStore();

  const entries = [
    ...MOCK_LEADERBOARD,
    { id: 'me', name: user?.name || 'You', avatar, level, xp, streak, grade: user?.grade || 3, isMe: true },
  ]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, compact ? 5 : 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return (
    <div className={compact ? '' : 'glass-panel p-5'}>
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
                : 'bg-white/4 border-white/8'
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              entry.rank <= 3
                ? `bg-gradient-to-br ${RANK_STYLES[entry.rank - 1]}`
                : 'bg-white/10 text-slate-400'
            }`}>
              {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : entry.rank}
            </div>

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-lg shrink-0">
              {entry.avatar}
            </div>

            {/* Name + grade */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${entry.isMe ? 'text-primary' : 'text-slate-200'}`}>
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
