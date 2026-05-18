import { useSyncStore } from '../store/useSyncStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
  synced:  { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Synced',   iconEl: '🟢' },
  syncing: { icon: RefreshCw,   color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30',       label: 'Syncing', iconEl: '🔄' },
  offline: { icon: WifiOff,     color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30',   label: 'Offline', iconEl: '🟠' },
  error:   { icon: AlertCircle, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         label: 'Error',   iconEl: '🔴' },
  partial: { icon: AlertCircle, color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/30',   label: 'Partial', iconEl: '🟡' },
};

export default function SyncStatus() {
  const { status, queueCount, lastSynced } = useSyncStore();
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.synced;
  const Icon = cfg.icon;

  return (
    <motion.div
      className={`hud-chip text-xs border ${cfg.bg} ${cfg.color} cursor-default`}
      title={`Sync: ${cfg.label}${queueCount > 0 ? ` • ${queueCount} pending` : ''}${lastSynced ? `\nLast synced: ${new Date(lastSynced).toLocaleTimeString()}` : ''}`}
      animate={status === 'syncing' ? { opacity: [1, 0.6, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1 }}
    >
      <Icon size={12} className={status === 'syncing' ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{cfg.label}</span>
      {queueCount > 0 && <span className="bg-orange-500 text-white rounded-full px-1 text-xs">{queueCount}</span>}
    </motion.div>
  );
}
