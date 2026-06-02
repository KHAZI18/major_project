import { useState, useEffect } from 'react';
// `motion` is used as <motion.div> JSX; the repo's eslint config lacks
// react/jsx-uses-vars so it can't detect member-expression JSX usage.
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { bootstrapFromServer } from '../lib/sessionHydrate';
import DailyMissions from '../components/DailyMissions';
import FairLeaderboard from '../components/FairLeaderboard';
import SuggestedForYou from '../components/SuggestedForYou';
import ReviewPrompts from '../components/ReviewPrompts';
import MasteryChart from '../components/MasteryChart';
import AdaptiveDifficulty from '../components/AdaptiveDifficulty';
import BadgeDisplay from '../components/BadgeDisplay';
import LevelUpModal from '../components/LevelUpModal';

const ALL_GAMES = [
  { id: 'arithmetic', name: 'Number Ninja', emoji: '🎯', xp: 50, path: '/games/arithmetic' },
  { id: 'number-catcher', name: 'Number Catcher', emoji: '🥥', xp: 40, path: '/games/number-catcher' },
  { id: 'balloon-pop', name: 'Balloon Pop', emoji: '🎈', xp: 45, path: '/games/balloon-pop' },
  { id: 'geometry', name: 'Shape Explorer', emoji: '📐', xp: 60, path: '/games/geometry' },
  { id: 'meteor', name: 'Multiplication Meteor', emoji: '☄️', xp: 75, path: '/games/meteor' },
  { id: 'fractions', name: 'Fraction Frenzy', emoji: '🍕', xp: 50, path: '/games/fractions' },
  { id: 'farm-multiply', name: 'Multiplication Farm', emoji: '🌻', xp: 65, path: '/games/farm-multiply' },
  { id: 'math-racing', name: 'Math Racing', emoji: '🐂', xp: 70, path: '/games/math-racing' },
  { id: 'balancer', name: 'Equation Balancer', emoji: '⚖️', xp: 75, path: '/games/balancer' },
  { id: 'decimal-mall', name: 'Decimal Mall', emoji: '🛒', xp: 80, path: '/games/decimal-mall' },
  { id: 'fraction-ninja', name: 'Fraction Ninja', emoji: '🥷', xp: 85, path: '/games/fraction-ninja' },
  { id: 'patterns', name: 'Pattern Puzzle', emoji: '🧩', xp: 80, path: '/games/patterns' },
  { id: 'coordinate-treasure', name: 'Treasure Map', emoji: '🗺️', xp: 90, path: '/games/coordinate-treasure' },
  { id: 'integer-mountain', name: 'Integer Mountain', emoji: '🏔️', xp: 100, path: '/games/integer-mountain' },
  { id: 'algebra-dungeon', name: 'Algebra Dungeon', emoji: '🗝️', xp: 110, path: '/games/algebra-dungeon' }
];

const GAMES_BY_ID = ALL_GAMES.reduce((acc, game) => {
  acc[game.id] = game;
  return acc;
}, {});

const buildGames = (ids, difficulty) => ids.map((id) => ({
  ...GAMES_BY_ID[id],
  difficulty
}));

