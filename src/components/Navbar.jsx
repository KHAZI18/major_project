import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { Link } from 'react-router-dom';
import SyncStatus from './SyncStatus';

export default function Navbar() {
  const { xp, level, coins, streak, avatar } = usePlayerStore();
  const { role, user, logout } = useAuthStore();

  const xpForLevel = (lvl) => Math.pow(lvl, 2) * 100;
  const xpForPrev  = (lvl) => Math.pow(Math.max(1, lvl - 1), 2) * 100;
  const progressPct = Math.min(100, Math.round(((xp - xpForPrev(level)) / (xpForLevel(level) - xpForPrev(level))) * 100)) || 0;

  if (!role) return null;

  return (
    <motion.nav initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}
      className="sticky top-0 z-50 mb-0 bg-white shadow-sm border-b border-slate-50"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link to={role === 'student' ? '/student' : '/teacher'} className="flex items-center gap-2 no-underline shrink-0">
          <motion.div 
            whileHover={{ rotate: 10 }}
            className="w-10 h-10 rounded-xl bg-[#FFF9E6] flex items-center justify-center text-2xl shadow-sm"
          >
            🏘️
          </motion.div>
          <span className="font-display font-black text-xl text-[#333333] hidden sm:block">
            Math Village
          </span>
        </Link>

        {/* HUD removed from navbar for cleaner look, now handled by Hero */}
        
        {/* Right: sync + logout */}
        <div className="flex items-center gap-4">
          <SyncStatus />
          <button onClick={logout} className="p-2.5 rounded-xl bg-[#F7F9FC] text-[#94a3b8] hover:bg-[#FF7052]/10 hover:text-[#FF7052] transition-all">
            <span className="text-xl">🚪</span>
          </button>
        </div>
      </div>
    </motion.nav>
  );
}
