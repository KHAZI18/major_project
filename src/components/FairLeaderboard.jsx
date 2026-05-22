import { useMemo } from 'react';
// `motion` below is used as <motion.div> JSX; the repo's eslint config lacks
// react/jsx-uses-vars so it can't detect member-expression JSX usage.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { classMastery, getAllMastery } from '../engine/engineAPI';
import { buildLocalClass } from '../engine/engineSource';
import { useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';

const RANK_BADGE = ['🥇', '🥈', '🥉'];

// v1 is LOCAL-ONLY: it never calls /api/teacher/class-mastery (teacher-only, 403
// for students) or any class endpoint. When no `students` prop is injected it ranks
// a single-student class built from the on-device engine singleton.
//
// students prop: inject for tests / when a parent already has a class.
export default function FairLeaderboard({ students = null, compact = true }) {
  const { user } = useAuthStore();
  const { gamesPlayed } = usePlayerStore();
  const localId = user?.id || 'me';

  // Depend on PRIMITIVES (localId, user?.name, gamesPlayed) — never the `user`
  // object — so a store that returns a fresh object each render doesn't thrash.
  const cls = useMemo(() => {
    if (students) return students;
    return buildLocalClass({
      id: localId,
      name: user?.name || 'You',
      attempts: gamesPlayed || 0,
      allMastery: getAllMastery(), // practicedMastery() filter lives in buildLocalClass
    });
  }, [students, localId, user?.name, gamesPlayed]);

  // The local-only single-student view is, by definition, "offline" class data.
  const isOffline = !students;

  const ranking = cls && cls.length ? classMastery(cls).ranking : [];
  const rows = (compact ? ranking.slice(0, 5) : ranking).map((r, i) => ({ ...r, rank: i + 1 }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/60 bg-gradient-to-r from-[#FFFBF0]/30 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="text-base drop-shadow-sm">⚖️</span>
          <h3 className="font-display font-black text-sm text-[#1e293b]">Fair Ranking</h3>
        </div>
        <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-[#E8F9F8] text-[#5EDAD0] border border-[#5EDAD0]/20 uppercase tracking-wide">Mastery</span>
      </div>

      {isOffline && (
        <p className="px-3 py-1.5 text-[9px] font-bold text-[#94a3b8] bg-[#F7F9FC] border-b border-slate-50">
          Class data offline — showing your standing.
        </p>
      )}

      <div className="p-2 space-y-1.5">
        {rows.map((entry) => {
          const isMe = entry.id === localId;
          const pct = Math.round((entry.shrunkenMastery || 0) * 100);
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all ${
                isMe ? 'bg-[#FFF1ED] border-[#FF7052]/40' : 'bg-[#F7F9FC] border-transparent'
              }`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                entry.rank <= 3 ? 'bg-gradient-to-br from-[#FFCA42] to-[#FF7052] text-white' : 'bg-white text-[#94a3b8] border border-slate-100'
              }`}>
                {entry.rank <= 3 ? RANK_BADGE[entry.rank - 1] : entry.rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-black truncate ${isMe ? 'text-[#FF7052]' : 'text-[#1e293b]'}`}>
                  {entry.name} {isMe && <span className="text-[9px] text-[#FF7052]">(You)</span>}
                </p>
                <p className="text-[9px] text-[#94a3b8] font-bold">{entry.breadth} skills mastered</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-black text-[#5EDAD0]">{pct}%</p>
                <p className="text-[8px] text-[#94a3b8] font-bold">avg mastery</p>
              </div>
            </motion.div>
          );
        })}
        {rows.length === 0 && (
          <p className="p-2 text-center text-xs font-bold text-[#94a3b8]">No ranking data yet — play a game to get started!</p>
        )}
      </div>
    </motion.div>
  );
}
