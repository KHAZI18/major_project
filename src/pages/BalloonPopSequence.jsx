import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

function genSequence() {
  const step = [1,2,3,5,10][Math.floor(Math.random()*5)];
  const start = Math.floor(Math.random()*10)+1;
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
  const [seq,setSeq]=useState(genSequence());
  const [score,setScore]=useState(0);
  const [lives,setLives]=useState(3);
  const [timeLeft,setTimeLeft]=useState(60);
  const [gameState,setGameState]=useState('playing');
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
    if(gameState!=='playing'){clearInterval(timerRef.current);addXP(Math.floor(score/2),'Balloon Pop',score,Math.min(100,score));}
  },[gameState]);
  const handleAnswer=useCallback((chosen)=>{
    if(gameState!=='playing')return;
    if(chosen===seq.answer){
      const pts=15+combo*3;setScore(s=>s+pts);setCombo(c=>c+1);
      setFeedback({text:`🎈 Pop! +${pts}`,correct:true});
    }else{
      setCombo(0);setLives(l=>{if(l<=1){setGameState('lost');return 0;}return l-1;});
      setFeedback({text:`❌ Was ${seq.answer}`,correct:false});
    }
    setTimeout(()=>{setFeedback(null);setSeq(genSequence());},700);
  },[gameState,seq,combo]);
  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient">🎈 Balloon Pop</h1>
        <div className="badge badge-warning text-xs">Grade 2</div>
      </div>
      <div className="w-full max-w-lg glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="text-red-400">{'❤️'.repeat(lives)}{'🖤'.repeat(3-lives)}</div>
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className={`hud-chip font-bold ${timeLeft<=10?'text-red-400 animate-pulse':'text-emerald-400'}`}>⏱ {timeLeft}s</div>
        {combo>=2&&<div className="hud-chip text-orange-400">🔥 {combo}x</div>}
      </div>
      {gameState==='playing'&&(
        <div className="w-full max-w-lg">
          <div className="glass-panel p-6 mb-5 text-center">
            <p className="text-slate-400 text-sm mb-2">Step: +{seq.step} each balloon</p>
            <div className="flex justify-center gap-3 flex-wrap mb-2">
              {seq.display.map((v,i)=>(
                <motion.div key={i} animate={{y:[0,-8,0]}} transition={{duration:2,repeat:Infinity,delay:i*0.3}} className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl text-white shadow-lg"
                    style={{background:`radial-gradient(circle at 35% 35%,${BCOLORS[i%5]}cc,${BCOLORS[i%5]})`}}>
                    {v===0?'0':v}
                  </div>
                  <div className="w-0.5 h-4 bg-slate-500"/>
                </motion.div>
              ))}
            </div>
          </div>
          <AnimatePresence>
            {feedback&&(
              <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className={`text-center font-bold text-lg mb-3 ${feedback.correct?'text-emerald-400':'text-red-400'}`}>
                {feedback.text}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="grid grid-cols-4 gap-3">
            {seq.choices.map((n,i)=>(
              <motion.button key={`${n}-${i}`} whileTap={{scale:0.9}} onClick={()=>handleAnswer(n)}
                className="py-4 rounded-2xl font-black text-2xl border-2"
                style={{background:`${BCOLORS[i%5]}22`,borderColor:`${BCOLORS[i%5]}44`}}>
                {n}
              </motion.button>
            ))}
          </div>
        </div>
      )}
      {gameState!=='playing'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">{score>=60?'🎊':'🎈'}</div>
          <h2 className="font-display text-3xl font-bold mb-3">{score>=60?'Amazing!':'Game Over'}</h2>
          <p className="text-slate-300 mb-1">Score: <strong className="text-primary">{score}</strong></p>
          <p className="text-slate-300 mb-6">XP: <strong className="text-yellow-400">+{Math.floor(score/2)}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setLives(3);setTimeLeft(60);setCombo(0);setGameState('playing');setSeq(genSequence());}} className="btn btn-primary flex-1">🔄 Again</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
