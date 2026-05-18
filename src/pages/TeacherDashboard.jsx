import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { Users, Activity, Target, TrendingUp, Star, AlertTriangle, Download, ChevronLeft, RefreshCw } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const MOCK_STUDENTS = [
  { id: 1, name: 'Priya S.',    grade: 5, level: 12, xp: 14200, accuracy: 91, gamesPlayed: 98, streak: 15, lastActive: '2026-05-17', status: 'excellent' },
  { id: 2, name: 'Arjun K.',   grade: 5, level: 10, xp: 11800, accuracy: 85, gamesPlayed: 74, streak: 7,  lastActive: '2026-05-17', status: 'good' },
  { id: 3, name: 'Meena R.',   grade: 4, level: 9,  xp: 10500, accuracy: 78, gamesPlayed: 60, streak: 22, lastActive: '2026-05-16', status: 'good' },
  { id: 4, name: 'Vikram D.',  grade: 6, level: 8,  xp: 9200,  accuracy: 72, gamesPlayed: 55, streak: 4,  lastActive: '2026-05-15', status: 'needs_review' },
  { id: 5, name: 'Sunita B.',  grade: 4, level: 7,  xp: 8100,  accuracy: 80, gamesPlayed: 48, streak: 11, lastActive: '2026-05-17', status: 'good' },
  { id: 6, name: 'Rohan M.',   grade: 3, level: 6,  xp: 7300,  accuracy: 65, gamesPlayed: 42, streak: 3,  lastActive: '2026-05-14', status: 'needs_review' },
  { id: 7, name: 'Kavya T.',   grade: 3, level: 5,  xp: 6100,  accuracy: 88, gamesPlayed: 38, streak: 8,  lastActive: '2026-05-17', status: 'good' },
  { id: 8, name: 'Ravi P.',    grade: 2, level: 5,  xp: 5800,  accuracy: 55, gamesPlayed: 30, streak: 2,  lastActive: '2026-05-13', status: 'at_risk' },
  { id: 9, name: 'Ananya G.',  grade: 2, level: 4,  xp: 4900,  accuracy: 70, gamesPlayed: 24, streak: 5,  lastActive: '2026-05-16', status: 'needs_review' },
  { id: 10, name: 'Dev L.',    grade: 2, level: 3,  xp: 3200,  accuracy: 48, gamesPlayed: 18, streak: 1,  lastActive: '2026-05-12', status: 'at_risk' },
];

const WEEKLY_XP = [
  { day: 'Mon', xp: 1200, sessions: 8 },
  { day: 'Tue', xp: 1850, sessions: 12 },
  { day: 'Wed', xp: 1400, sessions: 9 },
  { day: 'Thu', xp: 2100, sessions: 15 },
  { day: 'Fri', xp: 1900, sessions: 13 },
  { day: 'Sat', xp: 2400, sessions: 18 },
  { day: 'Sun', xp: 1100, sessions: 7 },
];

const TOPIC_ACCURACY = [
  { topic: 'Arithmetic',   accuracy: 82 },
  { topic: 'Fractions',    accuracy: 68 },
  { topic: 'Geometry',     accuracy: 75 },
  { topic: 'Algebra',      accuracy: 55 },
  { topic: 'Decimals',     accuracy: 71 },
  { topic: 'Patterns',     accuracy: 79 },
];

const GRADE_DIST = [
  { name: 'Gr 2', value: 3, color: '#fbbf24' },
  { name: 'Gr 3', value: 2, color: '#f97316' },
  { name: 'Gr 4', value: 2, color: '#38bdf8' },
  { name: 'Gr 5', value: 2, color: '#818cf8' },
  { name: 'Gr 6', value: 1, color: '#c084fc' },
];

const STATUS_CONFIG = {
  excellent:    { label: 'Excellent',    color: 'text-emerald-400', badge: 'badge-success', icon: '⭐' },
  good:         { label: 'On Track',     color: 'text-blue-400',    badge: 'badge-primary', icon: '✅' },
  needs_review: { label: 'Needs Review', color: 'text-yellow-400',  badge: 'badge-warning', icon: '⚠️' },
  at_risk:      { label: 'At Risk',      color: 'text-red-400',     badge: 'badge-danger',  icon: '🚨' },
};

