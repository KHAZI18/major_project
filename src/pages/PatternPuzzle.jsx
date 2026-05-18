import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, Puzzle, Award, RefreshCcw, Check, X, Sparkles, BrainCircuit, Grid3X3 } from 'lucide-react';

// Generates a 3x3 Logic Matrix where the 9th cell (index 8) is the missing '?'
function generateMatrixPattern(difficultyLevel) {
  const patternTypes = ['add_rows', 'mult_rows', 'seq_grid', 'add_cols', 'sub_rows'];
  const maxIdx = Math.min(patternTypes.length, 1 + Math.floor(difficultyLevel / 2));
  const type = patternTypes[Math.floor(Math.random() * maxIdx)];
  
  let grid = Array(9).fill(0);
  let answer;
  let rule = '';
  
  if (type === 'add_rows') {
     // Row 3 = Row 1 + Row 2
     for(let r=0; r<3; r++) {
         const a = Math.floor(Math.random() * 15) + 1;
         const b = Math.floor(Math.random() * 15) + 1;
         grid[r*3] = a;
         grid[r*3 + 1] = b;
         grid[r*3 + 2] = a + b;
     }
     answer = grid[8];
     grid[8] = null;
     rule = "Column 3 is the Sum of Column 1 and Column 2";
     
  } else if (type === 'sub_rows') {
     for(let r=0; r<3; r++) {
         const a = Math.floor(Math.random() * 20) + 10;
         const b = Math.floor(Math.random() * 9) + 1;
         grid[r*3] = a;
         grid[r*3 + 1] = b;
         grid[r*3 + 2] = a - b;
     }
     answer = grid[8];
     grid[8] = null;
     rule = "Column 3 is Column 1 minus Column 2";
     
  } else if (type === 'mult_rows') {
     for(let r=0; r<3; r++) {
         const a = Math.floor(Math.random() * 9) + 1;
         const b = Math.floor(Math.random() * 9) + 1;
         grid[r*3] = a;
         grid[r*3 + 1] = b;
         grid[r*3 + 2] = a * b;
     }
     answer = grid[8];
     grid[8] = null;
     rule = "Column 3 is the Product of Column 1 and Column 2";
     
  } else if (type === 'seq_grid') {
     const start = Math.floor(Math.random() * 15) + 1;
     const step = Math.floor(Math.random() * 5) + 1;
     for(let i=0; i<9; i++) {
        grid[i] = start + (step * i);
     }
     answer = grid[8];
     grid[8] = null;
     rule = `Grid increases sequentially by ${step}`;
     
  } else if (type === 'add_cols') {
     // Col 3 = Col 1 + Col 2 (Vertical Logic)
     for(let c=0; c<3; c++) {
         const a = Math.floor(Math.random() * 10) + 1;
         const b = Math.floor(Math.random() * 10) + 1;
         grid[c] = a;
         grid[c + 3] = b;
         grid[c + 6] = a + b;
     }
     answer = grid[8];
     grid[8] = null;
     rule = "Row 3 is the Sum of Row 1 and Row 2";
  }

  // Generate unique wrong options
  const optSet = new Set([answer]);
  while (optSet.size < 4) {
      let offset = Math.floor(Math.random() * 20) - 10;
      if (offset === 0) offset = 1;
      let fake = answer + offset;
      if (fake > 0 && fake !== answer && fake < 150) optSet.add(fake);
  }

  return { grid, answer, rule, options: Array.from(optSet).sort(() => Math.random() - 0.5) };
}

