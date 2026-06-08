// `motion` below is used as <motion.div> JSX; the repo's eslint config lacks
// react/jsx-uses-vars so it can't detect member-expression JSX usage.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getDueReviews } from '../engine/engineAPI';
import { getGamesForSkill } from '../engine/knowledgeGraph';
import { skillLabel } from '../engine/engineSource';

// engine game (component name) -> route path (subset of StudentDashboard paths).
const GAME_PATHS = {
  ArithmeticGame: '/games/arithmetic',
  MultiplicationMeteor: '/games/meteor',
  MultiplicationFarm: '/games/farm-multiply',
  FractionFrenzy: '/games/fractions',
  FractionNinja: '/games/fraction-ninja',
  EquationBalancer: '/games/balancer',
  AlgebraDungeon: '/games/algebra-dungeon',
  GeometryGame: '/games/geometry',
  CoordinateTreasure: '/games/coordinate-treasure',
  DecimalMall: '/games/decimal-mall',
  IntegerMountain: '/games/integer-mountain',
  PatternPuzzle: '/games/patterns',
  NumberCatcher: '/games/number-catcher',
  BalloonPopSequence: '/games/balloon-pop',
  MathRacing: '/games/math-racing',
};

function routeForSkill(skillId) {
  for (const game of getGamesForSkill(skillId)) {
    if (GAME_PATHS[game]) return GAME_PATHS[game];
  }
  return null;
}

export default function ReviewPrompts() {
  const due = getDueReviews();
  if (due.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center gap-1.5 border-b border-white/60 bg-gradient-to-r from-[#FFF9E6]/50 to-transparent">
        <span className="text-base drop-shadow-sm">🔁</span>
        <h3 className="font-display font-black text-sm text-[#1e293b]">Time to refresh!</h3>
      </div>
      <div className="p-2 space-y-1.5">
        {due.map((skillId) => {
          const path = routeForSkill(skillId);
          const label = skillLabel(skillId);
          const row = (
            <div className="flex items-center gap-2 rounded-lg p-2 bg-[#F7F9FC] hover:bg-white transition-all border border-transparent hover:border-slate-100 hover:shadow-sm">
              <span className="text-sm">🧠</span>
              <span className="flex-1 text-xs text-[#1e293b] truncate font-bold">{label}</span>
              {path && <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-white text-[#FFCA42] shadow-sm whitespace-nowrap">Refresh →</span>}
            </div>
          );
          return path
            ? <Link key={skillId} to={path} className="no-underline block">{row}</Link>
            : <div key={skillId}>{row}</div>;
        })}
      </div>
    </motion.div>
  );
}
