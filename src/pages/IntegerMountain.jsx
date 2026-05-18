import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

function genQ() {
  const ops=['+','-'];
  const op=ops[Math.floor(Math.random()*2)];
  const a=Math.floor(Math.random()*20)-10;
  const b=Math.floor(Math.random()*20)-10;
  const answer=op==='+'?a+b:a-b;
  return {a,b,op,answer};
}

const MOUNTAIN_HEIGHT=10;

export default function IntegerMountain() {
  const [q,setQ]=useState(genQ());
  const [position,setPosition]=useState(5);
  const [score,setScore]=useState(0);
  const [timeLeft,setTimeLeft]=useState(60);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const {addXP}=usePlayerStore();
  const inputRef=useRef(null);
  const [input,setInput]=useState('');

  useEffect(()=>{if(gameState==='playing')inputRef.current?.focus();},[q,gameState]);
  useEffect(()=>{
    if(gameState!=='playing')return;
    const t=setInterval(()=>setTimeLeft(t=>{if(t<=1){setGameState('lost');return 0;}return t-1;}),1000);
    return()=>clearInterval(t);
  },[gameState]);
  useEffect(()=>{if(position>=MOUNTAIN_HEIGHT)setGameState('won');},[position]);
  useEffect(()=>{if(gameState!=='playing')addXP(score,'Integer Mountain',score,Math.min(100,score));},[gameState]);

  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const val=parseInt(input,10);
    if(val===q.answer){
      setPosition(p=>Math.min(MOUNTAIN_HEIGHT,p+1));
      setScore(s=>s+20);
      setFeedback({text:'⛰️ Climb!',correct:true});
    }else{
      setPosition(p=>Math.max(0,p-1));
      setFeedback({text:`❌ Was ${q.answer}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},500);
  };

  const cliffPos=Math.round((position/MOUNTAIN_HEIGHT)*100);

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient">⛰️ Integer Mountain</h1>
        <div className="badge badge-primary text-xs">Grade 6</div>
      </div>
      <div className="w-full max-w-md glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className={`hud-chip font-bold ${timeLeft<=10?'text-red-400 animate-pulse':'text-emerald-400'}`}>⏱ {timeLeft}s</div>
        <div className="hud-chip text-violet-400">Height: {position}/{MOUNTAIN_HEIGHT}</div>
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-md">
          {/* Mountain visual */}
          <div className="glass-panel p-5 mb-5 relative overflow-hidden"
            style={{background:'linear-gradient(180deg,rgba(30,27,75,0.6) 0%,rgba(15,23,42,0.8) 100%)'}}>
            <div className="text-center mb-2">
              <span className="text-xs text-slate-400">🏔️ Summit</span>
            </div>
            <div className="relative h-28 flex items-end">
              {/* Mountain shape */}
              <svg viewBox="0 0 200 100" className="absolute inset-0 w-full h-full opacity-20">
                <polygon points="100,5 180,95 20,95" fill="#818cf8"/>
              </svg>
              {/* Climber */}
              <motion.div
                className="absolute text-2xl"
                animate={{bottom:`${Math.max(5,cliffPos-5)}%`, left:'45%'}}
                transition={{type:'spring',damping:15}}>
                🧗
              </motion.div>
            </div>
            <div className="progress-bar mt-2" style={{height:'8px'}}>
              <motion.div className="h-full rounded-full"
                style={{background:'linear-gradient(90deg,#818cf8,#c084fc)'}}
                animate={{width:`${cliffPos}%`}} transition={{duration:0.5}}/>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>🏕️ Base</span><span>🏔️ Peak</span>
            </div>
          </div>

          <div className="glass-panel p-6 text-center mb-4">
            <p className="text-slate-400 text-sm mb-2">Solve the integer problem:</p>
            <div className="text-4xl font-black text-gradient mb-2">
              ({q.a}) {q.op} ({q.b}) = ?
            </div>
            <p className="text-slate-500 text-xs">Negative numbers go DOWN the mountain!</p>
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
              placeholder="Answer (can be negative)..." className="flex-1 bg-white/8 border border-white/15 rounded-xl px-4 py-4 text-xl font-bold text-center text-slate-100 focus:outline-none focus:border-primary/60"
              inputMode="numeric"/>
            <button type="submit" className="btn btn-primary px-6">Climb!</button>
          </form>
        </div>
      )}

      {gameState!=='playing'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">{gameState==='won'?'🏔️':'⛺'}</div>
          <h2 className="font-display text-3xl font-bold mb-3">{gameState==='won'?'Summit Reached!':'Times Up!'}</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setTimeLeft(60);setPosition(5);setGameState('playing');setQ(genQ());setInput('');}} className="btn btn-primary flex-1">🔄 Climb Again</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
