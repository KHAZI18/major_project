import { motion } from 'framer-motion';
import { buildHeatmapMatrix, skillLabel, SKILL_IDS } from '../engine/teacherSource';

// Green (mastered) -> amber (developing) -> red (weak); neutral gray for unpracticed.
export function masteryColor(m) {
  if (m == null) return '#e2e8f0';
  if (m >= 0.75) return '#5EDAD0';
  if (m >= 0.5) return '#7dd3a8';
  if (m >= 0.3) return '#FFCA42';
  return '#FF7052';
}

// Short column header, e.g. 'fractions-basic' -> 'FR' (first letters of first two words).
function abbrev(skillId) {
  const parts = String(skillId).split(/[-_]/);
  const a = (parts[0] || '').slice(0, 2);
  return a.toUpperCase();
}

export default function MasteryHeatmap({ students = [], skills = SKILL_IDS }) {
  if (!students.length) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
        <h3 className="font-display font-black text-2xl text-[#1e293b] mb-4">Skill Heatmap</h3>
        <p className="text-slate-400 font-bold text-sm">No class mastery data yet.</p>
      </motion.div>
    );
  }

  const { rows } = buildHeatmapMatrix(students, skills);
  const gridCols = `minmax(96px, 1.4fr) repeat(${skills.length}, minmax(28px, 1fr))`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
      className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-display font-black text-2xl text-[#1e293b]">Skill Heatmap</h3>
        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#FF7052' }} />Weak</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#FFCA42' }} />Developing</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#5EDAD0' }} />Mastered</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 'max-content' }}>
          {/* Header row */}
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: gridCols }}>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 self-end pb-1">Student</div>
            {skills.map((sk) => (
              <div key={sk} title={skillLabel(sk)}
                className="text-[9px] font-black text-slate-400 text-center self-end pb-1">{abbrev(sk)}</div>
            ))}
          </div>

          {/* Student rows */}
          {rows.map((row) => (
            <div key={row.id} className="grid gap-1 mb-1 items-center" style={{ gridTemplateColumns: gridCols }}>
              <div className="text-xs font-black text-[#1e293b] truncate pr-2">{row.name}</div>
              {row.cells.map((m, i) => (
                <div
                  key={i}
                  title={`${row.name} · ${skillLabel(skills[i])}: ${m == null ? 'not practiced' : Math.round(m * 100) + '%'}`}
                  className="h-7 rounded-md flex items-center justify-center text-[8px] font-black text-white/90"
                  style={{ background: masteryColor(m) }}
                >
                  {m == null ? '' : Math.round(m * 100)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
