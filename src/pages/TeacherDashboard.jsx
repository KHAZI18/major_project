import { useState, useEffect, useMemo } from 'react';

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

// weekly XP will be computed from student progress history at runtime

const TOPIC_ACCURACY = [
  { topic: 'Arithmetic',   accuracy: 82 },
  { topic: 'Fractions',    accuracy: 68 },
  { topic: 'Geometry',     accuracy: 75 },
  { topic: 'Algebra',      accuracy: 55 },
  { topic: 'Decimals',     accuracy: 71 },
  { topic: 'Patterns',     accuracy: 79 },
];

// Map gameIds to display names (uses kebab-case keys matching the client store)
const GAME_ID_TO_NAME = {
  'arithmetic': 'Number Ninja',
  'number-catcher': 'Number Catcher',
  'balloon-pop': 'Balloon Pop',
  'geometry': 'Shape Explorer',
  'meteor': 'Multiplication Meteor',
  'fractions': 'Fraction Frenzy',
  'farm-multiply': 'Multiplication Farm',
  'math-racing': 'Math Racing',
  'balancer': 'Equation Balancer',
  'decimal-mall': 'Decimal Mall',
  'fraction-ninja': 'Fraction Ninja',
  'patterns': 'Pattern Puzzle',
  'coordinate-treasure': 'Treasure Map',
  'integer-mountain': 'Integer Mountain',
  'algebra-dungeon': 'Algebra Dungeon',
};

// Map known gameIds to high-level topics for accuracy aggregation.
const GAME_TOPIC_MAP = {
  'arithmetic': 'Arithmetic',
  'number-catcher': 'Arithmetic',
  'balloon-pop': 'Arithmetic',
  'geometry': 'Geometry',
  'meteor': 'Arithmetic',
  'fractions': 'Fractions',
  'farm-multiply': 'Arithmetic',
  'math-racing': 'Arithmetic',
  'balancer': 'Algebra',
  'decimal-mall': 'Decimals',
  'fraction-ninja': 'Fractions',
  'patterns': 'Patterns',
  'coordinate-treasure': 'Geometry',
  'integer-mountain': 'Arithmetic',
  'algebra-dungeon': 'Algebra',
};

const SUPPORT_TASKS = [
  { id: 'arithmetic', topic: 'Arithmetic', label: 'Number Basics' },
  { id: 'meteor', topic: 'Multiplication', label: 'Multiplication Practice' },
  { id: 'decimal-mall', topic: 'Decimals', label: 'Decimal Practice' },
  { id: 'fractions', topic: 'Fractions', label: 'Fraction Practice' },
  { id: 'coordinate-treasure', topic: 'Coordinates', label: 'Coordinate Practice' },
  { id: 'algebra-dungeon', topic: 'Algebra', label: 'Algebra Practice' },
];

const GRADE_COLORS = {
  'Gr 2': '#fbbf24',
  'Gr 3': '#f97316',
  'Gr 4': '#38bdf8',
  'Gr 5': '#818cf8',
  'Gr 6': '#c084fc',
};

function getGradeDist(students) {
  // Count students per grade (use grade as-is, trimmed)
  const counts = {};
  (students || []).forEach(s => {
    let rawGrade = String(s?.grade || '').trim();
    let grade = rawGrade.startsWith('Gr') ? rawGrade : (rawGrade ? `Gr ${rawGrade}` : 'Unknown');
    if (!GRADE_COLORS[grade]) grade = 'Unknown';
    counts[grade] = (counts[grade] || 0) + 1;
  });
  // Build distribution array
  const dist = Object.entries(GRADE_COLORS).map(([name, color]) => ({
    name,
    value: counts[name] || 0,
    color,
  })).filter(g => g.value > 0);
  // Add unknown grades if present
  if (counts['Unknown']) {
    dist.push({ name: 'Unknown', value: counts['Unknown'], color: '#a3a3a3' });
  }
  // Debug log
  if (students.length > 0) {
    console.log('Grade Mix Distribution:', dist, 'Raw counts:', counts, 'Sample student:', students[0]);
  }
  return dist;
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(date).toLocaleDateString();
}

