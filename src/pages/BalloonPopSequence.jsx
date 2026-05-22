import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { getGradeTier, normalizeGrade } from '../lib/gradeUtils';

function genSequence(grade) {
  const tier = getGradeTier(grade);
  const stepOptions = tier === 1
    ? [1, 2, 3]
    : tier === 2
      ? (grade >= 4 ? [2, 3, 5, 6] : [2, 3, 5])
      : tier === 3
        ? [2, 4, 6, 8, 10]
        : [3, 5, 7, 9, 11];
  const step = stepOptions[Math.floor(Math.random() * stepOptions.length)];
  const startMin = tier === 1 ? 1 : tier === 2 ? 5 : tier === 3 ? 10 : 15;
  const startMax = tier === 1 ? 10 : tier === 2 ? (grade >= 4 ? 24 : 20) : tier === 3 ? 36 : 48;
  const start = Math.floor(Math.random() * (startMax - startMin + 1)) + startMin;
  const nums = Array.from({length:5},(_,i)=>start+step*i);
  const ai = Math.floor(Math.random()*5);
  const answer = nums[ai];
  const display = nums.map((n,i)=>i===ai?'?':n);
  const choices = [answer,answer+step,answer-step,answer+1].filter(n=>n>0&&n!==answer);
  choices.splice(0,0,answer);
  return {display,answer,step,choices:choices.slice(0,4).sort(()=>Math.random()-0.5)};
}
const BCOLORS=['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6'];
export default function BalloonPopSequence() {
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const baseTime = grade >= 4 ? 50 : 60;
  const [seq,setSeq]=useState(genSequence(grade));
  const [score,setScore]=useState(0);
  const [lives,setLives]=useState(3);
  const [timeLeft,setTimeLeft]=useState(baseTime);
  const [gameState,setGameState]=useState('start');
  const [feedback,setFeedback]=useState(null);
  const [combo,setCombo]=useState(0);
  const {addXP}=usePlayerStore();
  const timerRef=useRef(null);
  useEffect(()=>{
    if(gameState!=='playing')return;
    timerRef.current=setInterval(()=>setTimeLeft(t=>{if(t<=1){setGameState('lost');return 0;}return t-1;}),1000);
    return()=>clearInterval(timerRef.current);
  },[gameState]);
  useEffect(()=>{
    if(gameState==='lost'){
      clearInterval(timerRef.current);
      addXP(Math.floor(score/2),'Balloon Pop',score,Math.min(100,score),'Arithmetic');
    }
  },[gameState, score, addXP]);

  const handleAnswer=useCallback((chosen)=>{
    if(gameState!=='playing')return;
    if(chosen===seq.answer){
      const pts=15+combo*3;setScore(s=>s+pts);setCombo(c=>c+1);
      setFeedback({text:`🎈 Pop! +${pts}`,correct:true});
    }else{
      setCombo(0);
      setLives(l=>{if(l<=1){setGameState('lost');return 0;}return l-1;});
      setFeedback({text:`❌ Was ${seq.answer}`,correct:false});
    }
    setTimeout(()=>{setFeedback(null);setSeq(genSequence(grade));},700);
  },[gameState,seq,combo]);
  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm bg-white shadow-sm font-bold text-slate-700">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient text-slate-800">🎈 Balloon Pop</h1>
        <div className="badge badge-warning text-xs font-bold bg-yellow-100 text-yellow-800">Grade {grade}</div>
      </div>

      {gameState==='start' && (
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="bg-white rounded-[32px] p-8 text-center max-w-sm w-full mx-auto mt-10 shadow-lg bg-white border border-slate-100">
          <div className="text-6xl mb-4">🎈</div>
          <h2 className="font-display text-2xl font-bold mb-4 text-slate-800">How to Play</h2>
          <div className="text-left text-slate-600 mb-6 space-y-3 bg-slate-50 p-5 rounded-xl shadow-inner text-sm font-medium">
            <p>1️⃣ Look at the <strong>number sequence</strong> on the balloons.</p>
            <p>2️⃣ Figure out the <strong>missing number</strong> that replaces the <strong className="text-primary text-base">?</strong> mark.</p>
            <p>3️⃣ <strong>Pop the correct balloon</strong> from the choices below.</p>
            <p>4️⃣ Answer quickly to build a <strong>combo</strong> for extra XP within 60s!</p>
          </div>
          <button onClick={()=>{setGameState('playing');}} className="btn btn-primary w-full text-lg py-4 shadow-lg mb-2">Start Game</button>
        </motion.div>
      )}

      {(gameState==='playing' || gameState==='lost') && (
        <div className="w-full max-w-lg bg-white rounded-[32px] p-3 mb-4 flex items-center justify-between bg-white shadow-sm border border-slate-100">
          <div className="text-red-400 font-lg">{'❤️'.repeat(lives)}{'🖤'.repeat(3-lives)}</div>
          <div className="hud-chip text-yellow-500 font-bold bg-yellow-50">Score: {score}</div>
          <div className={`hud-chip font-bold ${timeLeft<=10?'text-red-500 bg-red-50 animate-pulse':'text-emerald-600 bg-emerald-50'}`}>⏱ {timeLeft}s</div>
          {combo>=2&&<div className="hud-chip text-orange-500 font-bold bg-orange-50">🔥 {combo}x</div>}
        </div>
      )}

      {gameState==='playing'&&(
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-[32px] p-6 mb-5 text-center bg-slate-800 text-white shadow-xl">
            <p className="text-slate-300 text-sm mb-4 font-semibold tracking-wide">Step: +{seq.step} each balloon</p>
            <div className="flex justify-center gap-3 flex-wrap mb-2">
              {seq.display.map((v,i)=>(
                <motion.div key={i} animate={{y:[0,-8,0]}} transition={{duration:2,repeat:Infinity,delay:i*0.3}} className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl text-white shadow-lg relative"
                    style={{background:`radial-gradient(circle at 35% 35%,${BCOLORS[i%5]}cc,${BCOLORS[i%5]})`}}>
                    <div className="absolute top-1.5 left-2.5 w-3 h-3 bg-white/40 rounded-full" />
                    {v===0?'0':v}
                  </div>
                  <div className="w-0.5 h-4 bg-slate-400 mt-1"/>
                </motion.div>
              ))}
            </div>
          </div>
          <AnimatePresence>
            {feedback ? (
              <motion.p initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:10}}
                className={`text-center font-black text-xl mb-3 h-8 shadow-sm p-1 rounded-lg ${feedback.correct?'text-emerald-500 bg-emerald-50':'text-red-500 bg-red-50'}`}>
                {feedback.text}
              </motion.p>
            ) : (
                <div className="h-8 mb-3" />
            )}
          </AnimatePresence>
          <div className="grid grid-cols-4 gap-3">
            {seq.choices.map((n,i)=>(
              <motion.button key={`${n}-${i}-${seq.answer}`} whileTap={{scale:0.9}} onClick={()=>handleAnswer(n)}
                className="py-5 rounded-2xl font-black text-2xl border flex items-center justify-center shadow-sm"
                style={{
                  background:`${BCOLORS[i%5]}15`,
                  borderColor:`${BCOLORS[i%5]}40`,
                  color: BCOLORS[i%5]
                }}>
                {n}
              </motion.button>
            ))}
          </div>
        </div>
      )}
      {gameState==='lost' &&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="bg-white rounded-[32px] p-8 text-center max-w-sm w-full mt-4 mx-auto bg-white shadow-lg">
          <div className="text-6xl mb-3">{score>=60?'🎊':'🎈'}</div>
          <h2 className="font-display text-3xl font-bold mb-3 text-slate-800">{score>=60?'Amazing!':'Game Over'}</h2>
          <p className="text-slate-500 mb-1 font-medium">Score: <strong className="text-primary text-xl">{score}</strong></p>
          <p className="text-slate-500 mb-6 font-medium">XP: <strong className="text-yellow-500 text-xl">+{Math.floor(score/2)}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setLives(3);setTimeLeft(baseTime);setCombo(0);setGameState('playing');setSeq(genSequence(grade));}} className="btn btn-primary flex-1 shadow-md">🔄 Again</button>
            <Link to="/student" className="btn btn-soft flex-1 no-underline bg-slate-100 text-slate-700 shadow-sm border border-slate-200">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
