import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

function genQ() {
  const denoms=[2,3,4,5,6,8];
  const denom=denoms[Math.floor(Math.random()*denoms.length)];
  const numer=Math.floor(Math.random()*(denom-1))+1;
  const slashColors=['🟥','🟧','🟨','🟩','🟦','🟪'];
  return {numer,denom,slashColors};
}

const ROTI_EMOJIS=['🫓','🍕','🥞','🍩','🎂','🥐'];

export default function FractionNinja() {
  const [q,setQ]=useState(genQ());
  const [roti]=useState(ROTI_EMOJIS[Math.floor(Math.random()*ROTI_EMOJIS.length)]);
  const [score,setScore]=useState(0);
  const [round,setRound]=useState(1);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const [slashed,setSlashed]=useState(new Set());
  const {addXP}=usePlayerStore();
  const TOTAL=8;

  const sections=q.denom;
  const target=q.numer;

  const handleSlash=(i)=>{
    if(slashed.has(i)){
      setSlashed(s=>{const n=new Set(s);n.delete(i);return n;});
    }else{
      setSlashed(s=>new Set([...s,i]));
    }
  };

  const handleSubmit=()=>{
    const correct=slashed.size===target;
    if(correct){
      setScore(s=>s+25);setFeedback({text:'🥷 Perfect Cut!',correct:true});
    }else{
      setFeedback({text:`❌ Need ${target} slices, you cut ${slashed.size}`,correct:false});
    }
    setTimeout(()=>{
      if(round>=TOTAL){
        setGameState('won');
        addXP(score+(correct?25:0),'Fraction Ninja',score,Math.min(100,score));
      }else{
        setRound(r=>r+1);setQ(genQ());setSlashed(new Set());setFeedback(null);
      }
    },900);
  };

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient">🥷 Fraction Ninja</h1>
        <div className="badge badge-success text-xs">Grade 3-4</div>
      </div>
      <div className="w-full max-w-md glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className="hud-chip text-emerald-400">Round {round}/{TOTAL}</div>
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-md">
          <div className="glass-panel p-6 text-center mb-5"
            style={{background:'linear-gradient(180deg,rgba(109,40,217,0.2) 0%,rgba(30,41,59,0.7) 100%)'}}>
            <p className="text-slate-400 text-sm mb-2">🍕 Tap to slice <strong className="text-white">{target}/{sections}</strong> of the roti</p>
            <div className="text-7xl mb-4 select-none">{roti}</div>
            <div className="flex justify-center gap-2 flex-wrap mb-3">
              {Array.from({length:sections}).map((_,i)=>(
                <motion.button
                  key={i}
                  whileTap={{scale:0.85}}
                  onClick={()=>handleSlash(i)}
                  className={`w-12 h-12 rounded-xl text-xl border-2 transition-all font-bold ${
                    slashed.has(i)
                      ?'bg-violet-500/50 border-violet-400 text-white'
                      :'bg-white/10 border-white/15 text-slate-400 hover:border-violet-400/50'
                  }`}>
                  {slashed.has(i)?'✂️':'○'}
                </motion.button>
              ))}
            </div>
            <p className="text-slate-400 text-xs">Sliced: {slashed.size} / {sections}</p>
          </div>

          <AnimatePresence>
            {feedback&&(
              <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className={`text-center font-bold mb-3 text-lg ${feedback.correct?'text-emerald-400':'text-red-400'}`}>
                {feedback.text}
              </motion.p>
            )}
          </AnimatePresence>

          <button onClick={handleSubmit} className="btn btn-primary w-full py-4 text-lg">
            🥷 Submit Slice!
          </button>
        </div>
      )}

      {gameState==='won'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">🥷</div>
          <h2 className="font-display text-3xl font-bold mb-3">Ninja Master!</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setRound(1);setGameState('playing');setQ(genQ());setSlashed(new Set());}} className="btn btn-primary flex-1">🔄 Again</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
