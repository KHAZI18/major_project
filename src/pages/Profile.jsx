import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import BadgeDisplay from '../components/BadgeDisplay';

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
  'algebra-dungeon': 'Algebra Dungeon'
};

const AVATARS=['🧒','👧','👦','🧑','👩','👨','🧒🏽','👧🏽'];

export default function Profile() {
  const player=usePlayerStore();
  const {user, updateUser, deleteAccount} = useAuthStore();
  const xpForLevel=(lvl)=>Math.pow(lvl,2)*100;
  const xpForPrev=(lvl)=>Math.pow(Math.max(1,lvl-1),2)*100;
  const pct=Math.min(100,Math.round(((player.xp-xpForPrev(player.level))/(xpForLevel(player.level)-xpForPrev(player.level)))*100))||0;

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm('Are you sure you want to delete your account? This action cannot be undone.');
    if (!confirmDelete) return;

    try {
      const result = await deleteAccount();
      if (result && result.success) {
        alert('Account deleted successfully.');
        window.location.href = '/login';
      } else {
        console.error('Delete failed:', result?.error);
        alert('Failed to delete account. Please try again.');
      }
    } catch (e) {
      console.error('Unexpected error deleting account:', e);
      alert('Failed to delete account. Please try again.');
    }
  };

  

  return(
    <div className="pb-12 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/student" className="btn btn-soft btn-sm bg-white shadow-sm font-bold text-slate-700 hover:bg-slate-50">← Back</Link>
        <h1 className="font-display text-2xl font-bold text-slate-800">👤 My Profile</h1>
      </div>

      {/* Hero card */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="bg-white rounded-[32px] shadow-[0_10px_25px_-5px_rgba(0,0,0,0.05)] p-6 mb-6 text-center relative pointer-events-auto border border-slate-100">
        <div className="absolute inset-0 opacity-[0.03] text-[10rem] flex items-center justify-center select-none overflow-hidden">🏘️</div>
        <div className="text-7xl mb-3 relative z-10">{player.avatar}</div>
        <h2 className="font-display text-3xl font-bold mb-1 text-slate-800 relative z-10">{user?.name||'Learner'}</h2>
        <p className="text-slate-500 mb-3 relative z-10">Grade {user?.grade||2} • Level {player.level} Explorer</p>
        <div className="flex justify-center gap-3 flex-wrap mb-4 relative z-10">
          {[
            {label:'XP',val:player.xp.toLocaleString(),icon:'⭐',color:'text-primary'},
            {label:'Coins',val:player.coins.toLocaleString(),icon:'🪙',color:'text-yellow-500'},
            {label:'Streak',val:player.streak,icon:'🔥',color:'text-orange-500'},
            {label:'Games',val:player.gamesPlayed,icon:'🎮',color:'text-emerald-500'},
          ].map(s=>(
            <div key={s.label} className="text-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
              <div className={`text-xl font-bold ${s.color}`}>{s.icon} {s.val}</div>
              <div className="text-xs text-slate-600 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="progress-bar bg-slate-100 relative z-10" style={{height:'8px'}}>
          <motion.div className="progress-fill h-full bg-gradient-to-r from-primary to-orange-400" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:1}}/>
        </div>
        <p className="text-xs text-slate-500 mt-1 relative z-10 font-medium">{xpForLevel(player.level)-player.xp} XP to Level {player.level+1}</p>
      </motion.div>

      {/* Avatar picker */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}} className="bg-white rounded-3xl p-5 mb-6 shadow-sm border border-slate-100">
        <h3 className="font-display font-bold text-lg mb-4 text-slate-800">🎭 Change Avatar</h3>
        <div className="flex gap-3 flex-wrap">
          {AVATARS.map(av=>(
            <button key={av} onClick={()=>player.setAvatar(av)}
              className={`w-14 h-14 rounded-xl text-3xl flex items-center justify-center border-2 transition-all ${
                player.avatar===av?'border-primary bg-primary/10 shadow-sm scale-110':'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
              {av}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Recent history */}
      {player.history.length>0&&(
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.15}} className="bg-white rounded-3xl p-5 mb-6 shadow-sm border border-slate-100">
          <h3 className="font-display font-bold text-lg mb-4 text-slate-800">📜 Game History</h3>
          <div className="space-y-2">
            {player.history.slice(0,10).map((h,i)=>{
              const resolvedName = h.gameName || (h.gameId && GAME_ID_TO_NAME[h.gameId]) || h.gameId || 'Game Session';
              const rawDate = h.date || h.timestamp;
              const dateStr = rawDate ? new Date(rawDate).toLocaleDateString() : '';
              const xp = h.xpEarned != null ? h.xpEarned : (h.xp || 0);
              return (
                <div key={i} className="flex items-center gap-3 text-sm border-b border-slate-100 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                  <span className="text-xl p-1 bg-slate-50 rounded-lg">🎮</span>
                  <span className="flex-1 text-slate-700 font-medium truncate">{resolvedName}</span>
                  {dateStr && <span className="text-slate-500 text-xs font-semibold bg-slate-100 px-2 py-1 rounded-full">{dateStr}</span>}
                  <span className="text-emerald-500 font-bold bg-emerald-50 px-2 py-1 rounded-full">+{xp}XP</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Badges */}
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}}>
        <BadgeDisplay/>
      </motion.div>

      <div className="text-center mt-6">
        <button 
          onClick={handleDeleteAccount} 
          className="btn btn-danger bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">
          Delete Account
        </button>
      </div>
    </div>
  );
}
