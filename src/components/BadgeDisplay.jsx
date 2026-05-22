import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';

export default function BadgeDisplay({ compact = false }) {
  const { badges, allBadgesMeta } = usePlayerStore();

  if (compact) {
    const unlocked = allBadgesMeta.filter((b) => badges.includes(b.id));
    if (unlocked.length === 0) {
      return <p className="text-slate-500 text-sm text-center py-2">No badges yet. Keep playing! 🎮</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {unlocked.map((b, i) => (
          <motion.div
            key={b.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.05, type: 'spring' }}
            title={b.desc}
            className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 rounded-full px-2.5 py-1 text-sm font-semibold cursor-default"
          >
            <span>{b.icon}</span>
            <span className="hidden sm:inline text-xs">{b.label}</span>
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🏅</span>
        <h3 className="font-display font-bold text-lg text-slate-800">Achievements</h3>
        <span className="ml-auto bg-primary/20 text-yellow-700 font-bold px-3 py-1 rounded-full text-xs">{badges.length}/{allBadgesMeta.length} unlocked</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {allBadgesMeta.map((badge, i) => {
          const isUnlocked = badges.includes(badge.id);
          return (
            <motion.div
              key={badge.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                isUnlocked
                  ? 'bg-orange-50 border-orange-200 text-orange-600'
                  : 'bg-slate-50 border-slate-200 text-slate-400 grayscale opacity-70'
              }`}
              title={badge.desc}
            >
              <span className="text-2xl">{badge.icon}</span>
              <span className="text-xs font-semibold leading-tight">{isUnlocked ? badge.label : '???'}</span>
              {isUnlocked && <span className="text-[10px] text-orange-500 font-medium">{badge.desc}</span>}
              {!isUnlocked && <div className="text-[10px] text-slate-400">🔒 Locked</div>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
