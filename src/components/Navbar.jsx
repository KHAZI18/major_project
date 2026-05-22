import { useState, useEffect, useRef } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { Link, useLocation } from 'react-router-dom';
import SyncStatus from './SyncStatus';

const STUDENT_LINKS = [
  { label: 'Dashboard', path: '/student', icon: 'home' },
  { label: 'Leaderboard', path: '/student/leaderboard', icon: 'trophy' },
  { label: 'Profile', path: '/student/profile', icon: 'user' },
];

const TEACHER_LINKS = [
  { label: 'Dashboard', path: '/teacher', icon: 'grid' },
];

const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></>,
  trophy: <><path d="M6 4h12v5a6 6 0 0 1-12 0V4Z"/><path d="M8 21h8"/><path d="M12 15v6"/><path d="M6 7H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 7h1.5a2.5 2.5 0 0 0 0-5H18"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>,
  menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  spark: <><path d="M12 2v5"/><path d="M12 17v5"/><path d="m4.22 4.22 3.54 3.54"/><path d="m16.24 16.24 3.54 3.54"/><path d="M2 12h5"/><path d="M17 12h5"/><path d="m4.22 19.78 3.54-3.54"/><path d="m16.24 7.76 3.54-3.54"/></>,
};

function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function Navbar() {
  const { xp, level, coins, streak, avatar } = usePlayerStore();
  const { role, user, logout } = useAuthStore();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!role) return null;

  const isStudent = role === 'student';
  const isTeacher = role === 'teacher';
  const links = isStudent ? STUDENT_LINKS : TEACHER_LINKS;
  const firstName = user?.name?.split(' ')[0] || (isTeacher ? 'Teacher' : 'Student');
  const homePath = isStudent ? '/student' : '/teacher';
  const accentColor = isTeacher ? '#0f766e' : '#ea580c';
  const accentGradient = isTeacher
    ? 'linear-gradient(135deg, #0f766e, #14b8a6)'
    : 'linear-gradient(135deg, #f59e0b, #f97316)';

  const xpFor = (lvl) => Math.pow(lvl, 2) * 100;
  const xpPrev = xpFor(Math.max(1, level - 1));
  const progressPct = Math.max(0, Math.min(100, Math.round(((xp - xpPrev) / (xpFor(level) - xpPrev)) * 100))) || 0;
  const xpToNext = Math.max(0, xpFor(level) - xp);
  const gradeLabel = isStudent ? `Grade ${user?.grade || '-'}` : 'Teacher';
  const avatarValue = isStudent ? (avatar || 'ST') : (user?.avatar || 'TR');

  return (
    <>
      <Motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className={`sticky top-0 z-50 border-b transition-all duration-300 ${
          scrolled
            ? 'bg-white/90 border-slate-200 shadow-[0_14px_30px_rgba(15,23,42,0.08)]'
            : 'bg-white/78 border-white/70 shadow-sm'
        }`}
        style={{
          backdropFilter: 'blur(18px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <Link to={homePath} className="group flex shrink-0 items-center gap-3 no-underline" aria-label="Math Village dashboard">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-[0_8px_18px_rgba(249,115,22,0.24)]" style={{ background: accentGradient }}>
                <Icon name="spark" size={19} />
              </div>
              <div className="hidden sm:block">
                <p className="font-display text-[18px] font-extrabold leading-none text-slate-900">Math Village</p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{gradeLabel}</p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 rounded-xl bg-slate-100/70 p-1 md:flex" aria-label="Primary navigation">
              {links.map((link) => {
                const active = location.pathname === link.path;
                return (
                  <Link key={link.path} to={link.path} className="relative no-underline">
                    <span className={`relative z-10 flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                      active ? 'text-slate-950' : 'text-slate-500 hover:text-slate-800'
                    }`}>
                      <Icon name={link.icon} size={16} className={active ? 'text-slate-800' : 'text-slate-400'} />
                      {link.label}
                    </span>
                    {active && (
                      <Motion.span
                        layoutId="student-navbar-active"
                        className="absolute inset-0 rounded-lg bg-white shadow-sm"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isTeacher && (
              <div className="hidden h-9 items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 text-[12px] font-semibold text-teal-700 lg:flex">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                Live Dashboard
              </div>
            )}

            <SyncStatus />

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((value) => !value)}
                className={`flex h-10 items-center gap-2 rounded-xl border pl-1.5 pr-2 transition-all ${
                  profileOpen
                    ? 'border-slate-300 bg-white shadow-sm'
                    : 'border-slate-200 bg-white/75 hover:border-slate-300 hover:bg-white'
                }`}
                aria-expanded={profileOpen}
                aria-label="Open account menu"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-slate-800" style={{ background: isTeacher ? '#ccfbf1' : '#fef3c7' }}>
                  {avatarValue}
                </div>
                <div className="hidden max-w-[96px] text-left sm:block">
                  <p className="truncate text-[13px] font-bold leading-tight text-slate-800">{firstName}</p>
                  <p className="truncate text-[11px] font-semibold leading-tight text-slate-400">{isStudent ? `Level ${level}` : 'Account'}</p>
                </div>
                <Icon name="chevron" size={14} className={`hidden text-slate-400 transition-transform sm:block ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <Motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
                  >
                    <div className="border-b border-slate-100 p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-slate-800" style={{ background: isTeacher ? '#ccfbf1' : '#fef3c7' }}>
                          {avatarValue}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{user?.name || firstName}</p>
                          <p className="text-xs font-medium text-slate-500">{isStudent ? `${gradeLabel} · Level ${level}` : 'Teacher Account'}</p>
                        </div>
                      </div>

                      {isStudent && (
                        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Next level</span>
                            <span className="text-[11px] font-bold text-orange-600 tabular-nums">{xpToNext} XP left</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: accentGradient }} />
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div><p className="text-[10px] font-semibold uppercase text-slate-400">XP</p><p className="text-xs font-bold text-slate-800 tabular-nums">{xp.toLocaleString()}</p></div>
                            <div><p className="text-[10px] font-semibold uppercase text-slate-400">Coins</p><p className="text-xs font-bold text-slate-800 tabular-nums">{coins.toLocaleString()}</p></div>
                            <div><p className="text-[10px] font-semibold uppercase text-slate-400">Streak</p><p className="text-xs font-bold text-slate-800 tabular-nums">{streak || 0}</p></div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-2">
                      {isStudent && (
                        <Link to="/student/profile" className="no-underline" onClick={() => setProfileOpen(false)}>
                          <span className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
                            <Icon name="user" size={16} className="text-slate-400" />
                            View Profile
                          </span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          logout();
                        }}
                        className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Icon name="logout" size={16} />
                        Sign Out
                      </button>
                    </div>
                  </Motion.div>
                )}
              </AnimatePresence>
            </div>

            {links.length > 1 && (
              <button
                type="button"
                onClick={() => setMobileOpen((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/75 text-slate-600 transition-colors hover:bg-white md:hidden"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileOpen}
              >
                <Icon name={mobileOpen ? 'x' : 'menu'} size={19} />
              </button>
            )}
          </div>
        </div>
      </Motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[2px] md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <Motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="fixed left-3 right-3 top-[74px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] md:hidden"
            >
              <nav className="p-2" aria-label="Mobile navigation">
                {links.map((link) => {
                  const active = location.pathname === link.path;
                  return (
                    <Link key={link.path} to={link.path} className="no-underline" onClick={() => setMobileOpen(false)}>
                      <span className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] font-bold transition-colors ${
                        active ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}>
                        <Icon name={link.icon} size={18} className={active ? 'text-slate-800' : 'text-slate-400'} />
                        {link.label}
                        {active && <span className="ml-auto h-2 w-2 rounded-full" style={{ background: accentColor }} />}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </Motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
