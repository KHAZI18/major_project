import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';

function getNumbers(grade) {
  if (grade <= 2) return [1,2,3,4,5,6,7,8,9,10];
  if (grade === 3) return [1,2,3,4,5,6,7,8,9,10,11,12,15];
  if (grade === 4) return [1,2,3,4,5,6,7,8,9,10,11,12,15,16,18];
  return [2,3,4,5,6,7,8,9,10,12,15,20,24,30,36];
}

function makeChoices(answer, grade) {
  const numbers = getNumbers(grade);
  const choices = new Set([answer]);
  const offsets = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 10, -10];

  while (choices.size < 4) {
    const fromPool = numbers[Math.floor(Math.random() * numbers.length)];
    const offset = offsets[Math.floor(Math.random() * offsets.length)];
    const candidate = Math.max(0, Math.random() > 0.45 ? fromPool : answer + offset);
    if (candidate !== answer) choices.add(candidate);
  }

  return [...choices].sort(() => Math.random() - 0.5);
}

function getQuestion(grade) {
  let prompt;
  let answer;

  if (grade <= 2) {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const useSubtraction = Math.random() > 0.55;
    if (useSubtraction) {
      const bigger = Math.max(a, b);
      const smaller = Math.min(a, b);
      prompt = `${bigger} - ${smaller}`;
      answer = bigger - smaller;
    } else {
      prompt = `${a} + ${b}`;
      answer = a + b;
    }
  } else if (grade <= 4) {
    const max = grade === 3 ? 10 : 12;
    const a = Math.floor(Math.random() * (max - 1)) + 2;
    const b = Math.floor(Math.random() * (max - 1)) + 2;
    prompt = `${a} × ${b}`;
    answer = a * b;
  } else {
    const divisor = Math.floor(Math.random() * 11) + 2;
    answer = Math.floor(Math.random() * 11) + 2;
    prompt = `${divisor * answer} ÷ ${divisor}`;
  }

  return { prompt, answer, choices: makeChoices(answer, grade) };
}

const COCONUT_COLORS = ['#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#f97316'];

export default function NumberCatcher() {
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const baseTime = grade >= 4 ? 40 : 45;
  const [question, setQuestion] = useState(getQuestion(grade));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(baseTime);
  const [gameState, setGameState] = useState('playing'); // 'playing' | 'won' | 'lost'
  const [feedback, setFeedback] = useState(null); // { text, correct }
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const { addXP } = usePlayerStore();
  const timerRef = useRef(null);
  const awardedRef = useRef(false);

  useEffect(() => {
    if (gameState !== 'playing') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setGameState('lost'); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [gameState]);

  const handleAnswer = useCallback((chosen) => {
    if (gameState !== 'playing' || feedback) return;
    const correct = chosen === question.answer;
    if (correct) {
      setScore((s) => s + 10 + streak * 2);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
      setFeedback({ text: streak >= 3 ? `🔥 ${streak + 1} Combo!` : '✅ Correct!', correct: true });
    } else {
      setLives((l) => {
        if (l <= 1) { setGameState('lost'); return 0; }
        return l - 1;
      });
      setStreak(0);
      setFeedback({ text: `❌ Answer: ${question.answer}`, correct: false });
    }
    setTimeout(() => {
      setFeedback(null);
      setQuestion((currentQuestion) => (
        gameState === 'playing' && currentQuestion.answer === question.answer
          ? getQuestion(grade)
          : currentQuestion
      ));
    }, 600);
  }, [gameState, question, streak, grade, feedback]);

  useEffect(() => {
    if (gameState === 'lost' || gameState === 'won') {
      clearInterval(timerRef.current);
      if (!awardedRef.current && (gameState === 'lost' || score > 0)) {
        awardedRef.current = true;
        addXP(Math.floor(score / 2), 'Number Catcher', score, Math.min(100, score), 'Number Sense');
      }
    }
  }, [gameState, score, addXP]);

  const xpEarned = Math.floor(score / 2);
  const resetGame = () => {
    awardedRef.current = false;
    setScore(0);
    setLives(3);
    setTimeLeft(baseTime);
    setStreak(0);
    setBestStreak(0);
    setFeedback(null);
    setGameState('playing');
    setQuestion(getQuestion(grade));
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4">
      {/* Header */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link to="/student" className="btn btn-glass btn-sm">← Back</Link>
        <h1 className="font-display text-xl font-bold text-gradient">🥥 Number Catcher</h1>
        <div className="badge badge-warning text-xs">Grade {grade}</div>
      </div>

      {/* HUD */}
      <div className="w-full max-w-md glass-panel p-3 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-red-400 font-bold">
          {'❤️'.repeat(lives)}{'🖤'.repeat(3 - lives)}
        </div>
        <div className="hud-chip text-yellow-400 text-sm">Score: {score}</div>
        <div className={`hud-chip text-sm font-bold ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
          ⏱ {timeLeft}s
        </div>
        {streak >= 2 && <div className="hud-chip text-orange-400 text-sm">🔥 {streak}x</div>}
      </div>

      {/* Game Area */}
      {gameState === 'playing' && (
        <div className="w-full max-w-md">
          {/* Tree / coconut scene */}
          <motion.div
            className="glass-panel p-8 text-center mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(180deg, rgba(20,83,45,0.4) 0%, rgba(30,41,59,0.7) 100%)' }}
          >
            <div className="absolute top-2 left-4 text-4xl opacity-30 select-none">🌴</div>
            <div className="absolute top-2 right-4 text-4xl opacity-30 select-none">🌴</div>

            <p className="text-slate-300 text-sm mb-3 font-medium">Catch the basket with the answer:</p>
            <motion.div
              key={question.prompt}
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-8xl font-black text-gradient-orange mb-2"
            >
              {question.prompt}
            </motion.div>
            <div className="text-5xl animate-bounce">🥥</div>
          </motion.div>

          {/* Feedback */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-center text-xl font-bold mb-4 ${feedback.correct ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {feedback.text}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Choice buttons */}
          <p className="text-slate-400 text-sm text-center mb-3">Tap the matching basket!</p>
          <div className="grid grid-cols-2 gap-3">
            {question.choices.map((n, i) => (
              <motion.button
                key={`${n}-${i}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => handleAnswer(n)}
                className="py-6 rounded-2xl font-black text-4xl border-2 border-white/10 transition-all"
                style={{
                  background: `linear-gradient(135deg, ${COCONUT_COLORS[i % COCONUT_COLORS.length]}22, ${COCONUT_COLORS[i % COCONUT_COLORS.length]}11)`,
                  borderColor: `${COCONUT_COLORS[i % COCONUT_COLORS.length]}40`,
                }}
              >
                🧺 {n}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* End Screen */}
      {gameState !== 'playing' && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel p-8 text-center max-w-sm w-full"
        >
          <div className="text-6xl mb-4">{score >= 50 ? '🎉' : '😔'}</div>
          <h2 className="font-display text-3xl font-bold mb-2">{score >= 50 ? 'Great Catch!' : 'Game Over'}</h2>
          <div className="space-y-2 mb-6 text-slate-300">
            <p>Score: <strong className="text-primary">{score}</strong></p>
            <p>XP Earned: <strong className="text-yellow-400">+{xpEarned} XP</strong></p>
            <p>Best Combo: <strong className="text-orange-400">🔥 {bestStreak}x</strong></p>
          </div>
          <div className="flex gap-3">
            <button onClick={resetGame} className="btn btn-primary flex-1">
              🔄 Play Again
            </button>
            <Link to="/student" className="btn btn-glass flex-1 no-underline">🏘️ Village</Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
