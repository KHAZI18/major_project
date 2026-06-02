import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { weakSkills, learnerCounts, skillLabel, SKILL_IDS } from '../engine/teacherSource';

const BELOW_CUTOFF = 0.5; // a student is "struggling" on a skill below this

export default function WeaknessAlerts({ perSkill = {}, students = [] }) {
  const counts = learnerCounts(students, SKILL_IDS);
  const weak = weakSkills(perSkill, counts);

  // For each weak skill, how many students are below the per-student cutoff.
  const strugglingCount = (skillId) =>
    students.filter((s) => s.mastery?.[skillId] != null && s.mastery[skillId] < BELOW_CUTOFF).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
      className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-display font-black text-2xl text-[#1e293b]">Weakness Alerts</h3>
        <div className="px-4 py-2 bg-red-50 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
          <AlertTriangle size={14} /> Reteach
        </div>
      </div>

      {weak.length === 0 ? (
        <p className="text-slate-400 font-bold text-sm">✅ No class-wide weaknesses — every practiced skill is at or above {Math.round(BELOW_CUTOFF * 100)}%.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {weak.map((w) => (
            <div key={w.skillId} className="flex items-center gap-4 p-4 rounded-3xl bg-[#FFF1ED] border border-[#FF7052]/20">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-[#1e293b] leading-tight">{skillLabel(w.skillId)}</p>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  Class avg {Math.round(w.mean * 100)}% · {strugglingCount(w.skillId)}/{w.learners} below {Math.round(BELOW_CUTOFF * 100)}%
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-500">
                Weak
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
