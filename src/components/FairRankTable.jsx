import { motion } from 'framer-motion';
import { classMastery } from '../engine/engineAPI';

const RANK_BADGE = ['🥇', '🥈', '🥉'];

export default function FairRankTable({ students = [] }) {
  const ranking = students.length ? classMastery(students).ranking : [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-display font-black text-2xl text-[#1e293b]">Fair Ranking</h3>
        <span className="px-3 py-1 bg-[#5EDAD0]/10 text-[#5EDAD0] text-[10px] font-black uppercase tracking-[0.2em] rounded-full">Mastery-based</span>
      </div>

      {ranking.length === 0 ? (
        <p className="text-slate-400 font-bold text-sm">No ranking data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-3 font-semibold">#</th>
                <th className="p-3 font-semibold">Student</th>
                <th className="p-3 font-semibold">Skills Mastered</th>
                <th className="p-3 font-semibold">Avg Mastery</th>
                <th className="p-3 font-semibold">Fair Score</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="border-b border-slate-50 hover:bg-[#F7F9FC] transition-colors">
                  <td className="p-3 font-black text-[#1e293b]">{i < 3 ? RANK_BADGE[i] : i + 1}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FFCA42]/30 to-[#FF7052]/30 flex items-center justify-center text-sm font-bold shrink-0">
                        {r.name.charAt(0)}
                      </div>
                      <span className="font-bold text-[#1e293b]">{r.name}</span>
                    </div>
                  </td>
                  <td className="p-3"><span className="badge badge-primary text-xs">{r.breadth}</span></td>
                  <td className="p-3 font-semibold text-[#5EDAD0]">{Math.round((r.shrunkenMastery || 0) * 100)}%</td>
                  <td className="p-3 font-black text-[#FF7052]">{(r.score || 0).toFixed(2)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