const GRADE_ZONES = [
  {
    grade: 2, label: 'Grade 2', emoji: '🌾', title: 'Sunflower Farm',
    desc: 'Counting · Addition · Shapes',
    gradient: 'linear-gradient(135deg, #92400e 0%, #78350f 50%, #451a03 100%)',
    glow: '#f59e0b', accent: '#fbbf24', textColor: '#fde68a',
    scenery: '🌻🌻🌾🌾🚜',
    games: buildGames(['arithmetic', 'number-catcher', 'balloon-pop', 'geometry'], 1),
  },
  {
    grade: 3, label: 'Grade 3', emoji: '🏪', title: 'Village Market',
    desc: 'Multiplication · Fractions · Data',
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #9a3412 50%, #431407 100%)',
    glow: '#f97316', accent: '#fb923c', textColor: '#fed7aa',
    scenery: '🛒🏪🌶️🥭🍎',
    games: buildGames(['meteor', 'fractions', 'farm-multiply', 'math-racing'], 2),
  },
  {
    grade: 4, label: 'Grade 4', emoji: '🌊', title: 'River Crossing',
    desc: 'Decimals · Factors · Geometry',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #1e3a8a 100%)',
    glow: '#38bdf8', accent: '#7dd3fc', textColor: '#bae6fd',
    scenery: '🌊🐟🚤⛵🌴',
    games: buildGames(['decimal-mall', 'fraction-ninja', 'patterns'], 3),
  },
  {
    grade: 5, label: 'Grade 5', emoji: '🌲', title: 'Forest Camp',
    desc: 'Percentages · Coordinates · Patterns',
    gradient: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #052e16 100%)',
    glow: '#22c55e', accent: '#4ade80', textColor: '#bbf7d0',
    scenery: '🌲🦋⛺🔭🌿',
    games: buildGames(['coordinate-treasure', 'integer-mountain'], 3),
  },
  {
    grade: 6, label: 'Grade 6', emoji: '⛰️', title: 'Mountain Peak',
    desc: 'Integers · Algebra · Ratios',
    gradient: 'linear-gradient(135deg, #2e1065 0%, #4c1d95 50%, #1e1b4b 100%)',
    glow: '#a78bfa', accent: '#c4b5fd', textColor: '#ddd6fe',
    scenery: '🏔️⛰️🗻🦅❄️',
    games: buildGames(['algebra-dungeon'], 4),
  },
];

function DifficultyDots({ level }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4].map(i => (
        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i <= level ? '#fbbf24' : 'rgba(255,255,255,0.2)' }} />
      ))}
    </div>
  );
}

