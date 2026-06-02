import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Clock3, Trophy, Zap, Target, Sparkles, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';
import { useGamification } from '../hooks/useGamification';
import { getNextDifficulty, recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('ArithmeticGame'); // 'addition'

const ROUND_COUNT_BY_GRADE = { 1: 8, 2: 8, 3: 9, 4: 10, 5: 11, 6: 12 };
const OPERATOR_LABELS = {
  addition: 'Addition',
  subtraction: 'Subtraction',
  multiplication: 'Multiplication',
  division: 'Division',
};

function getTopicPlan(grade) {
  if (grade <= 2) return ['addition', 'subtraction', 'addition', 'subtraction'];
  if (grade <= 4) return ['addition', 'subtraction', 'multiplication', 'multiplication'];
  return ['multiplication', 'division', 'multiplication', 'division'];
}

function createAdditionRound(grade) {
  const high = grade <= 2 ? 20 : grade <= 4 ? 80 : 120;
  const low = grade <= 2 ? 0 : 2;
  const a = Math.floor(Math.random() * (high - low + 1)) + low;
  const b = Math.floor(Math.random() * (high - low + 1)) + low;
  const answer = a + b;
  const options = new Set([answer]);
  while (options.size < 4) options.add(answer + Math.floor(Math.random() * 15) - 7);
  return {
    type: 'addition',
    prompt: `${a} + ${b}`,
    answer,
    options: [...options].sort(() => Math.random() - 0.5),
    skill: 'Compute accurately and build speed.',
  };
}

function createSubtractionRound(grade) {
  const high = grade <= 2 ? 20 : grade <= 4 ? 100 : 150;
  const a = Math.floor(Math.random() * high) + 5;
  const b = Math.floor(Math.random() * a);
  const answer = a - b;
  const options = new Set([answer]);
  while (options.size < 4) options.add(Math.max(0, answer + Math.floor(Math.random() * 15) - 7));
  return {
    type: 'subtraction',
    prompt: `${a} - ${b}`,
    answer,
    options: [...options].sort(() => Math.random() - 0.5),
    skill: 'Reason about difference and quantity left.',
  };
}

function createMultiplicationRound(grade) {
  const max = grade <= 4 ? 12 : 15;
  const a = Math.floor(Math.random() * (max - 1)) + 2;
  const b = Math.floor(Math.random() * (max - 1)) + 2;
  const answer = a * b;
  const options = new Set([answer]);
  while (options.size < 4) options.add(Math.max(1, answer + Math.floor(Math.random() * 30) - 15));
  return {
    type: 'multiplication',
    prompt: `${a} × ${b}`,
    answer,
    options: [...options].sort(() => Math.random() - 0.5),
    skill: 'Use patterns, repeated groups, and tables.',
  };
}

function createDivisionRound(grade) {
  const max = grade <= 5 ? 12 : 15;
  const divisor = Math.floor(Math.random() * (max - 1)) + 2;
  const quotient = Math.floor(Math.random() * (max - 1)) + 2;
  const dividend = divisor * quotient;
  const answer = quotient;
  const options = new Set([answer]);
  while (options.size < 4) options.add(Math.max(1, answer + Math.floor(Math.random() * 12) - 6));
  return {
    type: 'division',
    prompt: `${dividend} ÷ ${divisor}`,
    answer,
    options: [...options].sort(() => Math.random() - 0.5),
    skill: 'Connect division to equal sharing and multiplication.',
  };
}

function createRound(grade, topic) {
  if (topic === 'addition') return createAdditionRound(grade);
  if (topic === 'subtraction') return createSubtractionRound(grade);
  if (topic === 'multiplication') return createMultiplicationRound(grade);
  return createDivisionRound(grade);
}

function getPerformanceTone(accuracy) {
  if (accuracy >= 90) return { label: 'Mastery', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (accuracy >= 75) return { label: 'Strong', tone: 'text-sky-700 bg-sky-50 border-sky-200' };
  if (accuracy >= 50) return { label: 'Developing', tone: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Building', tone: 'text-rose-700 bg-rose-50 border-rose-200' };
}

function StatCard({ label, value, sublabel, icon }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{label}</div>
        <div className="text-[#FF7052]">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{sublabel}</div>
    </div>
  );
}

export default function ArithmeticGame() {
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  // Timestamp of when the current round was shown; used to compute responseTime
  // for the adaptive learning engine. Set when a round loads / session starts.
  const questionStartRef = useRef(0);

  const { user } = useAuthStore();
  const { addXP } = useGamification();

  const grade = normalizeGrade(user?.grade);
  const roundLimit = ROUND_COUNT_BY_GRADE[grade] || 8;
  const topics = useMemo(() => getTopicPlan(grade), [grade]);

  const [phase, setPhase] = useState('intro'); // intro | play | results
  const [roundIndex, setRoundIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [highlight, setHighlight] = useState(false);
  // Initial difficulty is seeded from the adaptive learning engine.
  const [difficulty, setDifficulty] = useState(() => getNextDifficulty(SKILL));
  const [round, setRound] = useState(() => createRound(grade, topics[0]));
  const [sessionSummary, setSessionSummary] = useState(null);

  const currentTopic = topics[roundIndex % topics.length];
  const progressPct = Math.round((roundIndex / roundLimit) * 100);
  const currentAccuracy = roundIndex === 0 ? 0 : Math.round((score / roundIndex) * 100);

  const startSession = () => {
    const nextRound = createRound(grade, topics[0]);
    setDifficulty(getNextDifficulty(SKILL));
    setPhase('play');
    setRoundIndex(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMistakes(0);
    setElapsed(0);
    setAnswer('');
    setFeedback(null);
    setHighlight(false);
    setSessionSummary(null);
    setRound(nextRound);
    questionStartRef.current = Date.now();
    window.setTimeout(() => inputRef.current?.focus(), 50);
  };

  const finishSession = () => {
    const accuracy = roundIndex === 0 ? 0 : Math.round((score / roundIndex) * 100);
    const xpEarned = Math.max(20, score * 18 + bestStreak * 12 + (accuracy >= 85 ? 30 : 0));
    // `difficulty` is seeded from the adaptive learning engine (getNextDifficulty)
    // and passed through as engine-difficulty context (ignored by the XP shim).
    addXP(xpEarned, 'Number Ninja', score, accuracy, 'Arithmetic', difficulty);
    setSessionSummary({
      score,
      accuracy,
      xpEarned,
      bestStreak,
      mistakes,
    });
    setPhase('results');
  };

  useEffect(() => {
    if (phase !== 'play') return;
    timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play') return;
    if (roundIndex >= roundLimit) finishSession();
  }, [roundIndex, roundLimit, phase]);

  const loadNextRound = () => {
    const nextIndex = roundIndex + 1;
    const nextTopic = topics[nextIndex % topics.length];
    setRoundIndex(nextIndex);
    setFeedback(null);
    setAnswer('');
    setHighlight(false);
    setRound(createRound(grade, nextTopic));
    questionStartRef.current = Date.now();
    window.setTimeout(() => inputRef.current?.focus(), 25);
  };

  const submitAnswer = (event) => {
    event.preventDefault();
    if (phase !== 'play') return;

    const parsed = Number(answer);
    const correct = parsed === round.answer;
    const responseTime = Date.now() - questionStartRef.current;
    recordAttempt({ skillId: SKILL, correct, responseTime });
    setHighlight(true);

    if (correct) {
      const nextStreak = streak + 1;
      setScore((value) => value + 1);
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      setFeedback('correct');
    } else {
      setStreak(0);
      setMistakes((value) => value + 1);
      setFeedback('wrong');
    }

    window.setTimeout(() => {
      if (roundIndex + 1 >= roundLimit) {
        finishSession();
      } else {
        loadNextRound();
      }
    }, 750);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-[28px] bg-white p-8 shadow-xl border border-slate-100 text-center">
          <h2 className="text-2xl font-black text-slate-900">Login required</h2>
          <p className="mt-3 text-slate-600">You need an active student profile to use the game.</p>
          <a href="/login" className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-900 text-white px-5 py-3 font-black">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div className="max-w-6xl mx-auto px-3 md:px-6 py-4">
        <div className="flex items-center justify-between mb-5">
          <Link to="/student" className="inline-flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-3 py-2 font-bold text-slate-800 shadow-sm">
            <ChevronLeft size={18} /> Back
          </Link>
          <div className="rounded-full bg-slate-900 text-white px-3 py-2 text-xs font-black uppercase tracking-[0.22em]">
            Grade {grade}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5">
          <section className="relative overflow-hidden rounded-[32px] bg-white border border-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] p-6 sm:p-8">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#FFCA42] via-[#FF7052] to-[#5EDAD0]" />
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-[#C2410C]">
              <Sparkles size={14} /> Adaptive practice
            </div>
            <h1 className="mt-4 text-4xl sm:text-5xl font-black text-slate-950 leading-[1.05]">
              Number Ninja
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] sm:text-base leading-7 text-slate-600">
              A structured math session that feels like a real learning experience: mixed skills, clear feedback, and a clean reward model that values accuracy, consistency, and focus.
            </p>

            <div className="mt-7 grid sm:grid-cols-3 gap-3">
              <StatCard label="Rounds" value={roundLimit} sublabel="Short, focused practice" icon={<Target size={18} />} />
              <StatCard label="Loop" value="Adaptive" sublabel="Alternates skills intelligently" icon={<Zap size={18} />} />
              <StatCard label="Reward" value="XP" sublabel="Earn based on quality" icon={<Trophy size={18} />} />
            </div>

            <div className="mt-7 rounded-[28px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-slate-400">
                <Clock3 size={16} /> What you’ll do
              </div>
              <div className="mt-4 grid gap-3">
                {[
                  'Answer one question at a time with immediate feedback.',
                  'Build streaks to unlock stronger end-of-session rewards.',
                  'Practice addition, subtraction, multiplication, and division in a balanced sequence.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
                    <div className="mt-0.5 h-6 w-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">✓</div>
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={startSession}
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFCA42] to-[#FF7052] px-5 py-3.5 font-black text-white shadow-[0_14px_28px_rgba(255,112,82,0.24)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
            >
              Start Session <ArrowRight size={18} />
            </button>
          </section>

          <aside className="rounded-[32px] bg-slate-950 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] p-6 sm:p-8">
            <div className="text-xs font-black uppercase tracking-[0.26em] text-white/50">Preview</div>
            <div className="mt-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="text-sm font-black uppercase tracking-[0.24em] text-white/40">Question style</div>
              <div className="mt-4 text-5xl font-black tracking-tight">{round.prompt}</div>
              <p className="mt-4 text-white/70 text-sm leading-6">{round.skill}</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { label: 'Mixed skills', value: 'Yes' },
                { label: 'Age-aware', value: `Grade ${grade}` },
                { label: 'Session size', value: `${roundLimit} rounds` },
                { label: 'Focus', value: 'Accuracy first' },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl bg-white/5 border border-white/10 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/45 font-black">{item.label}</div>
                  <div className="mt-2 text-lg font-black">{item.value}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (phase === 'results' && sessionSummary) {
    const performance = getPerformanceTone(sessionSummary.accuracy);
    return (
      <div className="max-w-4xl mx-auto px-3 md:px-6 py-4">
        <div className="rounded-[32px] bg-white border border-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF7ED] px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-[#C2410C]">
            <Trophy size={14} /> Session complete
          </div>
          <h2 className="mt-4 text-4xl font-black text-slate-950">Strong work</h2>
          <p className="mt-3 text-slate-600 max-w-2xl leading-7">
            You finished the session with {sessionSummary.accuracy}% accuracy and a best streak of {sessionSummary.bestStreak}. The reward is based on performance, not just completion.
          </p>

          <div className="mt-6 grid sm:grid-cols-4 gap-3">
            <StatCard label="Score" value={sessionSummary.score} sublabel="Correct answers" icon={<CheckCircle2 size={18} />} />
            <StatCard label="Accuracy" value={`${sessionSummary.accuracy}%`} sublabel="Quality of work" icon={<Target size={18} />} />
            <StatCard label="Best streak" value={sessionSummary.bestStreak} sublabel="Consistency" icon={<Zap size={18} />} />
            <StatCard label="XP earned" value={sessionSummary.xpEarned} sublabel="Session reward" icon={<Trophy size={18} />} />
          </div>

          <div className={`mt-6 rounded-3xl border p-5 ${performance.tone}`}>
            <div className="text-xs font-black uppercase tracking-[0.26em] opacity-70">{performance.label}</div>
            <div className="mt-2 text-sm leading-6 font-medium">
              {sessionSummary.accuracy >= 85
                ? 'This is a solid learning session. The player showed control, not just speed.'
                : sessionSummary.accuracy >= 60
                  ? 'This is usable classroom practice. A second run will likely lift accuracy and confidence.'
                  : 'The session exposed gaps clearly, which is useful. The next run should be slower and more deliberate.'}
            </div>
          </div>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <button onClick={startSession} className="rounded-2xl bg-gradient-to-r from-[#FFCA42] to-[#FF7052] px-5 py-3 font-black text-white">
              Play again
            </button>
            <button onClick={() => window.location.assign('/student')} className="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-900">
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 md:px-6 py-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link to="/student" className="inline-flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-3 py-2 font-bold text-slate-800 shadow-sm">
          <ChevronLeft size={18} /> Back
        </Link>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-white text-xs font-black uppercase tracking-[0.24em]">
          <Clock3 size={14} /> {elapsed}s
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-5">
        <section className="rounded-[32px] bg-white border border-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.26em] text-slate-400">
                Round {roundIndex + 1} / {roundLimit}
              </div>
              <h2 className="mt-2 text-3xl sm:text-4xl font-black text-slate-950">Number Ninja</h2>
              <p className="mt-2 text-slate-500 text-sm leading-6">
                {OPERATOR_LABELS[currentTopic]} focus
              </p>
            </div>
            <div className="rounded-3xl bg-[#FFF7ED] p-4 text-[#C2410C]">
              <Sparkles size={24} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <StatCard label="Score" value={score} sublabel="Correct answers" icon={<CheckCircle2 size={18} />} />
            <StatCard label="Streak" value={streak} sublabel="Consecutive correct" icon={<Zap size={18} />} />
            <StatCard label="Mistakes" value={mistakes} sublabel="Learned from" icon={<XCircle size={18} />} />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.24em] text-slate-400">
              <span>Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#FFCA42] via-[#FF8A5B] to-[#FF7052]" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="mt-6 rounded-[28px] bg-slate-950 text-white p-6 sm:p-7 overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,202,66,0.22),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(94,218,208,0.18),transparent_30%)]" />
            <div className="relative">
              <div className="text-xs font-black uppercase tracking-[0.26em] text-white/45">Solve this</div>
              <div className={`mt-4 text-6xl sm:text-7xl font-black tracking-tight transition-colors ${highlight && feedback === 'correct' ? 'text-emerald-300' : highlight && feedback === 'wrong' ? 'text-rose-300' : 'text-white'}`}>
                {round.prompt}
              </div>
              <p className="mt-4 max-w-md text-white/70 text-sm leading-6">{round.skill}</p>
            </div>
          </div>

          <form onSubmit={submitAnswer} className="mt-6">
            <label className="block text-xs font-black uppercase tracking-[0.24em] text-slate-400 mb-2">Your answer</label>
            <input
              ref={inputRef}
              type="number"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-3xl font-black text-slate-950 outline-none focus:border-[#FF7052] focus:bg-white transition-colors"
              placeholder="0"
              inputMode="numeric"
              autoFocus
            />
            <button type="submit" className="mt-4 w-full rounded-2xl bg-slate-950 px-5 py-3.5 font-black text-white">
              Check answer
            </button>
          </form>
        </section>

        <aside className="rounded-[32px] bg-white border border-white shadow-[0_18px_50px_rgba(15,23,42,0.08)] p-6 sm:p-7">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-slate-400">
            <Target size={14} /> Practice quality
          </div>
          <div className="mt-4 rounded-[28px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-5">
            <div className="text-sm font-black text-slate-500 uppercase tracking-[0.2em]">Goal</div>
            <div className="mt-2 text-2xl font-black text-slate-950">Stay accurate and composed</div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Every correct answer reinforces the current skill. Wrong answers do not end the session; they simply reset the streak and move the learner forward.
            </p>
          </div>

          <div className="mt-6 grid gap-3">
            {[
              { label: 'Current topic', value: OPERATOR_LABELS[currentTopic] },
              { label: 'Answer accepted', value: 'Single number' },
              { label: 'Reward basis', value: 'Accuracy + streak' },
              { label: 'Session length', value: `${roundLimit} rounds` },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                <div className="mt-2 text-lg font-black text-slate-950">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[28px] bg-[#FFF7ED] border border-[#fed7aa] p-5">
            <div className="flex items-center gap-2 text-[#C2410C] font-black">
              {feedback === 'correct' ? <CheckCircle2 size={18} /> : feedback === 'wrong' ? <XCircle size={18} /> : <Sparkles size={18} />}
              {feedback === 'correct' ? 'Correct answer' : feedback === 'wrong' ? 'Review and continue' : 'Ready to answer'}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {feedback === 'correct'
                ? 'Strong decision. Keep the same level of focus.'
                : feedback === 'wrong'
                  ? `The right answer was ${round.answer}.`
                  : 'Enter a number and press Check answer.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
