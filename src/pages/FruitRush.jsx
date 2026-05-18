import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

function genQ() {
  const fruits = ['🍎','🍌','🍊','🥭','🍇'];
  const a = Math.floor(Math.random()*12)+1;
  const b = Math.floor(Math.random()*12)+1;
  return { a, b, answer: a+b, fruitA: fruits[Math.floor(Math.random()*fruits.length)], fruitB: fruits[Math.floor(Math.random()*fruits.length)] };
}

export default function FruitRush() {
  const [q,setQ]=useState(genQ());
  const [input,setInput]=useState('');
  const [score,setScore]=useState(0);
  const [timeLeft,setTimeLeft]=useState(45);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const [combo,setCombo]=useState(0);
  const {addXP}=usePlayerStore();
  const inputRef=useRef(null);

  useEffect(()=>{if(gameState==='playing')inputRef.current?.focus();},[q,gameState]);
  useEffect(()=>{
    if(gameState!=='playing')return;
    const t=setInterval(()=>setTimeLeft(t=>{if(t<=1){setGameState('lost');return 0;}return t-1;}),1000);
    return()=>clearInterval(t);
  },[gameState]);
  useEffect(()=>{if(gameState!=='playing')addXP(Math.floor(score/2),'Fruit Rush',score,Math.min(100,score));},[gameState]);

  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const val=parseInt(input,10);
    if(val===q.answer){
      const pts=10+combo*2;setScore(s=>s+pts);setCombo(c=>c+1);
      setFeedback({text:`✅ Correct! +${pts}`,correct:true});
    }else{
      setCombo(0);setFeedback({text:`❌ Answer: ${q.answer}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ());},500);
  };

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient-orange">🍎 Fruit Rush</h1>
        <div className="badge badge-success text-xs">Grade 2-3</div>
      </div>
      <div className="w-full max-w-md glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className={`hud-chip font-bold ${timeLeft<=10?'text-red-400 animate-pulse':'text-emerald-400'}`}>⏱ {timeLeft}s</div>
        {combo>=2&&<div className="hud-chip text-orange-400">🔥 {combo}x</div>}
      </div>
      {gameState==='playing'&&(
        <div className="w-full max-w-md">
          <div className="glass-panel p-8 text-center mb-5"
            style={{background:'linear-gradient(180deg,rgba(20,83,45,0.3) 0%,rgba(30,41,59,0.7) 100%)'}}>
            <p className="text-slate-400 text-sm mb-4">🏪 The fruit stall has:</p>
            <div className="flex items-center justify-center gap-4 text-5xl mb-3">
              <div className="text-center">
                <div>{q.fruitA}</div>
                <div className="font-black text-3xl text-yellow-400">{q.a}</div>
              </div>
              <div className="text-4xl text-white font-black">+</div>
              <div className="text-center">
                <div>{q.fruitB}</div>
                <div className="font-black text-3xl text-yellow-400">{q.b}</div>
              </div>
            </div>
            <p className="text-slate-300 text-lg font-semibold">Total fruits = ?</p>
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
              placeholder="Type answer..." className="flex-1 bg-white/8 border border-white/15 rounded-xl px-4 py-4 text-2xl font-bold text-center text-slate-100 focus:outline-none focus:border-primary/60"
              inputMode="numeric"/>
            <button type="submit" className="btn btn-success text-lg px-6">✓</button>
          </form>
        </div>
      )}
      {gameState!=='playing'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">{score>=80?'🎉':'🍎'}</div>
          <h2 className="font-display text-3xl font-bold mb-3">{score>=80?'Excellent!':'Game Over'}</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong> | XP: <strong className="text-yellow-400">+{Math.floor(score/2)}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setTimeLeft(45);setCombo(0);setGameState('playing');setQ(genQ());setInput('');}} className="btn btn-primary flex-1">🔄 Again</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