const STATUS_CONFIG = {
  excellent:    { label: 'Excellent',    color: 'text-emerald-400', badge: 'badge-success', icon: '⭐' },
  good:         { label: 'On Track',     color: 'text-blue-400',    badge: 'badge-primary', icon: '✅' },
  needs_review: { label: 'Needs Review', color: 'text-yellow-400',  badge: 'badge-warning', icon: '⚠️' },
  at_risk:      { label: 'At Risk',      color: 'text-red-400',     badge: 'badge-danger',  icon: '🚨' },
};

function getSupportState(student) {
  const support = student?.progress?.assignedSupport;
  if (!support?.gameId) return 'none';
  return support.completed ? 'completed' : 'assigned';
}

function getPerformanceStatus({ xp = 0, accuracy = 0, gamesPlayed = 0, streak = 0 }) {
  if (gamesPlayed > 0 && accuracy < 60) return 'at_risk';
  if (gamesPlayed > 0 && accuracy < 75) return 'needs_review';
  if (gamesPlayed >= 3 && streak === 0) return 'needs_review';
  if (xp > 5000 && accuracy >= 85) return 'excellent';
  if (xp > 1000 || accuracy >= 75) return 'good';
  return 'at_risk';
}

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
  const [customGameMap, setCustomGameMap] = useState(() => {
    try {
      const raw = localStorage.getItem('mv_game_topic_map');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [tokenInput, setTokenInput] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('xp');
  const [interventions, setInterventions] = useState({});
  const [supportPrompt, setSupportPrompt] = useState(null);
  const [selectedSupportTask, setSelectedSupportTask] = useState(SUPPORT_TASKS[0].id);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('http://localhost:5000/api/teacher/students', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Failed to fetch students: ${resp.status} ${txt}`);
      }

      const data = await resp.json();
      const mapped = data.map(s => {
        const history = s.progress?.history || [];
        const accuracy = Math.round((history.reduce((acc, h) => acc + (h.accuracy || 0), 0) || 0) / (history.length || 1)) || 0;
        const gamesPlayed = history.length || 0;
        const xp = s.progress?.xp || 0;
        const streak = s.progress?.streak || 0;

        return {
          id: s._id,
          name: s.name,
          grade: s.grade,
          avatar: s.avatar,
          level: s.progress?.level || 1,
          xp,
          accuracy,
          gamesPlayed,
          history,
          streak,
          lastActive: s.progress?.lastActive ? new Date(s.progress.lastActive).toLocaleDateString() : 'N/A',
          status: getPerformanceStatus({ xp, accuracy, gamesPlayed, streak }),
          progress: s.progress
        };
      });
      setStudents(mapped);
      setInterventions(prev => {
        const next = {};
        mapped.forEach(student => {
          const supportState = getSupportState(student);
          if (supportState === 'assigned') {
            next[student.id] = prev[student.id] || true;
          }
        });
        return next;
      });
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to fetch students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchStudents();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchStudents();
    };
    const interval = window.setInterval(() => fetchStudents(), 15000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token]);

  const assignSupport = async (studentId, gameId, topic) => {
    try {
      // Optimistically update local UI state so mock/preview students work instantly
      setInterventions(prev => ({ ...prev, [studentId]: true }));

      // Check if studentId is a valid 24-character MongoDB ObjectId
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(String(studentId));
      if (isValidObjectId) {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/teacher/assign-support`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ studentId, gameId, topic })
        });
        if (res.ok) {
          fetchStudents();
        }
      }
    } catch (e) {
      console.error('Error assigning support:', e);
    }
  };

  const openSupportPrompt = (student) => {
    const rec = getRecommendedGame(student?.grade || 2);
    setSelectedSupportTask(rec.id);
    setSupportPrompt(student);
  };

  const assignPromptedSupport = () => {
    if (!supportPrompt) return;
    const task = SUPPORT_TASKS.find(item => item.id === selectedSupportTask) || getRecommendedGame(supportPrompt?.grade || 2);
    const studentId = supportPrompt?.id || supportPrompt?._id;
    assignSupport(studentId, task.id, task.topic);
    setSupportPrompt(null);
  };

  const getRecommendedGame = (grade) => {
    const g = Number(grade);
    if (g === 2) return { id: 'arithmetic', topic: 'Arithmetic' };
    if (g === 3) return { id: 'meteor', topic: 'Multiplication' };
    if (g === 4) return { id: 'decimal-mall', topic: 'Decimals' };
    if (g === 5) return { id: 'coordinate-treasure', topic: 'Coordinates' };
    if (g === 6) return { id: 'algebra-dungeon', topic: 'Algebra' };
    return { id: 'arithmetic', topic: 'Arithmetic' };
  };

  // Prefer DB-backed students; fall back to mock data for local debugging if empty
  const displayStudents = (students && students.length > 0) ? students : MOCK_STUDENTS;
  // Memoize grade distribution for chart and legend
  const gradeDist = useMemo(() => getGradeDist(displayStudents), [displayStudents]);

  // Compute weekly XP and sessions from student history for the last 7 days
  const weeklyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      days.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'short' }) });
    }

    const map = {};
    days.forEach(d => { map[d.key] = { xp: 0, sessions: 0 }; });

    displayStudents.forEach(s => {
      (s.history || []).forEach(h => {
        const ts = h.timestamp || h.date || h.time || h;
        const hDate = new Date(ts);
        if (isNaN(hDate)) return;
        const k = hDate.toISOString().slice(0,10);
        if (map[k]) {
          map[k].xp += (h.xpEarned || h.xp || 0);
          map[k].sessions += 1;
        }
      });
    });

    return days.map(d => ({ day: d.label, xp: map[d.key].xp, sessions: map[d.key].sessions }));
  }, [displayStudents]);



  // Aggregate recent activities from student history
  const recentActivities = useMemo(() => {
    const list = [];
    (displayStudents || []).forEach(s => {
      (s?.history || []).forEach(h => {
        list.push({
          studentName: s?.name || 'Unknown Student',
          gameName: h?.gameName || (h?.gameId && GAME_ID_TO_NAME[h.gameId]) || h?.gameId || h?.game || 'Game Session',
          xp: (h?.xpEarned != null ? h.xpEarned : h?.xp) || 0,
          accuracy: h?.accuracy || 0,
          timestamp: h?.timestamp || h?.date || h?.time || new Date(),
        });
      });
    });

    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (list.length > 0) return list.slice(0, 5);

    // Fallback Mock Activities for visual excellence in local debugging
    return [
      { studentName: 'Priya S.', gameName: 'Multiplication Meteor', xp: 75, accuracy: 95, timestamp: new Date(Date.now() - 4 * 60 * 1000) },
      { studentName: 'Arjun K.', gameName: 'Fraction Frenzy', xp: 50, accuracy: 88, timestamp: new Date(Date.now() - 15 * 60 * 1000) },
      { studentName: 'Meena R.', gameName: 'Number Ninja', xp: 50, accuracy: 82, timestamp: new Date(Date.now() - 45 * 60 * 1000) },
      { studentName: 'Vikram D.', gameName: 'Equation Balancer', xp: 75, accuracy: 70, timestamp: new Date(Date.now() - 120 * 60 * 1000) },
      { studentName: 'Sunita B.', gameName: 'Decimal Mall', xp: 80, accuracy: 90, timestamp: new Date(Date.now() - 180 * 60 * 1000) },
    ];
  }, [displayStudents]);

  const avgAccuracy = useMemo(() => {
    if (!displayStudents?.length) return 0;
    const sum = displayStudents.reduce((acc, s) => acc + (s?.accuracy || 0), 0);
    return Math.round(sum / displayStudents.length);
  }, [displayStudents]);

  const activeToday = useMemo(() => {
    return (displayStudents || []).filter(s => s?.streak > 0).length;
  }, [displayStudents]);

  const atRisk = useMemo(() => {
    return (displayStudents || []).filter(s => s?.status === 'at_risk' || s?.status === 'needs_review').length;
  }, [displayStudents]);

  const filtered = (displayStudents || [])
    .filter((s) =>
      (filterStatus === 'all' || s?.status === filterStatus) &&
      (s?.name || '').toLowerCase().includes(search.toLowerCase())
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
      <StatCard icon="🎒" label="Students" value={displayStudents.length} sub="Active Learners" color="bg-[#FFCA42]/10 text-[#FFCA42]" />
        <StatCard icon="🎯" label="Avg Accuracy" value={`${avgAccuracy}%`} sub="Class Proficiency" color="bg-[#5EDAD0]/10 text-[#5EDAD0]" />
        <StatCard icon="⚡" label="Active Now" value={activeToday} sub="Working hard today" color="bg-[#FF7052]/10 text-[#FF7052]" />
        <StatCard icon="🚨" label="Attention" value={atRisk} sub="Need a little help" color="bg-[#FF7052]/10 text-[#FF7052]" />
      </div>
      {/* Charts Row */}

      {error && (
        <div className="mb-6 text-red-500 font-bold">Error loading students: {error}</div>
      )}

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
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontWeight: 700, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontWeight: 700, fontSize: 12 }} />
                <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} cursor={{ stroke: '#5EDAD0', strokeWidth: 2 }} />
                <Line type="monotone" dataKey="xp" stroke="#5EDAD0" strokeWidth={6} dot={{ r: 6, fill: '#5EDAD0', strokeWidth: 3, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>


        </motion.div>

        {/* Live Class Activity Feed */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-50 flex flex-col justify-between min-h-[350px]">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display font-black text-2xl text-[#1e293b]">Live Class Activity</h3>
              <div className="px-3 py-1 bg-emerald-50 text-emerald-500 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Feed
              </div>
            </div>
            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {recentActivities.map((act, index) => (
                <div key={index} className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F7F9FC] border border-slate-50 hover:border-[#5EDAD0]/20 hover:bg-white hover:shadow-[0_4px_12px_rgb(0,0,0,0.02)] transition-all">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5EDAD0] to-[#47c7bd] text-white flex items-center justify-center text-sm font-black shrink-0 shadow-sm">
                      {act.studentName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-[#1e293b] leading-tight">
                        {act.studentName} <span className="font-medium text-slate-500">completed</span> {act.gameName}
                      </p>
                      <p className="text-[11px] text-slate-400 font-bold mt-1 flex items-center gap-1.5">
                        <span>Accuracy: <span className="text-[#FF7052] font-black">{act.accuracy}%</span></span>
                        <span className="text-slate-300">•</span>
                        <span>{formatRelativeTime(act.timestamp)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-[#5EDAD0]/10 text-[#5EDAD0] rounded-xl text-[10px] font-black tracking-wider whitespace-nowrap shadow-sm border border-[#5EDAD0]/5">
                    +{act.xp} XP
                  </div>
                </div>
              ))}
            </div>
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
                {gradeDist.length === 0 ? (
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">No Data</text>
                ) : (
                  <Pie data={gradeDist} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                    {gradeDist.map((entry, index) => (
                      <Cell key={index} fill={entry.color} cornerRadius={10} />
                    ))}
                  </Pie>
                )}
                <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {gradeDist.map(g => (
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-black text-2xl text-[#1e293b]">Needs Support</h3>
              <p className="text-xs text-slate-400 font-bold mt-1">Intervene early with students who are falling behind</p>
            </div>
            <div className="px-4 py-2 bg-red-50 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm">
              Action Required
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {(displayStudents || []).filter((s) => ['at_risk', 'needs_review'].includes(s?.status)).slice(0, 3).map((s, i) => {
              const issueMsg = s?.accuracy < 60
                ? 'Struggling with core accuracy'
                : s?.streak === 0
                  ? 'Long inactivity / low participation'
                  : 'Struggling with recent math units';
              const sId = s?.id || s?._id || `s-${i}`;
              const supportState = getSupportState(s);
              const needsSupport = ['at_risk', 'needs_review'].includes(s?.status);
              const isCompleted = supportState === 'completed' && !needsSupport;
              const isAssigned = !isCompleted && (interventions[sId] || supportState === 'assigned');

              return (
                <div key={sId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[24px] bg-[#F7F9FC] border border-slate-50 hover:border-[#FF7052]/20 hover:bg-white hover:shadow-[0_8px_20px_rgb(0,0,0,0.02)] transition-all">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xl shrink-0 font-black text-slate-700">
                      {(s?.name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-base font-black text-[#1e293b] leading-tight truncate">{s?.name || 'Unknown'}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${s?.status === 'at_risk' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                          {s?.status === 'at_risk' ? 'Critical' : 'Review'}
                        </span>
                      </div>
                      <p className="text-xs text-[#FF7052] font-black">{issueMsg}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">
                        Accuracy: <span className="font-black text-slate-600">{s?.accuracy || 0}%</span> • Grade: <span className="font-black text-slate-600">{s?.grade || 'N/A'}</span> • Level: <span className="font-black text-slate-600">{s?.level || 1}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => openSupportPrompt(s)}
                    disabled={isAssigned || isCompleted}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm ${
                      isCompleted
                        ? 'bg-blue-500 text-white cursor-default'
                        : isAssigned
                        ? 'bg-emerald-500 text-white cursor-default'
                        : 'bg-[#1e293b] text-white hover:bg-[#FF7052] hover:scale-105 active:scale-95'
                    }`}
                  >
                    {isCompleted ? '✓ Completed' : isAssigned ? '✓ Path Assigned' : 'Needs Support'}
                  </button>
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
                <th className="p-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student, i) => {
                const sc = STATUS_CONFIG[student?.status] || STATUS_CONFIG.good;
                const sId = student?.id || student?._id || `s-${i}`;
                const supportState = getSupportState(student);
                const needsSupport = ['at_risk', 'needs_review'].includes(student?.status);
                const isCompleted = supportState === 'completed' && !needsSupport;
                const isAssigned = !isCompleted && (interventions[sId] || supportState === 'assigned');
                return (
                  <motion.tr
                    key={sId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30 flex items-center justify-center text-sm font-bold shrink-0">
                          {(student?.name || '?').charAt(0)}
                        </div>
                        <span className="font-medium text-slate-200">{student?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="p-3"><span className="badge badge-orange text-xs">Gr {student?.grade || 'N/A'}</span></td>
                    <td className="p-3"><span className="badge badge-primary text-xs">Lv {student?.level || 1}</span></td>
                    <td className="p-3 font-semibold text-primary">{(student?.xp || 0).toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 progress-bar" style={{ height: '5px' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${student?.accuracy || 0}%`,
                              background: (student?.accuracy || 0) >= 80 ? 'linear-gradient(90deg,#22c55e,#34d399)' :
                                         (student?.accuracy || 0) >= 60 ? 'linear-gradient(90deg,#f97316,#fbbf24)' :
                                         'linear-gradient(90deg,#ef4444,#f87171)',
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-300">{student?.accuracy || 0}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{student?.gamesPlayed || 0}</td>
                    <td className="p-3 text-orange-400 font-semibold">🔥 {student?.streak || 0}</td>
                    <td className="p-3">
                      <span className={`badge text-xs ${sc.badge}`}>{sc.icon} {sc.label}</span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openSupportPrompt(student)}
                        disabled={isAssigned || isCompleted}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all shadow-sm ${
                          isCompleted
                            ? 'bg-blue-500 text-white cursor-default'
                            : isAssigned
                            ? 'bg-emerald-500 text-white cursor-default'
                            : 'bg-[#1e293b] text-white hover:bg-[#FF7052] hover:scale-105 active:scale-95'
                        }`}
                      >
                        {isCompleted ? '✓ Done' : isAssigned ? '✓ Assigned' : needsSupport ? 'Needs Support' : 'Add Task'}
                      </button>
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

      {supportPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl border border-slate-100"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">Needs Support</p>
                <h3 className="font-display text-2xl font-black text-[#1e293b]">Assign support task</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  {supportPrompt.name} is at {supportPrompt.accuracy || 0}% accuracy.
                </p>
              </div>
              <button
                onClick={() => setSupportPrompt(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 font-black hover:bg-slate-200"
                aria-label="Close support task dialog"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {SUPPORT_TASKS.map(task => {
                const selected = selectedSupportTask === task.id;
                return (
                  <button
                    key={task.id}
                    onClick={() => setSelectedSupportTask(task.id)}
                    className={`text-left rounded-2xl border p-4 transition-all ${
                      selected
                        ? 'border-[#5EDAD0] bg-[#5EDAD0]/10 text-[#1e293b] shadow-sm'
                        : 'border-slate-100 bg-[#F7F9FC] text-slate-600 hover:border-slate-200'
                    }`}
                  >
                    <span className="block text-sm font-black">{task.label}</span>
                    <span className="block text-[11px] font-bold text-slate-400 mt-1">{GAME_ID_TO_NAME[task.id]}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSupportPrompt(null)}
                className="px-5 py-3 rounded-xl bg-slate-100 text-slate-500 text-xs font-black hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={assignPromptedSupport}
                className="px-5 py-3 rounded-xl bg-[#1e293b] text-white text-xs font-black hover:bg-[#FF7052]"
              >
                Assign Task
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
