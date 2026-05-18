import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

function genQ() {
  const a=Math.floor(Math.random()*9)+2;
  const b=Math.floor(Math.random()*9)+2;
  return {a,b,answer:a*b};
}

export default function MathRacing() {
  const [q,setQ]=useState(genQ());
  const [input,setInput]=useState('');
  const [cartPos,setCartPos]=useState(0);
  const [score,setScore]=useState(0);
  const [timeLeft,setTimeLeft]=useState(60);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const {addXP}=usePlayerStore();
  const inputRef=useRef(null);
  const MAX=100;

  useEffect(()=>{if(gameState==='playing')inputRef.current?.focus();},[q,gameState]);
  useEffect(()=>{
    if(gameState!=='playing')return;
    const t=setInterval(()=>setTimeLeft(t=>{if(t<=1){setGameState('lost');return 0;}return t-1;}),1000);
    return()=>clearInterval(t);
  },[gameState]);
  useEffect(()=>{
    if(cartPos>=MAX)setGameState('won');
  },[cartPos]);
  useEffect(()=>{if(gameState!=='playing')addXP(score+cartPos,'Math Racing',score+cartPos,Math.min(100,score));},[gameState]);

  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const val=parseInt(input,10);
    if(val===q.answer){
      setCartPos(p=>Math.min(MAX,p+10));
      setScore(s=>s+15);
      setFeedback({text:'🐂 Faster!',correct:true});
    }else{
      setFeedback({text:`❌ ${q.a}×${q.b}=${q.answer}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},500);
  };

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient-orange">🐂 Math Racing</h1>
        <div className="badge badge-orange text-xs">Grade 3</div>
      </div>
      <div className="w-full max-w-md glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className={`hud-chip font-bold ${timeLeft<=10?'text-red-400 animate-pulse':'text-emerald-400'}`}>⏱ {timeLeft}s</div>
        <div className="hud-chip text-emerald-400">{cartPos}%</div>
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-md">
          {/* Race track */}
          <div className="glass-panel p-5 mb-5" style={{background:'linear-gradient(180deg,rgba(120,53,15,0.3) 0%,rgba(30,41,59,0.7) 100%)'}}>
            <p className="text-slate-400 text-xs mb-2 text-center">🏁 Reach the finish line!</p>
            <div className="w-full h-10 bg-amber-900/30 rounded-full border border-amber-700/30 relative overflow-hidden mb-3">
              <div className="absolute inset-y-0 left-2 right-2 flex items-center">
                <div className="w-full bg-amber-800/20 h-1 rounded-full"/>
              </div>
              <motion.div
                className="absolute top-1 text-2xl"
                animate={{left:`${Math.max(2,cartPos-5)}%`}}
                transition={{type:'spring',damping:20}}>
                🛒
              </motion.div>
              <div className="absolute right-2 top-1.5 text-xl">🏁</div>
            </div>
            <div className="progress-bar" style={{height:'6px'}}>
              <motion.div className="h-full rounded-full" style={{background:'linear-gradient(90deg,#f97316,#fbbf24)'}}
                animate={{width:`${cartPos}%`}} transition={{duration:0.5}}/>
            </div>
          </div>

          <div className="glass-panel p-6 text-center mb-5">
            <p className="text-slate-400 text-sm mb-2">Answer correctly to speed up!</p>
            <div className="text-5xl font-black text-gradient mb-1">{q.a} × {q.b} = ?</div>
          </div>

          <AnimatePresence>
            {feedback&&(
              <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className={`text-center font-bold mb-3 ${feedback.correct?'text-emerald-400':'text-red-400'}`}>
                {feedback.text}
              </motion.p>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="flex gap-3">
            <input ref={inputRef} type="number" value={input} onChange={e=>setInput(e.target.value)}
              placeholder="Answer..." className="flex-1 bg-white/8 border border-white/15 rounded-xl px-4 py-4 text-2xl font-bold text-center text-slate-100 focus:outline-none focus:border-primary/60"
              inputMode="numeric"/>
            <button type="submit" className="btn btn-village text-lg px-6">Go!</button>
          </form>
        </div>
      )}

      {gameState!=='playing'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">{gameState==='won'?'🏆':'🛒'}</div>
          <h2 className="font-display text-3xl font-bold mb-3">{gameState==='won'?'Winner!':'Times Up!'}</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setTimeLeft(60);setCartPos(0);setGameState('playing');setQ(genQ());setInput('');}} className="btn btn-primary flex-1">🔄 Race Again</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
