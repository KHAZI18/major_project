import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';

const GRID_SIZE=8;

function genTreasure(){
  return {x:Math.floor(Math.random()*GRID_SIZE),y:Math.floor(Math.random()*GRID_SIZE)};
}

function genClue(treasure){
  return `Find the treasure at (${treasure.x}, ${treasure.y})`;
}

export default function CoordinateTreasure() {
  const [treasure,setTreasure]=useState(genTreasure());
  const [selected,setSelected]=useState(null);
  const [score,setScore]=useState(0);
  const [round,setRound]=useState(1);
  const [gameState,setGameState]=useState('playing');
  const [feedback,setFeedback]=useState(null);
  const {addXP}=usePlayerStore();
  const TOTAL=6;

  const handleClick=(x,y)=>{
    if(selected)return;
    setSelected({x,y});
    const correct=x===treasure.x&&y===treasure.y;
    if(correct){
      setScore(s=>s+30);setFeedback({text:`🏴‍☠️ Found it at (${x},${y})!`,correct:true});
    }else{
      setFeedback({text:`❌ Treasure was at (${treasure.x},${treasure.y})`,correct:false});
    }
    setTimeout(()=>{
      const nt=genTreasure();
      if(round>=TOTAL){setGameState('won');addXP(score+(correct?30:0),'Coordinate Treasure',score,Math.min(100,score));}
      else{setRound(r=>r+1);setTreasure(nt);setSelected(null);setFeedback(null);}
    },1200);
  };

  return(
    <div className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient-orange">🗺️ Treasure Map</h1>
        <div className="badge badge-warning text-xs">Grade 5</div>
      </div>
      <div className="w-full max-w-lg glass-panel p-3 mb-4 flex items-center justify-between">
        <div className="hud-chip text-yellow-400">Score: {score}</div>
        <div className="hud-chip text-emerald-400">Round {round}/{TOTAL}</div>
      </div>

      {gameState==='playing'&&(
        <div className="w-full max-w-lg">
          <div className="glass-panel p-4 mb-4 text-center">
            <p className="text-slate-300 text-sm mb-1">🧭 The treasure map says:</p>
            <p className="font-black text-xl text-yellow-400">Go to point ({treasure.x}, {treasure.y})</p>
            <p className="text-slate-500 text-xs mt-1">X = across → | Y = up ↑</p>
          </div>

          {/* Grid */}
          <div className="glass-panel p-4 overflow-auto">
            <div className="flex flex-col-reverse">
              {Array.from({length:GRID_SIZE+1},(_,y)=>(
                <div key={y} className="flex items-center">
                  <span className="text-slate-500 text-xs w-5 text-right mr-1 shrink-0">{y}</span>
                  {Array.from({length:GRID_SIZE+1},(_,x)=>{
                    const isSelected=selected&&selected.x===x&&selected.y===y;
                    const isTreasure=selected&&treasure.x===x&&treasure.y===y;
                    return(
                      <motion.button
                        key={x}
                        whileTap={{scale:0.85}}
                        onClick={()=>handleClick(x,y)}
                        className={`w-9 h-9 m-0.5 rounded-lg border text-sm transition-all ${
                          isTreasure&&selected?'bg-yellow-500/60 border-yellow-400 text-yellow-200':
                          isSelected?'bg-red-500/40 border-red-400':'bg-white/5 border-white/10 hover:border-primary/50 hover:bg-primary/10'
                        }`}>
                        {isTreasure&&selected?'💎':isSelected?'❌':y===0&&x===0?'⚓':'·'}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
              <div className="flex ml-6">
                {Array.from({length:GRID_SIZE+1},(_,x)=>(
                  <span key={x} className="text-slate-500 text-xs w-10 text-center">{x}</span>
                ))}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {feedback&&(
              <motion.p initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className={`text-center font-bold mt-3 text-lg ${feedback.correct?'text-emerald-400':'text-red-400'}`}>
                {feedback.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {gameState==='won'&&(
        <motion.div initial={{scale:0.8}} animate={{scale:1}} className="glass-panel p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">🏴‍☠️</div>
          <h2 className="font-display text-3xl font-bold mb-3">Treasure Found!</h2>
          <p className="text-slate-300 mb-6">Score: <strong className="text-primary">{score}</strong></p>
          <div className="flex gap-3">
            <button onClick={()=>{setScore(0);setRound(1);setGameState('playing');setTreasure(genTreasure());setSelected(null);}} className="btn btn-village flex-1">🗺️ New Map</button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