function PatternPuzzle() {
  const { addXP } = useGamification();
  const navigate = useNavigate();

  const TOTAL_ROUNDS = 10;
  const [levelTracker, setLevelTracker] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [currentPattern, setCurrentPattern] = useState(generateMatrixPattern(1));
  const [feedback, setFeedback] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  const initGame = () => {
    setLevelTracker(1);
    setScore(0);
    setStreak(0);
    setGameOver(false);
    setCurrentPattern(generateMatrixPattern(1));
    setFeedback(null);
  };

  const handleSelect = (opt) => {
    if (feedback) return;
    
    if (opt === currentPattern.answer) {
      setFeedback('correct');
      setScore(s => s + 1);
      setStreak(s => s + 1);
    } else {
      setFeedback('wrong');
      setStreak(0);
    }

    setTimeout(() => {
      setFeedback(null);
      if (levelTracker < TOTAL_ROUNDS) {
        setLevelTracker(l => l + 1);
        setCurrentPattern(generateMatrixPattern(levelTracker + 1));
      } else {
        setGameOver(true);
        addXP(score * 30 + (opt === currentPattern.answer ? 20 : 0), 'Grid Matrix Puzzle', score + (opt === currentPattern.answer ? 1 : 0));
      }
    }, 2000); // 2 seconds to read the matrix logic breakdown
  };

  return (
    <div className="animate-fade-in-up pb-10">
      <header className="flex justify-between items-center mb-6 sm:mb-10 px-2 sm:px-0">
        <Link to="/student" className="btn btn-glass px-3 py-2 sm:px-4 text-sm sm:text-base">
          <ChevronLeft size={18} className="sm:w-5 sm:h-5" /> <span className="hidden sm:inline">Back</span>
        </Link>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 tracking-tight">
          <Grid3X3 className="text-secondary w-5 h-5 sm:w-6 sm:h-6"/> Matrix Puzzle
        </h2>
        <div className="px-3 sm:px-5 py-1.5 sm:py-2 bg-secondary/20 text-secondary border border-secondary/30 rounded-full font-bold shadow-[0_0_15px_rgba(168,85,247,0.3)] text-sm sm:text-base">
          Matrix {Math.min(levelTracker, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}
        </div>
      </header>

      <div className="glass-panel p-4 sm:p-8 text-center max-w-2xl mx-auto relative overflow-hidden border-secondary/20 shadow-[0_0_40px_rgba(168,85,247,0.1)]">
        
        {/* Streak Visualizer */}
        {streak >= 3 && !gameOver && (
            <div className="absolute top-4 right-4 flex items-center gap-1 text-secondary animate-combo-pop font-bold text-lg sm:text-xl px-3 py-1 bg-secondary/10 rounded-full border border-secondary/20 shadow-secondary-glow">
               <Sparkles className="animate-pulse w-4 h-4 sm:w-5 sm:h-5"/> {streak}x STREAK
            </div>
        )}

        {gameOver ? (
           <div className="animate-fade-in-up py-8">
             <div className="relative w-32 h-32 mx-auto mb-6">
                <div className="absolute inset-0 bg-secondary/20 blur-2xl rounded-full scale-150 animate-pulse"></div>
                <BrainCircuit size={128} className="text-secondary relative z-10" />
             </div>
             <h3 className="text-3xl sm:text-4xl font-bold mb-4">Matrix Master!</h3>
             <p className="text-slate-300 text-lg sm:text-xl mb-2">You decrypted <strong className="text-white">{score}</strong> spatial logic matrices.</p>
             <p className="text-success text-xl sm:text-2xl font-bold mb-10 shadow-success-glow">+{score * 30} XP Earned!</p>
             <div className="flex justify-center flex-wrap gap-4">
               <button className="btn btn-primary bg-secondary hover:bg-secondary-focus px-6 sm:min-w-[150px] py-3 text-sm sm:text-lg" onClick={initGame}>
                 <RefreshCcw size={18} className="mr-2 inline"/> Recalculate
               </button>
               <button className="btn btn-outline px-6 sm:min-w-[150px] py-3 text-sm sm:text-lg" onClick={() => navigate('/student')}>Dashboard</button>
             </div>
           </div>
        ) : (
          <div>
            <p className="text-base sm:text-lg text-slate-300 mb-8 sm:mb-12 px-2 font-medium">
               Analyze the rows and columns to logically deduce the missing matrix cell.
            </p>

            {/* 3x3 Matrix Grid */}
            <div className="flex justify-center mb-10 sm:mb-14">
                <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-slate-900/60 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/10 shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)]">
                    {currentPattern.grid.map((num, i) => {
                       const isQuestion = num === null;
                       const showCorrect = isQuestion && feedback === 'correct';
                       const showWrong = isQuestion && feedback === 'wrong';
                       
                       let tileClass = "w-16 h-16 sm:w-24 sm:h-24 rounded-xl flex items-center justify-center text-2xl sm:text-4xl font-bold transition-all duration-500 shadow-lg ";
                       
                       if (isQuestion) {
                          if (showCorrect) {
                             tileClass += "bg-success/20 border-2 border-success text-success shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-110";
                          } else if (showWrong) {
                             tileClass += "bg-danger/20 border-2 border-danger text-danger scale-95";
                          } else {
                             tileClass += "bg-secondary/10 border-2 border-dashed border-secondary/50 text-secondary animate-pulse";
                          }
                       } else {
                          tileClass += "bg-slate-800 border-2 border-white/5 text-white shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)]";
                       }

                       return (
                          <div key={i} className={tileClass}>
                             {isQuestion ? (feedback === 'correct' ? currentPattern.answer : '?') : num}
                          </div>
                       )
                    })}
                </div>
            </div>

            {/* Input Selection Options */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md mx-auto px-4">
              {currentPattern.options.map((opt, i) => {
                 let btnClass = "relative overflow-hidden bg-slate-800 border-2 border-slate-700 rounded-xl p-4 sm:p-5 text-xl sm:text-2xl font-bold transition-all duration-300";
                 let interactionClass = "hover:border-secondary hover:bg-slate-700 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] active:scale-95";

                 if (feedback) {
                    interactionClass = "";
                    if (opt === currentPattern.answer) {
                        btnClass += " bg-success/20 border-success text-success shadow-success-glow scale-105";
                    } else {
                        btnClass += " opacity-30 border-slate-800 pointer-events-none";
                    }
                 }

                 return (
                   <button 
                      key={i} 
                      onClick={() => handleSelect(opt)} 
                      disabled={feedback !== null} 
                      className={`${btnClass} ${interactionClass}`}
                   >
                     {opt}
                   </button>
                 );
              })}
            </div>

            {/* Explanation Feedback Console */}
            <div className="h-16 mt-8 sm:mt-10 text-xs sm:text-base font-medium opacity-100 px-2 flex items-center justify-center">
              {feedback === 'correct' && (
                  <div className="inline-flex items-center gap-2 bg-success/20 border border-success/50 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-success animate-fade-in-up font-bold tracking-wide w-full max-w-md justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                      <Check className="w-5 h-5 flex-shrink-0"/> <span className="truncate">{currentPattern.rule}</span>
                  </div>
              )}
              {feedback === 'wrong' && (
                  <div className="inline-flex items-center gap-2 bg-danger/20 border border-danger/50 px-4 sm:px-6 py-2 sm:py-3 rounded-full text-danger animate-fade-in-up font-bold tracking-wide w-full max-w-md justify-center">
                      <X className="w-5 h-5 flex-shrink-0"/> <span className="truncate">Matrix logic: {currentPattern.rule}</span>
                  </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PatternPuzzle;
