import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, Scale, Award, RefreshCcw, Check, X, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { getGradeTier, normalizeGrade } from '../lib/gradeUtils';

function generateEquation(level, gradeTier) {
  const maxVal = gradeTier >= 4 ? 48 : gradeTier === 3 ? 36 : gradeTier === 2 ? 26 : 15;
  const left1 = Math.floor(Math.random() * maxVal) + 2;
  const left2 = Math.floor(Math.random() * maxVal) + 2;
  const sum = left1 + left2;
  
  const right1 = Math.floor(Math.random() * (sum - 1)) + 1;
  const missingRight = sum - right1;
  
  const baseOptions = new Set();
  baseOptions.add(missingRight);
  while(baseOptions.size < 5) { // 5 options now
    let fake = missingRight + (Math.floor(Math.random() * 10) - 5);
    if(fake > 0 && fake !== missingRight) baseOptions.add(fake);
  }
  
  return { leftStr: `${left1} + ${left2}`, rightKnown: right1, missing: missingRight, sum, options: Array.from(baseOptions).sort(() => Math.random() - 0.5) };
}

function EquationBalancer() {
  const { addXP } = useGamification();
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const gradeTier = getGradeTier(grade);
  const navigate = useNavigate();

  const [score, setScore] = useState(0);
  const [levelTracker, setLevelTracker] = useState(1);
  const [eq, setEq] = useState(generateEquation(1, gradeTier));
  const [placed, setPlaced] = useState(null);
  const [feedback, setFeedback] = useState(null);
  
  const handleReset = () => {
    setScore(0);
    setLevelTracker(1);
    setPlaced(null);
    setFeedback(null);
    setEq(generateEquation(1, gradeTier));
  };
  
  const handleWeightClick = (val) => {
    // Only allow placement if scale is empty and game is not processing a result
    if (placed !== null || feedback !== null) return;

    setPlaced(val);
    
    if (val === eq.missing) {
      setFeedback('correct');
      setScore(s => s + 1);
      setTimeout(() => {
        addXP(25, 'Equation Balancer', 1, 0, 'Algebra');
        setPlaced(null);
        setFeedback(null);
        setLevelTracker(l => l + 1);
        setEq(generateEquation(levelTracker + 1, gradeTier));
      }, 1500);
    } else {
      setFeedback('wrong');
      setTimeout(() => {
        setPlaced(null);
        setFeedback(null);
      }, 1000);
    }
  };

  // Determine rotation based on balance
  let rotation = 0;
  if (placed !== null) {
      const rightSum = eq.rightKnown + placed;
      // Exaggerate rotation for visual effect
      const diff = rightSum - eq.sum;
      rotation = Math.max(-25, Math.min(25, diff * 5)); 
  } else {
      rotation = -20; // naturally tips left due to unknown right
  }

  return (
    <div className="animate-fade-in-up">
      <header className="flex justify-between items-center mb-6 sm:mb-10 px-2 sm:px-0">
        <Link to="/student" className="btn btn-glass px-3 py-2 sm:px-4 text-sm sm:text-base">
          <ChevronLeft size={18} className="sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Back</span>
        </Link>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 tracking-tight">
           <Scale className="text-blue-400 w-5 h-5 sm:w-6 sm:h-6" /> Balancer
        </h2>
        <div className="px-3 sm:px-5 py-1.5 sm:py-2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] text-sm sm:text-base">
          Score: {score}
        </div>
      </header>

      <div className="glass-panel p-4 sm:p-8 text-center max-w-4xl mx-auto border-blue-500/20 relative overflow-hidden">
        <p className="text-slate-300 mb-12 sm:mb-16 text-base sm:text-lg font-medium px-4">
          Tap an iron weight to place it on the right side and perfectly balance the equation!
        </p>

        {/* Scale UI */}
        <div className="relative mb-24 sm:mb-32 w-11/12 max-w-2xl mx-auto mt-24 sm:mt-28">
          {/* Seesaw Board */}
          <div 
            className="w-full h-3 sm:h-4 bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400 rounded-full relative transition-transform duration-700 ease-in-out z-10 shadow-[0_10px_20px_rgba(0,0,0,0.5)] border-b-2 border-slate-500"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
             {/* Left Weight */}
             <div className="absolute left-[5%] sm:left-[10%] bottom-full mb-0 w-20 h-16 sm:w-24 sm:h-20 bg-gradient-to-br from-slate-600 to-slate-900 border-2 border-slate-400 rounded-t-lg flex flex-col items-center justify-center text-xl sm:text-2xl font-bold shadow-2xl">
                <div className="text-[10px] sm:text-xs text-slate-400 absolute top-1 font-mono uppercase">Weight A</div>
                <div className="mt-2 text-white">{eq.leftStr}</div>
             </div>
             
             {/* Right Weight Container */}
             <div 
                className={`absolute right-[5%] sm:right-[10%] bottom-full mb-0 w-24 h-16 sm:w-32 sm:h-20 bg-slate-900/50 backdrop-blur-sm border-2 border-dashed ${feedback === 'wrong' ? 'border-danger bg-danger/10' : feedback === 'correct' ? 'border-success bg-success/10' : 'border-blue-400/50'} rounded-t-lg flex flex-col items-center justify-center transition-colors duration-300 shadow-inner group`}
             >
                {/* Fixed internal right weight fragment */}
                {placed === null && (
                   <span className="text-blue-300/80 font-medium text-xs sm:text-sm mb-1">{eq.rightKnown} +</span>
                )}
                
                {placed !== null ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-800 border-2 border-blue-300 rounded-t-lg flex flex-col items-center justify-center font-bold text-white animate-fade-in-up text-lg sm:text-xl shadow-[0_0_20px_rgba(59,130,246,0.6)] z-20">
                         <div className="text-[10px] sm:text-xs text-blue-200 absolute top-1 font-mono uppercase">Weight B</div>
                        {eq.rightKnown} + {placed}
                    </div>
                ) : (
                   <span className="text-blue-300/50 font-bold text-lg sm:text-2xl animate-pulse">?</span>
                )}
             </div>
          </div>
          
          {/* Fulcrum */}
          <div className="w-16 h-20 sm:w-24 sm:h-28 bg-gradient-to-br from-slate-600 to-slate-800 absolute left-1/2 -translate-x-1/2 -top-1 sm:-top-2 z-0 border-x border-slate-500 shadow-2xl" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
          <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-slate-300 absolute left-1/2 -translate-x-1/2 -top-2 sm:-top-3 z-20 shadow-inner"></div>
        </div>

        {/* Weights Bank */}
        <div className="bg-black/20 p-4 sm:p-6 rounded-2xl border border-white/5">
          <h4 className="text-slate-400 font-medium text-sm sm:text-base mb-4 sm:mb-6 flex items-center justify-center gap-2"><Scale size={18}/> Iron Weights Inventory</h4>
          <div className="flex justify-center gap-3 sm:gap-6 flex-wrap">
            {eq.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleWeightClick(opt)}
                disabled={placed !== null}
                className={`relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-b from-slate-500 to-slate-800 border-t-2 border-l-2 border-slate-400 shadow-[0_10px_20px_rgba(0,0,0,0.4)] text-white font-bold text-2xl sm:text-3xl flex flex-col items-center justify-center transition-all group focus:outline-none ${placed === null ? 'hover:brightness-125 hover:border-white hover:-translate-y-2 hover:scale-105 active:scale-95 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 20%, 100% 100%, 0% 100%, 0% 20%)' }}
              >
                 {opt}
                 <div className="absolute bottom-1 w-6 sm:w-8 h-1 bg-black/30 rounded-full"></div>
              </button>
            ))}
          </div>
        </div>
        
        <div className="h-10 sm:h-12 mt-6 sm:mt-8 flex justify-center items-center">
            {feedback === 'correct' && <span className="text-success font-bold flex items-center gap-1.5 sm:gap-2 text-lg sm:text-2xl animate-combo-pop"><Check size={28}/> Perfectly Balanced!</span>}
            {feedback === 'wrong' && <span className="text-danger font-bold flex items-center gap-1.5 sm:gap-2 text-lg sm:text-2xl animate-meteor-shake"><ShieldAlert size={28}/> Too Heavy/Light!</span>}
        </div>
      </div>
    </div>
  );
}

export default EquationBalancer;
