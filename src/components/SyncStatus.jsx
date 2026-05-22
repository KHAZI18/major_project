import { useSyncStore } from '../store/useSyncStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { motion } from 'framer-motion';
import { flushPendingSyncWrites } from '../lib/db';
import { useEffect, useRef, useState } from 'react';

const CFG = {
  syncnow: { color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe', label: 'Sync', dot: true },
  synced:  { color: '#10b981', bg: '#f0fdf4', border: '#d1fae5', label: 'Synced', dot: false },
  syncing: { color: '#3b82f6', bg: '#eff6ff', border: '#dbeafe', label: 'Syncing', dot: false, spin: true },
  offline: { color: '#f97316', bg: '#fff7ed', border: '#fed7aa', label: 'Offline', dot: false },
  error:   { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', label: 'Error',   dot: true },
  partial: { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', label: 'Partial', dot: true },
};

export default function SyncStatus() {
  const { status, queueCount, lastSynced, setStatus } = useSyncStore();
  const { xp, score } = usePlayerStore();
  const prevXP = useRef(xp);
  const prevScore = useRef(score);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (xp !== prevXP.current || score !== prevScore.current) {
      setDirty(true);
      prevXP.current = xp;
      prevScore.current = score;
    }
  }, [xp, score]);

  useEffect(() => {
    if (status === 'synced') setDirty(false);
  }, [status]);

  const handleClick = async () => {
    await flushPendingSyncWrites();
    sessionStorage.setItem('mv_sync_after_reload', '1');
    window.location.reload();
  };

  const key = dirty && status === 'synced' ? 'syncnow' : status;
  const c = CFG[key] || CFG.synced;

  return (
    <motion.button
      onClick={handleClick}
      whileTap={{ scale: 0.94 }}
      title={`${c.label}${queueCount > 0 ? ` · ${queueCount} pending` : ''}${lastSynced ? `\nLast: ${new Date(lastSynced).toLocaleTimeString()}` : ''}`}
      className="h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-[12px] font-semibold transition-colors duration-150 cursor-pointer"
      style={{ background: c.bg, borderColor: c.border, color: c.color }}
    >
      {/* Animated icon */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={c.spin ? 'animate-spin' : ''}>
        {key === 'synced'
          ? <><polyline points="20 6 9 17 4 12"/></>
          : key === 'offline'
            ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>
            : <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></>
        }
      </svg>
      <span className="hidden sm:inline leading-none">{c.label}</span>
      {c.dot && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.color }} />
      )}
      {queueCount > 0 && (
        <span className="flex items-center justify-center min-w-[16px] h-4 rounded-full bg-orange-500 text-white text-[9px] font-bold px-1 leading-none">
          {queueCount}
        </span>
      )}
    </motion.button>
  );
}