function StatCard({ icon, label, value, sub, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-50 flex items-center gap-5"
    >
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-black text-[#1e293b] font-display">{value}</p>
        {sub && <p className="text-slate-500 text-xs font-medium">{sub}</p>}
      </div>
    </motion.div>
  );
}

const CUSTOM_TOOLTIP_STYLE = {
  backgroundColor: 'white',
  border: 'none',
  borderRadius: '16px',
  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
  color: '#1e293b',
  fontSize: '13px',
  fontWeight: 'bold',
};

export default function TeacherDashboard() {
  const { user, token } = useAuthStore();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('xp');

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const resp = await fetch('http://localhost:5000/api/teacher/students', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        const mapped = data.map(s => ({
          id: s._id,
          name: s.name,
          grade: s.grade,
          avatar: s.avatar,
          level: s.progress?.level || 1,
          xp: s.progress?.xp || 0,
          accuracy: Math.round(s.progress?.history?.reduce((acc, h) => acc + h.accuracy, 0) / (s.progress?.history?.length || 1)) || 0,
          gamesPlayed: s.progress?.history?.length || 0,
          streak: s.progress?.streak || 0,
          lastActive: new Date(s.progress?.lastActive).toLocaleDateString(),
          status: (s.progress?.xp > 5000) ? 'excellent' : (s.progress?.xp > 1000) ? 'good' : 'at_risk'
        }));
        setStudents(mapped);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchStudents();
  }, [token]);

  const displayStudents = students.length > 0 ? students : MOCK_STUDENTS;

  const atRisk = displayStudents.filter((s) => s.status === 'at_risk').length;
  const avgAccuracy = Math.round(displayStudents.reduce((a, b) => a + (b.accuracy || 0), 0) / (displayStudents.length || 1));
  const activeToday = displayStudents.filter((s) => s.lastActive === new Date().toLocaleDateString()).length;

  const filtered = displayStudents
    .filter((s) =>
      (filterStatus === 'all' || s.status === filterStatus) &&
      s.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortBy === 'xp' ? b.xp - a.xp :
      sortBy === 'accuracy' ? b.accuracy - a.accuracy :
      sortBy === 'streak' ? b.streak - a.streak :
      b.gamesPlayed - a.gamesPlayed
    );

  const handleExport = () => {
    const csv = [
      'Name,Grade,Level,XP,Accuracy,Games,Streak,Status',
      ...displayStudents.map((s) =>
        `${s.name},${s.grade},${s.level},${s.xp},${s.accuracy}%,${s.gamesPlayed},${s.streak},${s.status}`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'math_village_report.csv'; a.click();
  };

  return (
    <div className="pb-20 pt-6 px-4 max-w-7xl mx-auto bg-[#F7F9FC] min-h-screen">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-[#5EDAD0]/10 text-[#5EDAD0] text-[10px] font-black uppercase tracking-[0.2em] rounded-full">Admin Portal</span>
          </div>
          <h1 className="font-display text-5xl font-black text-[#1e293b] tracking-tight">Village Dashboard</h1>
          <p className="text-slate-500 font-medium text-lg mt-1">Hello, {user?.name || 'Teacher'}! Here's how your class is doing.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={fetchStudents}
            className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-[#5EDAD0] transition-colors"
          >
            <RefreshCw size={24} className={loading ? 'animate-spin' : ''} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={handleExport}
            className="flex items-center gap-2 px-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100 font-black text-slate-600 hover:text-[#5EDAD0] transition-colors"
          >
            <Download size={18} /> Export Data
          </motion.button>
          
          <Link to="/" className="w-14 h-14 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-[#FF7052] transition-colors">
            <ChevronLeft size={24} />
          </Link>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard icon="🎒" label="Students" value={MOCK_STUDENTS.length} sub="Active Learners" color="bg-[#FFCA42]/10 text-[#FFCA42]" />
        <StatCard icon="🎯" label="Avg Accuracy" value={`${avgAccuracy}%`} sub="Class Proficiency" color="bg-[#5EDAD0]/10 text-[#5EDAD0]" />
        <StatCard icon="⚡" label="Active Now" value={activeToday} sub="Working hard today" color="bg-[#FF7052]/10 text-[#FF7052]" />
        <StatCard icon="🚨" label="Attention" value={atRisk} sub="Need a little help" color="bg-[#FF7052]/10 text-[#FF7052]" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        {/* Weekly Activity */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} 
          className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display font-black text-2xl text-[#1e293b]">Weekly Progress</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">📈</div>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={WEEKLY_XP}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontWeight: 700, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontWeight: 700, fontSize: 12 }} />
                <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} cursor={{ stroke: '#5EDAD0', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="xp" stroke="#5EDAD0" strokeWidth={6} dot={{ r: 6, fill: '#5EDAD0', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Topic Accuracy */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} 
          className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display font-black text-2xl text-[#1e293b]">Skill Mastery</h3>
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">🎯</div>
          </div>
          <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={TOPIC_ACCURACY} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis dataKey="topic" type="category" axisLine={false} tickLine={false} tick={{ fill: '#1e293b', fontWeight: 800, fontSize: 12 }} width={100} />
              <Tooltip cursor={{ fill: '#F7F9FC' }} contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Bar dataKey="accuracy" radius={[0, 10, 10, 0]} barSize={24}>
                {TOPIC_ACCURACY.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#FF7052' : '#FFCA42'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Grade Distribution + At-Risk Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
        {/* Pie */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} 
          className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
          <h3 className="font-display font-black text-2xl text-[#1e293b] mb-6">Grade Mix</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={GRADE_DIST} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                  {GRADE_DIST.map((entry, index) => (
                    <Cell key={index} fill={entry.color} cornerRadius={10} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {GRADE_DIST.map(g => (
              <div key={g.name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                <span className="text-[10px] font-black text-slate-500 uppercase">{g.name}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* At-Risk Panel */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} 
          className="lg:col-span-2 bg-white rounded-[40px] p-8 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display font-black text-2xl text-[#1e293b]">Needs Support</h3>
            <div className="px-4 py-2 bg-red-50 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest">
              Action Required
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOCK_STUDENTS.filter((s) => ['at_risk', 'needs_review'].includes(s.status)).slice(0, 4).map((s) => {
              const sc = STATUS_CONFIG[s.status];
              return (
                <div key={s.id} className="flex items-center gap-4 p-4 rounded-3xl bg-[#F7F9FC] border border-slate-50 hover:border-[#FF7052]/30 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl shrink-0">
                    {s.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-black text-[#1e293b] leading-tight">{s.name}</p>
                    <p className="text-xs text-slate-500 font-bold mt-0.5">Acc: {s.accuracy}% • Gr {s.grade}</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${s.status === 'at_risk' ? 'bg-red-100 text-red-500' : 'bg-yellow-100 text-yellow-600'}`}>
                    {s.status === 'at_risk' ? 'Alert' : 'Review'}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Student Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} 
        className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <h3 className="font-display font-black text-3xl text-[#1e293b]">Class Roster</h3>
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[#F7F9FC] border border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-[#1e293b] placeholder-slate-400 focus:outline-none focus:border-[#5EDAD0] w-48 shadow-inner"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[#F7F9FC] border border-slate-100 rounded-2xl px-4 py-3 text-sm font-black text-slate-500 focus:outline-none focus:border-[#5EDAD0] shadow-inner"
            >
              <option value="all">Status: All</option>
              <option value="excellent">Excellent</option>
              <option value="good">On Track</option>
              <option value="needs_review">Review</option>
              <option value="at_risk">Risk</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-white/8 border border-white/15 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-primary/50"
            >
              <option value="xp">Sort: XP</option>
              <option value="accuracy">Sort: Accuracy</option>
              <option value="streak">Sort: Streak</option>
              <option value="games">Sort: Games</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-3 font-semibold">Student</th>
                <th className="p-3 font-semibold">Grade</th>
                <th className="p-3 font-semibold">Level</th>
                <th className="p-3 font-semibold">XP</th>
                <th className="p-3 font-semibold">Accuracy</th>
                <th className="p-3 font-semibold">Games</th>
                <th className="p-3 font-semibold">Streak</th>
                <th className="p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, i) => {
                const sc = STATUS_CONFIG[student.status];
                return (
                  <motion.tr
                    key={student.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-sm font-bold shrink-0">
                          {student.name.charAt(0)}
                        </div>
                        <span className="font-medium text-slate-200">{student.name}</span>
                      </div>
                    </td>
                    <td className="p-3"><span className="badge badge-orange text-xs">Gr {student.grade}</span></td>
                    <td className="p-3"><span className="badge badge-primary text-xs">Lv {student.level}</span></td>
                    <td className="p-3 font-semibold text-primary">{student.xp.toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 progress-bar" style={{ height: '5px' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${student.accuracy}%`,
                              background: student.accuracy >= 80 ? 'linear-gradient(90deg,#22c55e,#34d399)' :
                                         student.accuracy >= 60 ? 'linear-gradient(90deg,#f97316,#fbbf24)' :
                                         'linear-gradient(90deg,#ef4444,#f87171)',
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-300">{student.accuracy}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{student.gamesPlayed}</td>
                    <td className="p-3 text-orange-400 font-semibold">🔥 {student.streak}</td>
                    <td className="p-3">
                      <span className={`badge text-xs ${sc.badge}`}>{sc.icon} {sc.label}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-500">No students match your filters.</div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
