import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import BadgeDisplay from '../components/BadgeDisplay';

const AVATARS=['🧒','👧','👦','🧑','👩','👨','🧒🏽','👧🏽'];

export default function Profile() {
  const player=usePlayerStore();
  const {user,updateUser}=useAuthStore();
  const xpForLevel=(lvl)=>Math.pow(lvl,2)*100;
  const xpForPrev=(lvl)=>Math.pow(Math.max(1,lvl-1),2)*100;
  const pct=Math.min(100,Math.round(((player.xp-xpForPrev(player.level))/(xpForLevel(player.level)-xpForPrev(player.level)))*100))||0;

  return(
    <div className="pb-12 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-2xl font-bold">👤 My Profile</h1>
      </div>

      {/* Hero card */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="glass-panel p-6 mb-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 text-[10rem] flex items-center justify-center select-none">🏘️</div>
        <div className="text-7xl mb-3">{player.avatar}</div>
        <h2 className="font-display text-3xl font-bold mb-1">{user?.name||'Learner'}</h2>
        <p className="text-slate-400 mb-3">Grade {user?.grade||2} • Level {player.level} Explorer</p>
        <div className="flex justify-center gap-3 flex-wrap mb-4">
          {[
            {label:'XP',val:player.xp.toLocaleString(),icon:'⭐',color:'text-primary'},
            {label:'Coins',val:player.coins.toLocaleString(),icon:'🪙',color:'text-yellow-400'},
            {label:'Streak',val:player.streak,icon:'🔥',color:'text-orange-400'},
            {label:'Games',val:player.gamesPlayed,icon:'🎮',color:'text-emerald-400'},
          ].map(s=>(
            <div key={s.label} className="text-center bg-white/5 rounded-xl px-4 py-3">
              <div className={`text-xl font-bold ${s.color}`}>{s.icon} {s.val}</div>
              <div className="text-xs text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="progress-bar" style={{height:'8px'}}>
          <motion.div className="progress-fill h-full" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:1}}/>
        </div>
        <p className="text-xs text-slate-500 mt-1">{xpForLevel(player.level)-player.xp} XP to Level {player.level+1}</p>
      </motion.div>

      {/* Avatar picker */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="glass-panel p-5 mb-6">
        <h3 className="font-display font-bold text-lg mb-4">🎭 Change Avatar</h3>
        <div className="flex gap-3 flex-wrap">
          {AVATARS.map(av=>(
            <button key={av} onClick={()=>player.setAvatar(av)}
              className={`w-14 h-14 rounded-xl text-3xl flex items-center justify-center border-2 transition-all ${
                player.avatar===av?'border-primary bg-primary/20 scale-110':'border-white/10 bg-white/5 hover:border-white/30'}`}>
              {av}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Recent history */}
      {player.history.length>0&&(
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.15}} className="glass-panel p-5 mb-6">
          <h3 className="font-display font-bold text-lg mb-4">📜 Game History</h3>
          <div className="space-y-2">
            {player.history.slice(0,10).map((h,i)=>(
              <div key={i} className="flex items-center gap-3 text-sm border-b border-white/5 pb-2">
                <span className="text-xl">🎮</span>
                <span className="flex-1 text-slate-300 truncate">{h.gameName}</span>
                <span className="text-slate-500 text-xs">{new Date(h.date).toLocaleDateString()}</span>
                <span className="text-primary font-semibold">+{h.xpEarned}XP</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Badges */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}}>
        <BadgeDisplay/>
      </motion.div>
    </div>
  );
}
