// `motion` below is used as <motion.div> JSX; the repo's eslint config lacks
// react/jsx-uses-vars so it can't detect member-expression JSX usage.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getAllMastery } from '../engine/engineAPI';
import { practicedMastery, skillLabel } from '../engine/engineSource';

const TOOLTIP_STYLE = {
  backgroundColor: 'white', border: 'none', borderRadius: '12px',
  boxShadow: '0 8px 20px -5px rgba(0,0,0,0.1)', color: '#1e293b',
  fontSize: '12px', fontWeight: 'bold',
};

// Pure: mastery map -> [{ skill, value(0-100) }] sorted desc, practiced only.
// Exported alongside the component so its unit test can import the pure shaper
// without rendering the (jsdom-flaky) recharts SVG.
// eslint-disable-next-line react-refresh/only-export-components
export function masteryBars(allMastery) {
  return Object.entries(practicedMastery(allMastery))
    .map(([id, m]) => ({ skill: skillLabel(id), value: Math.round(m * 100) }))
    .sort((a, b) => b.value - a.value);
}

function barColor(v) {
  if (v >= 75) return '#5EDAD0';
  if (v >= 40) return '#FFCA42';
  return '#FF7052';
}

export default function MasteryChart() {
  const bars = masteryBars(getAllMastery()).slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_4px_12px_rgb(0,0,0,0.04)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] transition-all"
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/60 bg-gradient-to-r from-[#E8F9F8]/40 to-transparent">
        <div className="flex items-center gap-1.5">
          <span className="text-base drop-shadow-sm">📊</span>
          <h3 className="font-display font-black text-sm text-[#1e293b]">Your Skills</h3>
        </div>
        <span className="text-[8px] font-black text-[#94a3b8] uppercase tracking-wide">{bars.length} skills practiced</span>
      </div>

      {bars.length === 0 ? (
        <p className="p-3 text-center text-xs font-bold text-[#94a3b8]">Play a game to see your skill mastery here!</p>
      ) : (
        <div className="p-2 h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis dataKey="skill" type="category" axisLine={false} tickLine={false} width={84}
                tick={{ fill: '#1e293b', fontWeight: 800, fontSize: 10 }} />
              <Tooltip cursor={{ fill: '#F7F9FC' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Mastery']} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={14}>
                {bars.map((b, i) => <Cell key={i} fill={barColor(b.value)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
