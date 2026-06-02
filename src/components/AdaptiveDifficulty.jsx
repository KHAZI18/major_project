// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Gauge, ArrowUpRight } from 'lucide-react';
import { getAllMastery } from '../engine/engineAPI';
import { SKILL_IDS } from '../engine/knowledgeGraph';

const LEVELS = ['Easy', 'Medium', 'Hard'];
const LEVEL_COLOR = ['#5EDAD0', '#FFCA42', '#FF7052'];
const PRIOR = 0.2;     // BKT prior — a skill still at the prior is "unpracticed"
const BASELINE = 0;    // the old games served a single fixed level ("Easy") for everyone

// Mirrors the engine's decisionLayer.nextDifficulty thresholds.
// eslint-disable-next-line react-refresh/only-export-components
export function difficultyLevel(mastery) {
  if (mastery < 0.4) return 0;   // Easy
  if (mastery <= 0.75) return 1; // Medium
  return 2;                      // Hard
}

function skillLabel(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function Meter({ level }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map((lbl, i) => (
        <div
          key={lbl}
          title={lbl}
          className="h-2.5 flex-1 rounded-full transition-colors"
          style={{ background: i <= level ? LEVEL_COLOR[level] : 'rgba(148,163,184,0.22)' }}
        />
      ))}
    </div>
  );
}

export default function AdaptiveDifficulty() {
  const mastery = getAllMastery();
  const rows = SKILL_IDS
    .filter((id) => Math.abs((mastery[id] ?? PRIOR) - PRIOR) > 1e-6) // practiced only
    .map((id) => ({ id, label: skillLabel(id), level: difficultyLevel(mastery[id]) }))
    .sort((a, b) => b.level - a.level)
    .slice(0, 8);

  if (rows.length === 0) return null; // nothing practiced yet → hide the card

  const raised = rows.filter((r) => r.level > BASELINE).length;

  return (
    <div className="rounded-[28px] bg-white border border-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] p-5">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-slate-400">
        <Gauge size={15} className="text-[#FF7052]" /> Adaptive Difficulty
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Old games gave everyone <strong>one fixed level</strong>. The learning engine sets
        each skill to <em>your</em> mastery — it has pushed{' '}
        <strong className="text-[#FF7052]">{raised} of {rows.length}</strong> skills above the
        old fixed level.
      </p>

      <div className="mt-4 grid gap-3">
        {rows.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-800 truncate">{r.label}</span>
              <span className="flex items-center gap-1 text-xs font-black" style={{ color: LEVEL_COLOR[r.level] }}>
                {LEVELS[r.level]}
                {r.level > BASELINE && (
                  <span className="inline-flex items-center text-emerald-600">
                    <ArrowUpRight size={13} />+{r.level}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-2"><Meter level={r.level} /></div>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 text-[11px] font-semibold text-slate-400">
        Baseline = the old static games’ fixed level. ↑ shows how many steps the ML raised it.
      </div>
    </div>
  );
}
