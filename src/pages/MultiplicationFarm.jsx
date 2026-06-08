import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('MultiplicationFarm'); // 'multiplication'

function genQ(grade) {
  const min = grade <= 2 ? 2 : grade <= 4 ? 2 : 3;
  const max = grade <= 2 ? 5 : grade === 3 ? 8 : grade === 4 ? 10 : 14;
  const rows=Math.floor(Math.random()*(max - min + 1))+min;
  const cols=Math.floor(Math.random()*(max - min + 1))+min;
  return {rows,cols,answer:rows*cols};
}

export default function MultiplicationFarm() {
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const totalRounds = grade >= 4 ? 10 : 8;
  const [q,setQ]=useState(genQ(grade));
  const [selected,setSelected]=useState(null);
  const [score,setScore]=useState(0);
  const [round,setRound]=useState(1);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const {addXP}=usePlayerStore();
  const TOTAL_ROUNDS=totalRounds;

  const choices=()=>{
    const ans=q.answer;
    const opts=new Set([ans]);
    while(opts.size<4){opts.add(ans+Math.floor(Math.random()*6)-3);}
    return [...opts].filter(n=>n>0).sort(()=>Math.random()-0.5);
  };
  const [opts,setOpts]=useState(choices);

  const handleAnswer=(n)=>{
    if(selected!==null)return;
    setSelected(n);
    const correct=n===q.answer;
    recordAttempt({ skillId: SKILL, correct, responseTime: 0 });
    if(correct){
      setScore(s=>s+20);
      setFeedback({text:`✅ ${q.rows}×${q.cols}=${q.answer} crops!`,correct:true});
    }else{
      setFeedback({text:`❌ ${q.rows}×${q.cols}=${q.answer}`,correct:false});
    }
    setTimeout(()=>{
      if(round>=TOTAL_ROUNDS){setGameState('won');addXP(score+(n===q.answer?20:0),'Multiplication Farm',score,Math.min(100,score),'Multiplication');}
      else{setRound(r=>r+1);setQ(genQ(grade));setSelected(null);setFeedback(null);setOpts(choices());}
    },900);
  };

  const crop='🌻';
  const grid=Array.from({length:q.rows},(_,r)=>Array.from({length:q.cols},(_,c)=>({r,c})));

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient-green">🌻 Multiplication Farm</h1>
        <div className="badge badge-success text-xs">Grade {grade}</div>
      </div>
      <div className="w-full max-w-lg glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className="hud-chip text-emerald-400">Round {round}/{TOTAL_ROUNDS}</div>
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-lg">
          <div className="glass-panel p-5 mb-5" style={{background:'linear-gradient(180deg,rgba(20,83,45,0.35) 0%,rgba(30,41,59,0.7) 100%)'}}>
            <p className="text-center text-slate-300 text-sm mb-3">
              🌾 The farm has <strong className="text-yellow-400">{q.rows} rows</strong> × <strong className="text-emerald-400">{q.cols} columns</strong> of crops. Total?
            </p>
            <div className="overflow-auto max-h-48">
              <div className="flex flex-col gap-0.5 items-center">
                {grid.map((row,ri)=>(
                  <div key={ri} className="flex gap-0.5">
                    {row.map((_,ci)=>(
                      <motion.span key={ci} initial={{opacity:0,scale:0}} animate={{opacity:1,scale:1}}
                        transition={{delay:(ri*q.cols+ci)*0.02}} className="text-sm leading-none">
                        {crop}
                      </motion.span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-center mt-3 font-black text-2xl text-gradient">{q.rows} × {q.cols} = ?</p>
          </div>

          <AnimatePresence>
            {feedback&&(
              <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className={`text-center font-bold mb-3 ${feedback.correct?'text-emerald-400':'text-red-400'}`}>
                {feedback.text}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-4 gap-3">
            {opts.map((n,i)=>(
              <button key={i} onClick={()=>handleAnswer(n)}
                className={`py-4 rounded-2xl font-black text-2xl border-2 transition-all ${
                  selected===n?(n===q.answer?'bg-emerald-500/30 border-emerald-400':'bg-red-500/30 border-red-400')
                  :'bg-white/5 border-white/10 hover:border-white/30'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameState==='won'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">🌾</div>
          <h2 className="font-display text-3xl font-bold mb-3">Harvest Complete!</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setRound(1);setGameState('playing');setQ(genQ(grade));setSelected(null);setFeedback(null);}} className="btn btn-success flex-1">🌱 New Farm</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
