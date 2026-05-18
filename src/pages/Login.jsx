import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';

const AVATARS = ['🧒','👧','👦','🧑','👩','👨','🧒🏽','👧🏽'];
const GRADES  = [2, 3, 4, 5, 6];

const AVATAR_BG = {
  '🧒':'from-orange-400 to-amber-500','👧':'from-pink-400 to-rose-500',
  '👦':'from-blue-400 to-sky-500','🧑':'from-teal-400 to-emerald-500',
  '👩':'from-purple-400 to-violet-500','👨':'from-red-400 to-orange-500',
  '🧒🏽':'from-amber-400 to-yellow-500','👧🏽':'from-cyan-400 to-teal-500',
};

export default function Login() {
  const [mode, setMode] = useState('select'); // 'select' | 'form'
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ name: '', grade: 3, avatar: '🧒', email: '', password: '' });
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const navigate  = useNavigate();
  const { login, signup } = useAuthStore();
  const { checkStreak } = usePlayerStore();

  const triggerError = (msg) => {
    setError(msg); setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let result;
    
    if (tab === 'signup') {
      if (!form.name.trim()) return triggerError('Please enter your name');
      if (!form.email.trim()) return triggerError('Please enter your email');
      if (form.password.length < 6) return triggerError('Password must be at least 6 characters');
      
      result = await signup(role, { 
        name: form.name.trim(), 
        email: form.email.trim(), 
        password: form.password,
        avatar: form.avatar, 
        grade: form.grade 
      });
    } else {
      if (!form.email.trim()) return triggerError('Please enter your email');
      if (!form.password.trim()) return triggerError('Please enter your password');
      
      result = await login(role, { 
        email: form.email.trim(), 
        password: form.password 
      });
    }

    if (result.success) {
      checkStreak();
      navigate(role === 'student' ? '/student' : '/teacher');
    } else {
      triggerError(result.error || 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-white">
      {/* ── LEFT PANEL (Hero / Branding) - Hidden on Mobile ── */}
      <div className="hidden lg:flex w-1/2 relative bg-[#F7F9FC] flex-col justify-center px-20 xl:px-28 overflow-hidden border-r border-slate-100">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#FFF1EE]/60 to-[#E8F9F8]/60" />
        
        {/* Floating background elements */}
        <motion.div animate={{ y: [-15, 15, -15], rotate: 10 }} transition={{ duration: 6, repeat: Infinity }} className="absolute text-[#FF7052] text-6xl font-black opacity-10 top-[20%] left-[20%]">×</motion.div>
        <motion.div animate={{ y: [15, -15, 15], rotate: -15 }} transition={{ duration: 7, repeat: Infinity, delay: 1 }} className="absolute text-[#5EDAD0] text-7xl font-black opacity-10 top-[30%] right-[15%]">+</motion.div>
        <motion.div animate={{ y: [-10, 10, -10], rotate: 45 }} transition={{ duration: 5, repeat: Infinity, delay: 2 }} className="absolute text-[#FFCA42] text-6xl font-black opacity-15 bottom-[25%] left-[15%]">÷</motion.div>
        
        <div className="relative z-10 w-full max-w-lg">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="text-8xl mb-8 drop-shadow-sm">🏘️</div>
            <h1 className="font-display font-black text-6xl text-[#1e293b] leading-[1.1] mb-6 tracking-tight">
              Master Math.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF7052] to-[#FFCA42]">Build Your Village.</span>
            </h1>
            <p className="text-slate-500 text-lg font-medium leading-relaxed mb-10 max-w-md">
              Join thousands of students and teachers in a gamified learning adventure. Fun, interactive, and completely offline-ready.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-4">
                {['👦', '👧', '🧒', '👩‍🦰'].map((emoji, i) => (
                  <div key={i} className="w-12 h-12 rounded-full border-4 border-[#F7F9FC] bg-white flex items-center justify-center text-xl shadow-sm z-10" style={{ zIndex: 10 - i }}>
                    {emoji}
                  </div>
                ))}
              </div>
              <div className="text-sm font-bold text-slate-500">
                <span className="text-[#1e293b] font-black">10,000+</span> learners
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── RIGHT PANEL (Auth Form) ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 relative bg-white lg:bg-transparent">
        {/* Mobile Background Pattern (Only visible on mobile) */}
        <div className="absolute inset-0 z-0 lg:hidden bg-[#F7F9FC]">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#FFF1EE]/80 to-[#E8F9F8]/80" />
          <motion.div animate={{ y: [-10, 10, -10], rotate: 10 }} transition={{ duration: 6, repeat: Infinity }} className="absolute text-[#FF7052] text-5xl font-black opacity-15 top-[10%] left-[10%]">×</motion.div>
          <motion.div animate={{ y: [10, -10, 10], rotate: -15 }} transition={{ duration: 7, repeat: Infinity, delay: 1 }} className="absolute text-[#5EDAD0] text-6xl font-black opacity-10 top-[20%] right-[10%]">+</motion.div>
        </div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-[400px] relative z-10 w-full">

        {/* ── ROLE SELECT ── */}
        <AnimatePresence mode="wait">
          {mode === 'select' && (
            <motion.div 
              key="select" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/80 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-none p-6 sm:p-8 lg:p-0 rounded-[32px] lg:rounded-none shadow-[0_8px_30px_rgb(0,0,0,0.06)] lg:shadow-none border border-white/50 lg:border-none"
            >
              {/* Mobile Mobile Logo */}
              <div className="lg:hidden text-center mb-10 pt-4">
                <motion.div animate={{ y: [0,-8,0], rotate: [0, 4, -4, 0] }} transition={{ duration: 4, repeat: Infinity }} className="text-7xl mb-6 block drop-shadow-[0_10px_10px_rgba(0,0,0,0.15)]">
                  🏘️
                </motion.div>
                <h1 className="font-display font-black text-4xl mb-3 text-[#1e293b] tracking-tight leading-none">
                  Math <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF7052] to-[#FFCA42]">Village</span>
                </h1>
                <p className="text-slate-500 font-medium text-sm px-4">Join thousands of students and teachers in a gamified learning adventure!</p>
              </div>
              
              {/* Desktop Header */}
              <div className="hidden lg:block mb-10">
                <h2 className="font-display font-black text-4xl text-[#1e293b] mb-2">Get Started</h2>
                <p className="text-slate-500 font-medium font-sm">Select your role to continue</p>
              </div>

              <div className="space-y-4">
                {[
                  { r: 'student', icon: '🎒', title: 'Student', desc: 'Play & learn math!', color: '#FF7052', bg: '#FFF1EE' },
                  { r: 'teacher', icon: '👩‍🏫', title: 'Teacher', desc: 'Track class progress', color: '#5EDAD0', bg: '#E8F9F8' },
                ].map(({ r, icon, title, desc, color, bg }) => (
                  <motion.button key={r} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setRole(r); setMode('form'); }}
                    className="w-full group relative overflow-hidden rounded-[24px] p-5 sm:p-6 text-left transition-all bg-white shadow-[0_8px_20px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_15px_30px_-6px_rgba(0,0,0,0.12)] border border-slate-100 flex items-center gap-4 sm:gap-5"
                  >
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[20px] flex items-center justify-center text-3xl shrink-0 border border-white/50 shadow-inner" style={{ backgroundColor: bg }}>
                      {icon}
                    </div>
                    <div>
                      <h3 className="font-display text-2xl font-black text-[#1e293b] group-hover:text-[#FF7052] transition-colors mb-0.5">{title}</h3>
                      <p className="text-slate-500 text-xs sm:text-sm font-medium">{desc}</p>
                    </div>
                    <div className="absolute right-5 text-2xl opacity-100 lg:opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" style={{ color }}>→</div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── FORM ── */}
          {mode === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <button 
                onClick={() => setMode('select')} 
                className="flex items-center gap-1.5 text-slate-400 hover:text-[#FF7052] mb-6 text-xs font-black uppercase tracking-widest transition-colors"
              >
                ← Back to Roles
              </button>

              <div className="bg-white/90 lg:bg-white backdrop-blur-xl lg:backdrop-blur-none rounded-[32px] overflow-hidden border border-white/50 lg:border-slate-50 shadow-[0_8px_30px_rgb(0,0,0,0.08)] lg:shadow-lg">
                <div className="h-1.5" style={{ backgroundColor: role === 'student' ? '#FFCA42' : '#5EDAD0' }} />

                <div className="p-6 sm:p-8">
                  <div className="text-center mb-6">
                    <div className="text-4xl mb-3 drop-shadow-md">{role === 'student' ? '🎒' : '👩‍🏫'}</div>
                    <h2 className="font-display text-2xl font-black text-[#1e293b]">
                      {role === 'student' ? 'Student' : 'Teacher'} {tab === 'login' ? 'Welcome Back' : 'Join Us'}
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Enter your details below</p>
                  </div>

                  {/* Tabs */}
                  <div className="flex rounded-xl overflow-hidden mb-6 p-1 bg-[#F7F9FC] border border-slate-100">
                    {['login', 'signup'].map(t => (
                      <button key={t} onClick={() => setTab(t)}
                        className="flex-1 py-2.5 text-xs font-black rounded-lg transition-all duration-300 uppercase tracking-wider"
                        style={tab === t
                          ? { backgroundColor: 'white', color: '#1e293b', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }
                          : { color: '#94a3b8' }}>
                        {t === 'login' ? 'Login' : 'Sign Up'}
                      </button>
                    ))}
                  </div>

                  <motion.form onSubmit={handleSubmit}
                    animate={shake ? { x: [-8,8,-6,6,-3,3,0] } : {}}
                    transition={{ duration: 0.5 }}
                    className="space-y-4">

                    {/* Name (signup only) */}
                    {tab === 'signup' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Full Name</label>
                        <input type="text" placeholder="John Doe"
                          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          className="w-full rounded-xl px-4 py-3 text-sm text-[#1e293b] font-bold placeholder-slate-300 focus:outline-none transition-all bg-[#F7F9FC] border border-transparent focus:border-[#FFCA42]/30 focus:bg-white"
                        />
                      </motion.div>
                    )}

                    {/* Email */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Email Address</label>
                      <input type="email" placeholder="example@village.com"
                        value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        className="w-full rounded-xl px-4 py-3 text-sm text-[#1e293b] font-bold placeholder-slate-300 focus:outline-none transition-all bg-[#F7F9FC] border border-transparent focus:border-[#FFCA42]/30 focus:bg-white"
                      />
                    </div>

                    {/* Password */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Secret Password</label>
                      <input type="password" placeholder="••••••••"
                        value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        className="w-full rounded-xl px-4 py-3 text-sm text-[#1e293b] font-bold placeholder-slate-300 focus:outline-none transition-all bg-[#F7F9FC] border border-transparent focus:border-[#FFCA42]/30 focus:bg-white"
                      />
                    </div>

                    {/* Grade & Avatar (students signup only) */}
                    {role === 'student' && tab === 'signup' && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 pt-1">
                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Your Grade</label>
                          <div className="flex gap-2">
                            {GRADES.map(g => (
                              <button key={g} type="button"
                                onClick={() => setForm(f => ({ ...f, grade: g }))}
                                className="flex-1 py-2.5 rounded-xl text-xs font-black transition-all border-2"
                                style={form.grade === g
                                  ? { backgroundColor: '#FFCA42', borderColor: '#FFCA42', color: 'white' }
                                  : { backgroundColor: 'white', borderColor: '#F7F9FC', color: '#94a3b8' }}>
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">Village Avatar</label>
                          <div className="grid grid-cols-4 gap-2">
                            {AVATARS.map(av => (
                              <button key={av} type="button"
                                onClick={() => setForm(f => ({ ...f, avatar: av }))}
                                className="aspect-square rounded-xl flex items-center justify-center text-2xl transition-all border-[3px] shadow-sm"
                                style={form.avatar === av
                                  ? { backgroundColor: 'white', borderColor: '#FF7052', transform: 'scale(1.05)' }
                                  : { backgroundColor: '#F7F9FC', borderColor: 'transparent' }}>
                                {av}
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {error && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 text-xs font-black px-3 py-2.5 rounded-xl bg-red-50 text-red-500 border border-red-100 mt-2"
                      >
                        <span>⚠️</span> {error}
                      </motion.div>
                    )}

                    <motion.button type="submit" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      className="w-full mt-2 py-4 rounded-xl font-display font-black text-lg text-white shadow-md hover:shadow-lg transition-all"
                      style={{ 
                        backgroundColor: role === 'student' ? '#FF7052' : '#5EDAD0',
                        boxShadow: `0 8px 16px -4px ${role === 'student' ? 'rgba(255,112,82,0.3)' : 'rgba(94,218,208,0.3)'}`
                      }}>
                      {tab === 'login' ? 'Enter Village' : 'Begin Journey'}
                    </motion.button>
                  </motion.form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
