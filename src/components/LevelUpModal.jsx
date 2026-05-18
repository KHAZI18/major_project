import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';

export function useConfetti() {
  const fire = (opts = {}) => {
    confetti({
      particleCount: opts.particleCount || 120,
      spread: opts.spread || 80,
      origin: opts.origin || { x: 0.5, y: 0.55 },
      colors: opts.colors || ['#818cf8','#c084fc','#f472b6','#fbbf24','#34d399','#f97316'],
      ...opts,
    });
  };
  return { fire };
}

export function LevelUpModal() {
  const { leveledUp, level, recentlyUnlocked = [], clearLevelUp } = usePlayerStore();
  const { fire } = useConfetti();

  useEffect(() => {
    if (leveledUp) {
      fire({ particleCount: 200, spread: 100, origin: { x: 0.5, y: 0.4 } });
      setTimeout(() => fire({ particleCount: 80, angle: 60,  spread: 55, origin: { x: 0 } }), 400);
      setTimeout(() => fire({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } }), 600);
    }
  }, [leveledUp]);

  return (
    <AnimatePresence>
      {leveledUp && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={clearLevelUp}
        >
          <motion.div
            initial={{ scale: 0.3, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}
            className="bg-white rounded-[40px] p-10 max-w-sm w-full text-center relative overflow-hidden shadow-2xl border border-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient burst */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#FFCA42] via-[#FF7052] to-[#5EDAD0]" />

            <motion.div
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-8xl mb-6 relative z-10"
            >
              🥳
            </motion.div>

            <h2 className="font-display text-5xl font-black text-[#1e293b] mb-2 tracking-tight">Level Up!</h2>
            
            <div className="relative my-8">
              <motion.div 
                animate={{ scale: [1, 1.1, 1], rotate: [0, 180, 360] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-gradient-to-tr from-[#FFCA42] to-[#FF7052] rounded-full blur-2xl opacity-20"
              />
              <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-[#FFCA42] to-[#FF7052] flex items-center justify-center text-5xl font-black text-white mx-auto relative z-10 shadow-xl border-4 border-white">
                {level}
              </div>
            </div>

            <p className="text-[#64748b] text-xl font-medium mb-1">
              You reached <span className="font-black text-[#1e293b]">Level {level}!</span>
            </p>
            <p className="text-slate-400 font-bold mb-8">Keep exploring Math Village! 🏘️</p>

            {recentlyUnlocked.length > 0 && (
              <div className="mb-8">
                <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-[0.2em] font-black">New Badges</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {recentlyUnlocked.map((b) => (
                    <motion.div
                      key={b.id}
                      className="flex items-center gap-2 bg-[#F7F9FC] border border-slate-100 rounded-2xl px-4 py-2 text-sm font-black text-[#1e293b]"
                    >
                      <span>{b.icon}</span> {b.label}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={clearLevelUp} 
              className="w-full py-5 rounded-[24px] bg-[#5EDAD0] text-white font-display font-black text-xl shadow-lg hover:shadow-xl hover:bg-[#4bcbc1] transition-all cursor-pointer relative z-[10001]"
            >
              Awesome! Continue 🚀
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LevelUpModal;
