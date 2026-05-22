import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, CircleHelp, CheckCircle2, Trophy, Flame, ArrowRightLeft, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';
import { useGamification } from '../hooks/useGamification';

const ROUND_COUNT_BY_GRADE = {
  1: 6,
  2: 6,
  3: 7,
  4: 8,
  5: 9,
  6: 10,
};

const FRACTION_POOLS = {
  1: [2, 3, 4, 5],
  2: [2, 3, 4, 5, 6],
  3: [2, 3, 4, 5, 6, 8],
  4: [2, 3, 4, 5, 6, 8, 10, 12],
  5: [2, 3, 4, 5, 6, 8, 10, 12, 15],
  6: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20],
};

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function simplifyFraction(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function fractionValue(numerator, denominator) {
  return numerator / denominator;
}

function formatFraction({ numerator, denominator }) {
  return `${numerator}/${denominator}`;
}

function pickDifferent(list, currentKey) {
  const pool = list.filter((item) => item.key !== currentKey);
  return pool[Math.floor(Math.random() * pool.length)];
}

function createRound(grade) {
  const pool = FRACTION_POOLS[grade] || FRACTION_POOLS[2];
  const typeRoll = Math.random();

  if (typeRoll < 0.34) {
    const denominator = pool[Math.floor(Math.random() * pool.length)];
    const numerator = Math.floor(Math.random() * (denominator - 1)) + 1;
    const correct = simplifyFraction(numerator, denominator);
    const correctKey = formatFraction(correct);
    const baseValue = fractionValue(correct.numerator, correct.denominator);
    const options = [correct];

    while (options.length < 4) {
      const fakeDenominator = pool[Math.floor(Math.random() * pool.length)];
      const fakeNumerator = Math.floor(Math.random() * (fakeDenominator - 1)) + 1;
      const fake = simplifyFraction(fakeNumerator, fakeDenominator);
      const fakeKey = formatFraction(fake);
      if (!options.some((item) => formatFraction(item) === fakeKey) && fakeKey !== correctKey) {
        options.push(fake);
      }
    }

    return {
      mode: 'simplify',
      prompt: 'Pick the simplified fraction',
      instruction: 'Reduce the fraction to its simplest form.',
      targetValue: baseValue,
      targetLabel: formatFraction({ numerator, denominator }),
      answerKey: correctKey,
      options: options.sort(() => Math.random() - 0.5).map((item) => ({
        key: formatFraction(item),
        label: formatFraction(item),
      })),
    };
  }

  if (typeRoll < 0.67) {
    const denominator = pool[Math.floor(Math.random() * pool.length)];
    const numerator = Math.floor(Math.random() * (denominator - 1)) + 1;
    const base = fractionValue(numerator, denominator);
    const options = [
      { key: 'lower', label: 'Smaller' },
      { key: 'equal', label: 'Equal' },
      { key: 'higher', label: 'Larger' },
    ];
    const correctKey = base < 0.5 ? 'lower' : base === 0.5 ? 'equal' : 'higher';

    return {
      mode: 'compare',
      prompt: 'How does it compare to 1/2?',
      instruction: `Look at ${numerator}/${denominator} and compare it with one-half.`,
      targetValue: base,
      targetLabel: formatFraction({ numerator, denominator }),
      answerKey: correctKey,
      options: options.map((item) => ({
        key: item.key,
        label: item.label,
      })),
    };
  }

  const denominator = pool[Math.floor(Math.random() * pool.length)];
  const numerator = Math.floor(Math.random() * (denominator - 1)) + 1;
  const correctValue = fractionValue(numerator, denominator);
  const fractions = [{ numerator, denominator }];

  while (fractions.length < 4) {
    const fakeDenominator = pool[Math.floor(Math.random() * pool.length)];
    const fakeNumerator = Math.floor(Math.random() * (fakeDenominator - 1)) + 1;
    const key = `${fakeNumerator}/${fakeDenominator}`;
    if (!fractions.some((item) => `${item.numerator}/${item.denominator}` === key)) {
      fractions.push({ numerator: fakeNumerator, denominator: fakeDenominator });
    }
  }

  return {
    mode: 'order',
    prompt: 'Select the smallest fraction',
    instruction: 'Choose the fraction with the lowest value.',
    targetValue: correctValue,
    targetLabel: formatFraction({ numerator, denominator }),
    answerKey: formatFraction({ numerator, denominator }),
    options: fractions
      .sort(() => Math.random() - 0.5)
      .map((item) => ({
        key: formatFraction(item),
        label: formatFraction(item),
      })),
  };
}

function FractionPreview({ round }) {
  const percent = Math.max(10, Math.min(100, round.targetValue * 100));
  return (
    <div className="relative w-56 h-56 sm:w-64 sm:h-64 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 drop-shadow-[0_0_24px_rgba(255,112,82,0.18)]">
        <circle cx="50" cy="50" r="46" fill="#fff7ed" stroke="#fed7aa" strokeWidth="4" />
        <circle
          cx="50"
          cy="50"
          r="28"
          fill="none"
          stroke="url(#fractionGradient)"
          strokeWidth="44"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="fractionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFCA42" />
            <stop offset="100%" stopColor="#FF7052" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-[#64748b]">Fraction Quest</div>
        <div className="text-3xl sm:text-4xl font-black text-[#1e293b] mt-2">{round.targetLabel}</div>
        <div className="text-xs sm:text-sm font-bold text-[#64748b] mt-2">{round.instruction}</div>
      </div>
    </div>
  );
}

function ChoiceCard({ option, selected, disabled, onClick, reveal, correct }) {
  const active = selected === option.key;
  const isCorrect = reveal && correct === option.key;
  const isWrong = reveal && active && !isCorrect;

  return (
    <button
      onClick={() => onClick(option.key)}
      disabled={disabled}
      className={[
        'rounded-2xl border-2 p-4 sm:p-5 text-left transition-all duration-300 shadow-sm',
        'bg-white hover:-translate-y-1 hover:shadow-md',
        isCorrect ? 'border-emerald-400 bg-emerald-50' : '',
        isWrong ? 'border-rose-400 bg-rose-50' : '',
        !reveal && active ? 'border-[#FF7052] ring-2 ring-[#FF7052]/15' : 'border-white/90',
        disabled ? 'cursor-not-allowed opacity-95' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xl sm:text-2xl font-black text-[#1e293b]">{option.label}</div>
          <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-[#94a3b8] mt-1">
            {reveal && isCorrect ? 'Correct' : 'Tap to answer'}
          </div>
        </div>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isCorrect ? 'bg-emerald-500 text-white' : isWrong ? 'bg-rose-500 text-white' : 'bg-[#f8fafc] text-[#64748b]'}`}>
          {isCorrect ? <CheckCircle2 size={18} /> : <CircleHelp size={18} />}
        </div>
      </div>
    </button>
  );
}

export default function FractionFrenzy() {
  const { user } = useAuthStore();
  const { addXP } = useGamification();
  const grade = normalizeGrade(user?.grade);
  const totalRounds = ROUND_COUNT_BY_GRADE[grade] || 6;

  const [started, setStarted] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [currentRound, setCurrentRound] = useState(() => createRound(grade));
  const [selected, setSelected] = useState(null);
  const [finished, setFinished] = useState(false);
  const [summary, setSummary] = useState({ correct: 0, total: 0 });

  const progress = useMemo(() => Math.round((roundIndex / totalRounds) * 100), [roundIndex, totalRounds]);

  const resetGame = () => {
    const next = createRound(grade);
    setStarted(false);
    setRoundIndex(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setFeedback(null);
    setSelected(null);
    setFinished(false);
    setSummary({ correct: 0, total: 0 });
    setCurrentRound(next);
  };

  const nextRound = () => {
    const nextIndex = roundIndex + 1;
    if (nextIndex >= totalRounds) {
      const accuracy = Math.round((score / totalRounds) * 100);
      addXP(score * 18 + bestStreak * 10 + (accuracy >= 80 ? 30 : 0), 'Fraction Frenzy', score, accuracy, 'Fractions');
      setSummary({ correct: score, total: totalRounds });
      setFinished(true);
      return;
    }
    setRoundIndex(nextIndex);
    setSelected(null);
    setFeedback(null);
    setCurrentRound(createRound(grade));
  };

  const handlePick = (key) => {
    if (feedback || finished) return;
    setSelected(key);
    const correct = currentRound.answerKey;
    const isCorrect = key === correct;

    if (isCorrect) {
      const nextScore = score + 1;
      const nextStreak = streak + 1;
      setScore(nextScore);
      setStreak(nextStreak);
      setBestStreak((prev) => Math.max(prev, nextStreak));
      setFeedback('correct');
    } else {
      setStreak(0);
      setFeedback('wrong');
    }

    window.setTimeout(() => {
      nextRound();
    }, 850);
  };

  if (!started) {
    return (
      <div className="max-w-5xl mx-auto px-3 md:px-6 pt-4 pb-20">
        <div className="flex items-center justify-between gap-3 mb-5">
          <Link to="/student" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-sm font-bold text-[#1e293b]">
            <ChevronLeft size={18} /> Back
          </Link>
          <div className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-[#94a3b8]">Grade {grade}</div>
        </div>

        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4 lg:gap-6 items-stretch">
          <div className="bg-white rounded-[28px] border border-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] p-5 sm:p-7 overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#FFCA42] via-[#FF8A5B] to-[#5EDAD0]" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7ED] text-[#C2410C] text-[11px] font-black uppercase tracking-wider">
              <Sparkles size={14} /> Fraction logic
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-black text-[#1e293b] leading-tight">Fraction Frenzy</h1>
            <p className="mt-3 text-sm sm:text-base text-[#475569] font-medium leading-7 max-w-2xl">
              A focused practice loop: simplify, compare, and rank fractions. Each round gives immediate feedback and rewards consistent streaks, not just speed.
            </p>

            <div className="grid sm:grid-cols-3 gap-3 mt-6">
              {[
                { label: 'Rounds', value: totalRounds },
                { label: 'Focus', value: 'Accuracy' },
                { label: 'Reward', value: 'XP + Coins' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-[#f8fafc] border border-slate-100 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">{item.label}</div>
                  <div className="mt-2 text-xl font-black text-[#1e293b]">{item.value}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStarted(true)}
              className="mt-7 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#FFCA42] to-[#FF7052] text-white font-black shadow-[0_12px_24px_rgba(255,112,82,0.25)] hover:scale-[1.01] active:scale-[0.99] transition-transform"
            >
              Start Challenge <ArrowRightLeft size={18} />
            </button>
          </div>

          <div className="bg-white rounded-[28px] border border-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] p-5 sm:p-7 flex items-center justify-center">
            <FractionPreview round={currentRound} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 pt-4 pb-20">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link to="/student" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-sm font-bold text-[#1e293b]">
          <ChevronLeft size={18} /> Back
        </Link>
        <button onClick={resetGame} className="text-sm font-bold text-[#FF7052]">
          Reset
        </button>
      </div>

      <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-4 lg:gap-6">
        <div className="bg-white rounded-[28px] border border-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.3em] text-[#94a3b8]">Round {roundIndex + 1} / {totalRounds}</div>
              <h2 className="mt-2 text-2xl sm:text-3xl font-black text-[#1e293b]">Fraction Frenzy</h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#FFF7ED] flex items-center justify-center text-[#FF7052]">
              <Trophy size={22} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Score</div>
              <div className="mt-1 text-2xl font-black text-[#1e293b]">{score}</div>
            </div>
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Streak</div>
              <div className="mt-1 text-2xl font-black text-[#1e293b]">{streak}</div>
            </div>
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Best</div>
              <div className="mt-1 text-2xl font-black text-[#1e293b]">{bestStreak}</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#FFCA42] to-[#FF7052]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-2 text-xs font-black uppercase tracking-widest text-[#94a3b8]">{progress}% complete</div>
          </div>

          <div className="mt-6 rounded-[24px] bg-gradient-to-br from-[#fff7ed] to-[#fff] border border-orange-100 p-5">
            <div className="flex items-center gap-2 text-[#C2410C] text-sm font-black uppercase tracking-wider">
              <Flame size={16} /> Focus prompt
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-black text-[#1e293b]">{currentRound.prompt}</div>
            <p className="mt-3 text-sm text-[#475569] font-medium leading-6">{currentRound.instruction}</p>
          </div>

          <div className="mt-6 text-sm text-[#64748b] font-medium leading-6">
            This game rewards careful thinking. Correct answers build streak bonuses; wrong answers reset the streak and sharpen the next decision.
          </div>
        </div>

        <div className="bg-white rounded-[28px] border border-white shadow-[0_12px_36px_rgba(15,23,42,0.06)] p-5 sm:p-6">
          <FractionPreview round={currentRound} />

          <div className="mt-6 grid gap-3">
            {currentRound.options.map((option) => (
              <ChoiceCard
                key={option.key}
                option={option}
                selected={selected}
                disabled={feedback !== null}
                onClick={handlePick}
                reveal={feedback !== null}
                correct={currentRound.answerKey}
              />
            ))}
          </div>

          <div className="min-h-10 mt-5 flex items-center justify-center text-center">
            {feedback === 'correct' && (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-4 py-2 font-black">
                <CheckCircle2 size={18} /> Correct. Keep the streak alive.
              </div>
            )}
            {feedback === 'wrong' && (
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 text-rose-700 px-4 py-2 font-black">
                <CircleHelp size={18} /> Not quite. Review the relationship and try the next one.
              </div>
            )}
            {!feedback && (
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 text-slate-500 px-4 py-2 font-black">
                <ArrowRightLeft size={18} /> Choose one answer
              </div>
            )}
          </div>
        </div>
      </div>

      {finished && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-lg rounded-[28px] bg-white shadow-2xl p-6 sm:p-7">
            <div className="w-16 h-16 rounded-2xl bg-[#FFF7ED] flex items-center justify-center text-[#FF7052]">
              <Trophy size={30} />
            </div>
            <h3 className="mt-4 text-3xl font-black text-[#1e293b]">Challenge complete</h3>
            <p className="mt-2 text-[#475569] font-medium">
              You solved {summary.correct} of {summary.total} rounds with a best streak of {bestStreak}.
            </p>
            <div className="mt-4 rounded-2xl bg-[#f8fafc] p-4 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-[#94a3b8]">XP Earned</div>
                <div className="mt-1 text-2xl font-black text-[#1e293b]">{score * 18 + bestStreak * 10}</div>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-[#94a3b8]">Accuracy</div>
                <div className="mt-1 text-2xl font-black text-[#1e293b]">{Math.round((summary.correct / summary.total) * 100)}%</div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={resetGame} className="flex-1 rounded-2xl bg-gradient-to-r from-[#FFCA42] to-[#FF7052] text-white font-black py-3">
                Play again
              </button>
              <button onClick={() => window.location.assign('/student')} className="flex-1 rounded-2xl bg-slate-100 text-[#1e293b] font-black py-3">
                Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
