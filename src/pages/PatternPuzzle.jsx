import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Grid3X3, RotateCcw, ShieldAlert, Sparkles, TimerReset } from 'lucide-react';
import { useGamification } from '../hooks/useGamification';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';
import { getNextDifficulty, recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('PatternPuzzle'); // 'patterns'
const DIFFICULTY_START = { easy: 0, medium: 1, hard: 2 }; // engine string -> starting rule offset
// Seed the first puzzle's rule selection from the adaptive learning engine. This
// only nudges which rule appears first; it does not change the round counter or UI.
function startSeedFromEngine() {
  return DIFFICULTY_START[getNextDifficulty(SKILL)] ?? 0;
}

const RULES = [
  {
    id: 'sum',
    title: 'Row Sum Rule',
    clue: 'The missing cell is the sum of the two numbers in its row.',
    build: () => {
      const a = randomInt(2, 7);
      const b = randomInt(2, 7);
      return {
        matrix: [
          [a, b, a + b],
          [randomInt(3, 8), randomInt(2, 6), randomInt(4, 10)],
          [randomInt(4, 9), randomInt(3, 7), null],
        ],
        answer: null,
        hidden: [2, 2],
        solution: null,
      };
    },
    solve: (matrix) => matrix[2][0] + matrix[2][1],
  },
  {
    id: 'diff',
    title: 'Difference Matrix',
    clue: 'Each row follows subtraction: left minus middle equals right.',
    build: () => {
      const left = randomInt(10, 18);
      const mid = randomInt(2, 8);
      return {
        matrix: [
          [left, mid, left - mid],
          [randomInt(11, 20), randomInt(2, 9), null],
          [randomInt(12, 22), randomInt(3, 10), randomInt(4, 15)],
        ],
        answer: null,
        hidden: [1, 2],
        solution: null,
      };
    },
    solve: (matrix) => matrix[1][0] - matrix[1][1],
  },
  {
    id: 'product',
    title: 'Product Column',
    clue: 'The missing value is the product of the other two numbers in its column.',
    build: () => {
      const top = randomInt(2, 6);
      const mid = randomInt(2, 5);
      return {
        matrix: [
          [top, randomInt(2, 7), randomInt(2, 6)],
          [mid, randomInt(2, 8), randomInt(3, 9)],
          [top * mid, randomInt(3, 9), null],
        ],
        answer: null,
        hidden: [2, 2],
        solution: null,
      };
    },
    solve: (matrix) => matrix[0][0] * matrix[1][0],
  },
  {
    id: 'sequence',
    title: 'Arithmetic Path',
    clue: 'The grid increases by a constant step from left to right and top to bottom.',
    build: () => {
      const start = randomInt(1, 8);
      const step = randomInt(2, 5);
      const matrix = [];
      for (let r = 0; r < 3; r += 1) {
        const row = [];
        for (let c = 0; c < 3; c += 1) {
          row.push(start + (r * 3 + c) * step);
        }
        matrix.push(row);
      }
      matrix[1][1] = null;
      return {
        matrix,
        answer: null,
        hidden: [1, 1],
        solution: null,
      };
    },
    solve: (matrix) => {
      const left = matrix[1][0];
      const right = matrix[1][2];
      return Math.round((left + right) / 2);
    },
  },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampRuleSet(grade) {
  if (grade <= 2) return RULES.slice(0, 2);
  if (grade === 3) return RULES.slice(0, 3);
  return RULES;
}

function generatePuzzle(grade, roundIndex) {
  const pool = clampRuleSet(grade);
  const rule = pool[roundIndex % pool.length];
  const base = rule.build();
  const solution = rule.solve(base.matrix);
  const options = new Set([solution]);

  while (options.size < 4) {
    const delta = randomInt(-8, 8) || 1;
    const candidate = Math.max(1, solution + delta);
    options.add(candidate);
  }

  return {
    id: `${rule.id}-${roundIndex}-${Date.now()}`,
    rule,
    matrix: base.matrix,
    solution,
    options: [...options].sort(() => Math.random() - 0.5),
  };
}

function MatrixBoard({ matrix, selected, locked, onCellSelect }) {
  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-3">
      {matrix.map((row, r) => (
        <div key={r} className="grid grid-cols-3 gap-2 sm:gap-3">
          {row.map((cell, c) => {
            const isSelected = selected?.r === r && selected?.c === c;
            const isHidden = cell === null;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                disabled={locked || !isHidden}
                onClick={() => onCellSelect(r, c)}
                className={`aspect-square rounded-xl border text-lg font-black transition-all sm:text-2xl ${
                  isHidden
                    ? isSelected
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-900 ring-4 ring-cyan-200'
                      : 'border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-cyan-300 hover:bg-cyan-50'
                    : 'cursor-default border-slate-200 bg-slate-100 text-slate-900'
                }`}
              >
                {isHidden ? (isSelected ? '?' : 'Select') : cell}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function OptionPill({ value, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(value)}
      className={`rounded-xl border px-4 py-3 text-lg font-black transition-all disabled:cursor-not-allowed ${
        active
          ? 'border-cyan-400 bg-cyan-50 text-cyan-900 shadow-sm'
          : 'border-slate-200 bg-white text-slate-800 hover:border-cyan-300 hover:bg-cyan-50'
      }`}
    >
      {value}
    </button>
  );
}

export default function PatternPuzzle() {
  const { addXP } = useGamification();
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const navigate = useNavigate();

  const totalRounds = grade <= 2 ? 5 : grade === 3 ? 6 : grade === 4 ? 7 : 8;
  const [roundIndex, setRoundIndex] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(grade, startSeedFromEngine()));
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timer, setTimer] = useState(18);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState('ready');
  const [feedback, setFeedback] = useState('Choose the missing cell, inspect the clue, then pick the correct value.');

  const locked = status !== 'playing';
  const restart = () => {
    setRoundIndex(0);
    setPuzzle(generatePuzzle(grade, startSeedFromEngine()));
    setSelectedCell(null);
    setSelectedOption(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTimer(18);
    setMistakes(0);
    setStatus('ready');
    setFeedback('Choose the missing cell, inspect the clue, then pick the correct value.');
  };

  const startGame = () => {
    setStatus('playing');
    setFeedback('Matrix online. Read the rule and solve the hidden cell.');
  };

  useEffect(() => {
    if (status !== 'playing') return undefined;
    const tick = setInterval(() => {
      setTimer((current) => {
        if (current <= 1) {
          setMistakes((value) => {
            const next = value + 1;
            if (next >= 3) {
              setStatus('ended');
              return next;
            }
            setFeedback('Time expired. A new matrix has been deployed.');
            setPuzzle(generatePuzzle(grade, roundIndex));
            setSelectedCell(null);
            setSelectedOption(null);
            setRoundIndex((index) => index + 1);
            return next;
          });
          return 18;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [grade, roundIndex, status]);

  useEffect(() => {
    if (status !== 'ended') return;
    const accuracy = Math.max(0, Math.round((score / Math.max(1, score + mistakes)) * 100));
    addXP(Math.max(60, score * 30 + bestStreak * 12 + accuracy), 'Grid Matrix Puzzle', score, accuracy, 'Patterns');
  }, [addXP, bestStreak, mistakes, score, status]);

  const submitAnswer = (value) => {
    if (locked || !selectedCell) return;
    setSelectedOption(value);

    const correct = value === puzzle.solution;
    recordAttempt({ skillId: SKILL, correct, responseTime: 0 });

    if (correct) {
      const nextScore = score + 1;
      const nextStreak = streak + 1;
      setScore(nextScore);
      setStreak(nextStreak);
      setBestStreak((best) => Math.max(best, nextStreak));
      setFeedback(`Correct. ${puzzle.rule.title} solved.`);

      if (roundIndex + 1 >= totalRounds) {
        setStatus('ended');
        return;
      }

      setTimeout(() => {
        setRoundIndex((index) => index + 1);
        setPuzzle(generatePuzzle(grade, roundIndex + 1));
        setSelectedCell(null);
        setSelectedOption(null);
        setTimer(18);
        setFeedback('Next matrix loaded. Solve again.');
      }, 900);
      return;
    }

    setMistakes((current) => {
      const next = current + 1;
      if (next >= 3) {
        setStatus('ended');
      }
      return next;
    });
    setStreak(0);
    setFeedback(`Not quite. ${puzzle.rule.clue}`);
  };

  const onCellSelect = (r, c) => {
    if (locked) return;
    setSelectedCell({ r, c });
    setSelectedOption(null);
    setFeedback('Cell selected. Use the clue to decide the missing value.');
  };

  const accuracy = Math.max(0, Math.round((score / Math.max(1, score + mistakes)) * 100));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f4f7fb] px-3 py-4 text-slate-900 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/student" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-950" aria-label="Back to dashboard">
              <ArrowLeft size={19} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Grid3X3 size={24} className="text-violet-700" />
                <h1 className="font-display text-2xl font-black leading-none text-slate-950">Matrix Puzzle Lab</h1>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">Find the missing cell by reading the matrix rule.</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score</p><p className="text-base font-black tabular-nums">{score}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Round</p><p className="text-base font-black tabular-nums">{Math.min(roundIndex + 1, totalRounds)}/{totalRounds}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Timer</p><p className="text-base font-black tabular-nums text-cyan-700">{timer}s</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mistakes</p><p className="text-base font-black tabular-nums text-rose-700">{mistakes}/3</p></div>
          </div>
        </header>

        {status === 'ended' ? (
          <section className="grid min-h-[620px] place-items-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="max-w-lg">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                {mistakes >= 3 ? <ShieldAlert size={34} /> : <CheckCircle2 size={34} />}
              </div>
              <h2 className="font-display text-4xl font-black text-slate-950">{mistakes >= 3 ? 'Matrix Overload' : 'Matrix Solved'}</h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
                You solved {score} matrices, held a best streak of {bestStreak}, and finished with {accuracy}% accuracy.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Score</p><p className="text-xl font-black">{score}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Best streak</p><p className="text-xl font-black">{bestStreak}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Accuracy</p><p className="text-xl font-black">{accuracy}%</p></div>
              </div>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <button onClick={restart} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-violet-800">
                  <RotateCcw size={17} /> Play Again
                </button>
                <button onClick={() => navigate('/student')} className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                  Dashboard
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
            <section className="relative space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Rule deck</p>
                    <h2 className="font-display text-2xl font-black text-slate-950">{puzzle.rule.title}</h2>
                  </div>
                  <div className="rounded-lg bg-violet-50 px-3 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">Difficulty</p>
                    <p className="text-sm font-black text-violet-900">Grade {grade}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-slate-600">{puzzle.rule.clue}</p>
              </div>

              <MatrixBoard
                matrix={puzzle.matrix}
                selected={selectedCell}
                locked={locked}
                onCellSelect={onCellSelect}
              />

              {status === 'ready' && (
                <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/80 p-6 text-center backdrop-blur-sm">
                  <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <Grid3X3 size={46} className="mx-auto mb-4 text-violet-700" />
                    <h2 className="font-display text-3xl font-black text-slate-950">Matrix Puzzle Lab</h2>
                    <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
                      Inspect the matrix, select the missing cell, then choose the value that satisfies the rule.
                    </p>
                    <button onClick={startGame} className="mt-6 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-violet-800">
                      Start Lab
                    </button>
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <TimerReset size={17} className="text-cyan-700" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Answer bank</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {puzzle.options.map((option) => (
                    <OptionPill
                      key={option}
                      value={option}
                      active={selectedOption === option}
                      disabled={locked || !selectedCell}
                      onClick={submitAnswer}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles size={17} className="text-violet-700" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Feedback</h3>
                </div>
                <p className="min-h-[64px] rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold leading-relaxed text-slate-700">{feedback}</p>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={17} className="text-emerald-600" />
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Pattern status</h3>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{streak} streak</div>
                </div>
                <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Selected cell</span><span>{selectedCell ? `${selectedCell.r + 1}, ${selectedCell.c + 1}` : 'None'}</span></div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span>Round accuracy</span><span>{accuracy}%</span></div>
                </div>
                <button onClick={restart} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                  <RotateCcw size={16} /> Reset Lab
                </button>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