function ZoneCard({ zone, index }) {
  const isUnlocked = true; // Temporary: force unlock all zones for testing (normally userGrade >= zone.grade)
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 80 }}
      className={`relative overflow-hidden rounded-xl border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.05)] transition-all duration-300 mb-2 backdrop-blur-sm ${!isUnlocked ? 'grayscale opacity-60' : 'hover:shadow-[0_8px_20px_rgb(0,0,0,0.08)] hover:border-white'}`}
      style={{ background: 'rgba(255,255,255,0.92)' }}
    >
      <div className="p-2.5 sm:p-3 cursor-pointer" onClick={() => isUnlocked && setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3 sm:gap-5">
          <div className="flex items-start gap-3 sm:gap-5 flex-1 min-w-0">
            {/* Zone Icon */}
            <motion.div 
              whileHover={{ scale: 1.08, rotate: 5 }}
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-md flex-shrink-0"
              style={{ 
                background: zone.glow + '20',
                borderLeft: `4px solid ${zone.glow}`
              }}
            >
              {zone.emoji}
            </motion.div>
            
            {/* Zone Info */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-display font-black text-base sm:text-xl text-[#1e293b] leading-tight">{zone.title}</h3>
                {!isUnlocked && <span className="text-[10px] sm:text-xs font-black px-2 py-1 rounded-full bg-[#FEE2E2] text-[#DC2626]">🔒 LOCKED</span>}
              </div>
              <p className="text-xs sm:text-sm font-bold text-[#64748b] opacity-80">{zone.desc}</p>
            </div>
          </div>
          
          {/* Expand Toggle */}
          {isUnlocked && (
            <motion.div 
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-[#FFCA42]/10 to-[#FF7052]/10 text-[#FF7052] flex-shrink-0 font-black"
            >
              ▼
            </motion.div>
          )}
        </div>

      </div>

      <AnimatePresence>
        {isUnlocked && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="px-2.5 sm:px-3 pb-3 sm:pb-4 border-t border-white/60"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 mt-2 sm:mt-3">
              {zone.games.map((game) => (
                <Link key={game.id} to={game.path} className="no-underline">
                  <motion.div
                    whileHover={{ scale: 1.03, y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    className="group/game flex flex-col p-2 sm:p-3 rounded-lg bg-gradient-to-br from-white via-[#F9FAFB] to-[#F7F9FC] hover:from-[#FFFBF0] hover:to-[#F0F9FF] border-2 border-white/70 hover:border-white shadow-sm hover:shadow-[0_4px_12px_rgb(0,0,0,0.06)] transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <motion.div 
                        whileHover={{ scale: 1.1 }}
                        className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-sm shadow-sm flex-shrink-0 border border-white/50 group-hover/game:shadow-[0_2px_8px_rgba(255,202,66,0.2)]"
                      >
                        {game.emoji}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[#1e293b] text-xs leading-snug group-hover/game:text-[#FF7052] transition-colors">{game.name}</p>
                        <DifficultyDots level={game.difficulty} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-[#E8F9F8] to-[#F0FFFE] text-[#5EDAD0] border border-[#5EDAD0]/20 shadow-sm whitespace-nowrap">
                        +{game.xp} XP
                      </span>
                      <motion.span 
                        animate={{ x: [0, 3, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-xs text-[#FFCA42] font-black opacity-60 group-hover/game:opacity-100 transition-opacity"
                      >
                        →
                      </motion.span>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function StudentDashboard() {
  const { xp, level, coins, streak, avatar, badges, gamesPlayed, history = [], assignedSupport } = usePlayerStore();
  const { user, token, role } = useAuthStore();
  const userGrade = user?.grade || 2;

  // Web login: pull this student's saved progress from MongoDB and merge it into the
  // engine (balanced with the local IndexedDB cache via initEngine), then re-render so
  // the ML widgets below (Suggested-for-you, mastery chart, reviews) reflect it.
  const userId = user?._id || user?.id;
  const [, bumpHydrate] = useState(0);
  useEffect(() => {
    let alive = true;
    bootstrapFromServer(token, role, userId).then(() => { if (alive) bumpHydrate((n) => n + 1); });
    return () => { alive = false; };
  }, [token, role, userId]);

  const xpForLevel = (lvl) => Math.pow(lvl, 2) * 100;
  const xpForPrev  = (lvl) => Math.pow(Math.max(1, lvl - 1), 2) * 100;
  const currentXPInRange = xp - xpForPrev(level);
  const xpRange = xpForLevel(level) - xpForPrev(level);
  const progressPct = Math.max(0, Math.min(100, Math.round((currentXPInRange / xpRange) * 100))) || 0;
  const xpToNext = xpForLevel(level) - xp;

  return (
    <div className="pb-20 pt-2 md:pt-4 max-w-5xl mx-auto px-3 md:px-6 bg-[#F7F9FC]">
      <LevelUpModal />

      {/* ── NEW HERO BANNER (Professional Mobile Style) ── */}
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-4 overflow-hidden border border-white"
      >
        <div className="p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
          {/* Decorative background element for mobile */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FFCA42]/10 to-transparent rounded-bl-full pointer-events-none" />
          
          <div className="flex items-center gap-4 sm:gap-6 relative z-10">
            {/* Avatar Circle */}
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-xl sm:text-3xl relative shadow-lg bg-[#FFCA42] border-3 border-white shrink-0"
            >
              {avatar}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] sm:text-xs font-black text-white bg-[#FF7052] shadow-md">
                {level}
              </div>
            </motion.div>

            <div className="overflow-hidden">
              <p className="text-[#64748b] font-bold text-[11px] sm:text-sm mb-0 opacity-70 uppercase tracking-wider">Good Afternoon!</p>
              <h2 className="font-display font-black text-base sm:text-lg text-[#1e293b] leading-tight truncate">
                {user?.name || 'Explorer'} <span className="text-[#FF7052]">✨</span>
              </h2>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-black bg-[#E8F9F8] text-[#5EDAD0] border border-[#5EDAD0]/20 shadow-sm">
                  GRADE {userGrade}
                </span>
                {streak > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-black bg-[#FFF9E6] text-[#FFCA42] border border-[#FFCA42]/20 shadow-sm">
                    🔥 {streak} DAY STREAK
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* XP Progress Card */}
          <div className="bg-[#F7F9FC]/80 backdrop-blur-sm p-2.5 sm:p-3 rounded-lg md:w-64 border border-white/50 shadow-inner">
            <div className="flex justify-between items-end mb-1.5 gap-2">
              <span className="text-[9px] sm:text-xs font-black text-[#64748b] uppercase tracking-wide">Level {level}</span>
              <span className="text-[9px] sm:text-xs font-black text-[#FF7052]">{progressPct}%</span>
            </div>
            <div className="h-2 sm:h-2.5 w-full bg-white rounded-full overflow-hidden border border-slate-100 p-0.5">
              <motion.div 
                className="h-full rounded-full bg-gradient-to-r from-[#FFCA42] to-[#FF7052] relative"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 1.2, ease: "circOut" }}
              />
            </div>
            <p className="text-[7px] sm:text-[8px] text-center mt-1 font-black text-[#94a3b8] uppercase tracking-tight">
              {xpToNext} XP to next
            </p>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 border-t border-slate-50 bg-[#fbfcfe]/50">
          {[
            { label: 'Total XP', val: xp, icon: '⭐' },
            { label: 'Coins', val: coins, icon: '🪙' },
            { label: 'Badges', val: badges.length, icon: '🏅' }
          ].map((stat, idx) => (
            <div key={idx} className={`py-2 flex flex-col items-center justify-center ${idx < 2 ? 'border-r border-slate-50' : ''}`}>
              <span className="text-sm sm:text-base mb-0.5 drop-shadow-sm">{stat.icon}</span>
              <span className="text-xs sm:text-sm font-black text-[#1e293b]">{stat.val.toLocaleString()}</span>
              <span className="text-[7px] sm:text-[8px] font-black text-[#94a3b8] uppercase tracking-widest">{stat.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── MAIN LAYOUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mt-4 sm:mt-6">

        {/* LEFT: Village Map */}
        <div className="lg:col-span-2 space-y-2 sm:space-y-4">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1 sm:px-0 mb-1 sm:mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl drop-shadow-sm">🗺️</span>
              <div>
                <h2 className="font-display font-black text-base sm:text-lg text-[#1e293b] leading-tight">Continue Learning</h2>
                <p className="text-[11px] text-[#64748b] font-bold mt-0">Complete zones to unlock new challenges</p>
              </div>
            </div>
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="flex items-center gap-1.5 bg-gradient-to-r from-[#E8F9F8]/50 to-transparent px-2 py-1 rounded-full border border-[#5EDAD0]/20 w-fit">
              <div className="w-1.5 h-1.5 rounded-full bg-[#5EDAD0] animate-pulse" />
              <span className="text-[9px] text-[#5EDAD0] font-black uppercase tracking-wider whitespace-nowrap">{GRADE_ZONES.length}/5 unlocked</span>
            </motion.div>
          </motion.div>

          {/* Teacher Recommendation Card */}
          {assignedSupport && !assignedSupport.completed && (() => {
            const gameObj = ALL_GAMES.find(g => g.id === assignedSupport.gameId) || ALL_GAMES[0];
            return (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-5 rounded-[24px] bg-gradient-to-br from-[#1e293b] to-[#334155] border-2 border-amber-400 text-white shadow-[0_12px_24px_rgba(0,0,0,0.15)] relative overflow-hidden"
              >
                <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-amber-400/10 to-transparent pointer-events-none" />
                <div className="flex items-start gap-4">
                  <div className="text-3xl shrink-0 p-3 bg-white/10 rounded-2xl border border-white/10">
                    💡
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-[#1e293b] text-[10px] font-black uppercase tracking-wider mb-2.5">
                      Teacher Recommendation
                    </span>
                    <h3 className="text-lg font-black leading-tight mb-1">Practice Mission: {gameObj.name}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed font-bold">
                      Your teacher set up a custom practice path to help you master <span className="text-amber-400 font-extrabold">{assignedSupport.topic || 'Math Concepts'}</span>. Complete it to earn a huge reward!
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mt-4">
                      <Link 
                        to={gameObj.path}
                        className="px-5 py-2.5 bg-amber-400 text-[#1e293b] text-xs font-black rounded-xl hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
                      >
                        ⚡ Let's Play {gameObj.emoji}
                      </Link>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-white/10 rounded-lg text-[10px] font-black text-amber-300 uppercase tracking-widest">+100 XP</span>
                        <span className="px-2.5 py-1 bg-white/10 rounded-lg text-[10px] font-black text-amber-300 uppercase tracking-widest">+50 Coins</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()}

          {GRADE_ZONES.map((zone, i) => (
            <ZoneCard key={zone.grade} zone={zone} index={i} />
          ))}
        </div>

        {/* RIGHT: Sidebar */}
        <div className="space-y-3 sm:space-y-4">
          {/* 🧠 AI Suggestion (Adaptive Engine) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <SuggestedForYou />
          </motion.div>

          {/* 🔁 Spaced-repetition prompts (renders nothing when none are due) */}
          <ReviewPrompts />

          {/* Daily Missions */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <DailyMissions />
          </motion.div>

          {/* Fair-rank leaderboard (Adaptive Engine — replaces raw-XP widget) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <FairLeaderboard compact />
          </motion.div>

          {/* Per-skill mastery mini-chart (Adaptive Engine) */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <MasteryChart />
          </motion.div>

          {/* Adaptive difficulty meter — shows how the ML raised difficulty vs the old fixed games */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}>
            <AdaptiveDifficulty />
          </motion.div>

          {/* Badges */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
            className="bg-white rounded-xl border border-white/80 shadow-sm overflow-hidden"
          >
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-base">🏅</span>
                <h3 className="font-display font-black text-sm text-[#1e293b]">Achievements</h3>
              </div>
              <Link to="/student/profile" className="text-[9px] font-black no-underline px-2.5 py-1 rounded-lg bg-[#F7F9FC] text-[#FFCA42] hover:bg-[#FFCA42]/5 transition-colors">
                View All
              </Link>
            </div>
            <div className="p-2">
              <BadgeDisplay compact />
            </div>
          </motion.div>

          {/* Recent activity */}
          {Array.isArray(history) && history.length > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}
              className="bg-white rounded-xl border border-white/80 shadow-sm overflow-hidden"
            >
              <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2">
                <span className="text-base">📜</span>
                <h3 className="font-display font-black text-sm text-[#1e293b]">Recent Games</h3>
              </div>
              <div className="p-2 space-y-1.5">
                {history.slice(0, 5).map((h, i) => {
                  const resolvedName = h.gameName || (h.gameId && GAMES_BY_ID[h.gameId]?.name) || h.gameId || h.game || 'Game Session';
                  const resolvedEmoji = (h.gameId && GAMES_BY_ID[h.gameId]?.emoji) || '🎮';
                  return (
                    <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 rounded-lg p-2 bg-[#F7F9FC] hover:bg-white transition-all border border-transparent hover:border-slate-100 hover:shadow-sm">
                      <span className="text-sm">{resolvedEmoji}</span>
                      <span className="flex-1 text-xs text-[#1e293b] truncate font-bold">{resolvedName}</span>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-white text-[#5EDAD0] shadow-sm whitespace-nowrap">
                        +{(h.xpEarned != null ? h.xpEarned : h.xp) || 0}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
