import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

function genQ() {
  const x=Math.floor(Math.random()*10)+1;
  const a=Math.floor(Math.random()*8)+1;
  const b=Math.floor(Math.random()*20)+1;
  // ax + b = c
  const c=a*x+b;
  return {a,b,c,x,equation:`${a}x + ${b} = ${c}`};
}

const DOOR_COLORS=['#818cf8','#f97316','#22c55e','#ec4899','#f59e0b'];

export default function AlgebraDungeon() {
  const [q,setQ]=useState(genQ());
  const [input,setInput]=useState('');
  const [score,setScore]=useState(0);
  const [doorsOpened,setDoorsOpened]=useState(0);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const [animDoor,setAnimDoor]=useState(false);
  const {addXP}=usePlayerStore();
  const inputRef=useRef(null);
  const TOTAL_DOORS=6;

  useEffect(()=>{if(gameState==='playing')inputRef.current?.focus();},[q,gameState]);
  useEffect(()=>{if(doorsOpened>=TOTAL_DOORS&&gameState==='playing'){setGameState('won');addXP(score,'Algebra Dungeon',score,Math.min(100,score));}},[doorsOpened]);

  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const val=parseInt(input,10);
    if(val===q.x){
      setAnimDoor(true);
      setTimeout(()=>{setAnimDoor(false);setDoorsOpened(d=>d+1);setScore(s=>s+25);setQ(genQ());setFeedback(null);},800);
      setFeedback({text:`🗝️ Door opened! x=${q.x}`,correct:true});
    }else{
      setFeedback({text:`❌ x = ${q.x}. Solve: ${q.equation}`,correct:false});
    }
    setInput('');
  };

  const color=DOOR_COLORS[doorsOpened%DOOR_COLORS.length];

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient">🗝️ Algebra Dungeon</h1>
        <div className="badge badge-primary text-xs">Grade 6</div>
      </div>
      <div className="w-full max-w-md glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className="hud-chip text-violet-400">Doors: {doorsOpened}/{TOTAL_DOORS}</div>
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-md">
          {/* Dungeon door */}
          <div className="glass-panel p-8 text-center mb-5 relative overflow-hidden"
            style={{background:'linear-gradient(180deg,rgba(15,10,30,0.8) 0%,rgba(30,41,59,0.7) 100%)'}}>
            <div className="absolute inset-0 opacity-10 text-9xl flex items-center justify-center select-none">🏰</div>

            <AnimatePresence mode="wait">
              <motion.div
                key={doorsOpened}
                initial={{rotateY:-90}} animate={{rotateY:animDoor?90:0}} transition={{duration:0.4}}
                className="w-24 h-36 rounded-t-xl border-4 mx-auto mb-4 flex items-center justify-center text-4xl shadow-2xl"
                style={{background:`linear-gradient(135deg,${color}33,${color}11)`,borderColor:`${color}66`}}>
                {animDoor?'🟢':'🔒'}
              </motion.div>
            </AnimatePresence>

            <p className="text-slate-400 text-sm mb-2">Solve for x to open the door:</p>
            <div className="text-3xl font-black text-gradient mb-2">{q.equation}</div>
            <div className="flex justify-center gap-1 mb-2">
              {Array.from({length:TOTAL_DOORS}).map((_,i)=>(
                <div key={i} className={`w-4 h-4 rounded-full border ${i<doorsOpened?'bg-emerald-400 border-emerald-400':'bg-white/10 border-white/20'}`}/>
              ))}
            </div>
            <p className="text-slate-500 text-xs">x = ?</p>
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
              placeholder="x = ?" className="flex-1 bg-white/8 border border-white/15 rounded-xl px-4 py-4 text-2xl font-bold text-center text-slate-100 focus:outline-none focus:border-primary/60"
              inputMode="numeric"/>
            <button type="submit" className="btn btn-primary px-6">🗝️ Open</button>
          </form>
        </div>
      )}

      {gameState==='won'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">🏰</div>
          <h2 className="font-display text-3xl font-bold mb-3">Dungeon Cleared!</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setDoorsOpened(0);setGameState('playing');setQ(genQ());setInput('');}} className="btn btn-primary flex-1">🔄 New Dungeon</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
