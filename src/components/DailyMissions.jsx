import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';

const MISSION_ICONS = ['🎯', '⚡', '🌟'];
const MISSION_COLORS = [
  { from: '#818cf8', to: '#c084fc', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.25)', track: 'rgba(129,140,248,0.15)' },
  { from: '#f97316', to: '#fbbf24', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.25)',  track: 'rgba(249,115,22,0.15)' },
  { from: '#22c55e', to: '#34d399', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)',   track: 'rgba(34,197,94,0.15)' },
];

export default function DailyMissions() {
  const { dailyMissions, completeMission } = usePlayerStore();
  if (!dailyMissions?.length) return null;

  const allDone = dailyMissions.every(m => m.completed);

  return (
    <div className="card-base overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-slate-50">
        <div className="flex items-center gap-3">
          <motion.span animate={{ rotate: [0,-10,10,0] }} transition={{ duration: 3, repeat: Infinity }} className="text-2xl">📋</motion.span>
          <h3 className="font-display font-black text-lg text-[#1e293b]">Daily Missions</h3>
        </div>
        {allDone && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }}
            className="text-[10px] font-black px-3 py-1 rounded-full bg-[#E8F9F8] text-[#5EDAD0] border border-[#5EDAD0]/20 uppercase tracking-widest">
            ✅ Completed
          </motion.div>
        )}
      </div>

      {/* Missions */}
      <div className="p-5 space-y-4">
        {dailyMissions.map((m, i) => {
          const c = MISSION_COLORS[i % 3];
          const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
          const icon = MISSION_ICONS[i % 3];

          return (
            <motion.div key={m.id || i}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-2xl p-4 relative overflow-hidden bg-[#F7F9FC] border border-slate-50"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-2xl shadow-sm">
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#1e293b] leading-tight mb-1">{m.text}</p>
                    <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">{m.progress}/{m.target} · 🪙 {m.reward.coins} coins</p>
                  </div>
                </div>
                {m.completed ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
                    className="text-xl shrink-0">✅</motion.div>
                ) : (
                  pct >= 100 ? (
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      onClick={() => completeMission(i)}
                      className="text-[10px] font-black px-4 py-2 rounded-xl shrink-0 bg-[#FFCA42] text-white shadow-md uppercase tracking-widest"
                    >
                      Claim
                    </motion.button>
                  ) : null
                )}
              </div>

              {/* Progress bar */}
              <div className="h-2.5 rounded-full overflow-hidden bg-white border border-slate-100 p-0.5">
                <motion.div className="h-full rounded-full"
                  style={{ background: c.from }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }} 
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
