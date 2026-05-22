import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('DecimalMall'); // 'decimals'

function genQ(grade) {
  const precision = grade >= 5 ? 3 : 2;
  const denoms = grade <= 2
    ? [2, 4, 5, 10]
    : grade === 3
      ? [2, 3, 4, 5, 6, 8, 10]
      : grade === 4
        ? [2, 3, 4, 5, 6, 8, 10, 12]
        : [2, 3, 4, 5, 6, 8, 10, 12, 16, 18, 20];
  const denom = denoms[Math.floor(Math.random() * denoms.length)];
  const numer=Math.floor(Math.random()*(denom-1))+1;
  return {numer,denom,decimal:(numer/denom).toFixed(precision),pct:Math.round((numer/denom)*100),precision};
}

export default function DecimalMall() {
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const baseTime = grade >= 4 ? 50 : 60;
  const [q,setQ]=useState(genQ(grade));
  const [input,setInput]=useState('');
  const [score,setScore]=useState(0);
  const [timeLeft,setTimeLeft]=useState(baseTime);
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
  useEffect(()=>{if(gameState!=='playing')addXP(Math.floor(score/2),'Decimal Mall',score,Math.min(100,score),'Decimals');},[gameState]);

  const PRICE=Math.floor(Math.random()*50)+10;
  const [itemPrice]=useState(PRICE);

  const handleSubmit=(e)=>{
    e.preventDefault();
    if(gameState!=='playing')return;
    const userAns=parseFloat(input);
    const correct=parseFloat(q.decimal);
    const tolerance = q.precision === 3 ? 0.002 : 0.015;
    const isCorrect=!Number.isNaN(userAns)&&Math.abs(userAns-correct) < tolerance;
    if(!Number.isNaN(userAns)) recordAttempt({ skillId: SKILL, correct: isCorrect, responseTime: 0 });
    if(isCorrect){
      const pts=15+combo*3;setScore(s=>s+pts);setCombo(c=>c+1);
      setFeedback({text:`✅ Correct! +${pts}`,correct:true});
    }else{
      setCombo(0);setFeedback({text:`❌ Answer: ${q.decimal}`,correct:false});
    }
    setInput('');
    setTimeout(()=>{setFeedback(null);setQ(genQ(grade));},600);
  };

  const sections=Math.min(q.denom,12);
  const filled=Math.round((q.numer/q.denom)*sections);

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient">🛒 Decimal Mall</h1>
        <div className="badge badge-primary text-xs">Grade {grade}</div>
      </div>
      <div className="w-full max-w-md glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className={`hud-chip font-bold ${timeLeft<=10?'text-red-400 animate-pulse':'text-emerald-400'}`}>⏱ {timeLeft}s</div>
        {combo>=2&&<div className="hud-chip text-orange-400">🔥 {combo}x</div>}
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-md">
          <div className="glass-panel p-6 text-center mb-5"
            style={{background:'linear-gradient(180deg,rgba(30,58,138,0.3) 0%,rgba(30,41,59,0.7) 100%)'}}>
            <p className="text-slate-400 text-sm mb-3">🏪 Village Market — Convert this fraction to decimal:</p>
            <div className="text-5xl font-black text-gradient mb-4">{q.numer}/{q.denom}</div>
            <div className="flex justify-center gap-1 mb-3">
              {Array.from({length:sections}).map((_,i)=>(
                <div key={i} className={`w-5 h-8 rounded ${i<filled?'bg-primary':'bg-white/10'}`}/>
              ))}
            </div>
            <p className="text-slate-400 text-sm">{q.numer} out of {q.denom} parts = ?</p>
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
            <input ref={inputRef} type="text" value={input} onChange={e=>setInput(e.target.value)}
              placeholder="e.g. 0.75" className="flex-1 bg-white/8 border border-white/15 rounded-xl px-4 py-4 text-2xl font-bold text-center text-slate-100 focus:outline-none focus:border-primary/60"/>
            <button type="submit" className="btn btn-primary text-lg px-6">✓</button>
          </form>
          <p className="text-slate-500 text-xs text-center mt-2">Enter decimal (e.g. 0.50)</p>
        </div>
      )}

      {gameState!=='playing'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">{score>=80?'🎉':'🛒'}</div>
          <h2 className="font-display text-3xl font-bold mb-3">{score>=80?'Great Shopper!':'Game Over'}</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong> | XP: <strong className="text-yellow-400">+{Math.floor(score/2)}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setTimeLeft(baseTime);setCombo(0);setGameState('playing');setQ(genQ(grade));setInput('');}} className="btn btn-primary flex-1">🔄 Again</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
