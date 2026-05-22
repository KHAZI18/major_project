// `motion` below is used as <motion.div> JSX; the repo's eslint config lacks
// react/jsx-uses-vars so it can't detect member-expression JSX usage.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { suggestNext } from '../engine/engineAPI';
import { skillLabel } from '../engine/engineSource';

// engine game (component name) -> { path, name } from StudentDashboard GRADE_ZONES.
const GAME_ROUTES = {
  ArithmeticGame:       { path: '/games/arithmetic',          name: 'Number Ninja' },
  MultiplicationMeteor: { path: '/games/meteor',              name: 'Multiplication Meteor' },
  MultiplicationFarm:   { path: '/games/farm-multiply',       name: 'Multiplication Farm' },
  FractionFrenzy:       { path: '/games/fractions',           name: 'Fraction Frenzy' },
  FractionNinja:        { path: '/games/fraction-ninja',      name: 'Fraction Ninja' },
  EquationBalancer:     { path: '/games/balancer',            name: 'Equation Balancer' },
  AlgebraDungeon:       { path: '/games/algebra-dungeon',     name: 'Algebra Dungeon' },
  GeometryGame:         { path: '/games/geometry',            name: 'Shape Explorer' },
  CoordinateTreasure:   { path: '/games/coordinate-treasure', name: 'Treasure Map' },
  DecimalMall:          { path: '/games/decimal-mall',        name: 'Decimal Mall' },
  IntegerMountain:      { path: '/games/integer-mountain',    name: 'Integer Mountain' },
  PatternPuzzle:        { path: '/games/patterns',            name: 'Pattern Puzzle' },
  NumberCatcher:        { path: '/games/number-catcher',      name: 'Number Catcher' },
  BalloonPopSequence:   { path: '/games/balloon-pop',         name: 'Balloon Pop' },
  MathRacing:           { path: '/games/math-racing',         name: 'Math Racing' },
};

export default function SuggestedForYou() {
  const suggestion = suggestNext();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center gap-1.5 border-b border-white/60 bg-gradient-to-r from-[#F0F9FF]/40 to-transparent">
        <span className="text-base drop-shadow-sm">🧠</span>
        <h3 className="font-display font-black text-sm text-[#1e293b]">Suggested for you</h3>
      </div>

      {!suggestion ? (
        <div className="p-3 text-center">
          <p className="text-xs font-bold text-[#64748b]">🎉 You're all caught up! Every unlocked skill is mastered.</p>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <p className="text-[11px] font-bold text-[#64748b]">
            Practice next: <span className="font-black text-[#FF7052]">{skillLabel(suggestion.skillId)}</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {suggestion.games
              .map((g) => ({ key: g, ...GAME_ROUTES[g] }))
              .filter((g) => g.path)
              .slice(0, 2)
              .map((g) => (
                <Link key={g.key} to={g.path} className="no-underline">
                  <motion.div
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gradient-to-br from-[#FFFBF0] to-[#F0F9FF] border-2 border-white/70 hover:border-white shadow-sm transition-all"
                  >
                    <span className="text-xs font-black text-[#1e293b]">🎮 {g.name}</span>
                    <span className="text-xs text-[#FFCA42] font-black">→</span>
                  </motion.div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
