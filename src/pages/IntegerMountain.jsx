import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Flag, MapPinned, Mountain, RotateCcw, ShieldCheck, Sigma, Wind } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';

const BASE_CAMP = 0;

const MISSIONS = [
  {
    title: 'Warm Base Camp',
    story: 'Reach the first supply marker above base camp.',
    start: 0,
    target: 5,
    low: -8,
    high: 10,
    oxygen: 5,
    equation: { known: 2, result: 5 },
    cards: [
      { id: 'm1-c', label: '-4', value: -4, note: 'slide into a valley' },
      { id: 'm1-d', label: '+6', value: 6, note: 'steep shortcut' },
      { id: 'm1-e', label: '+1', value: 1, note: 'small ridge step' },
    ],
  },
  {
    title: 'Frozen Valley Rescue',
    story: 'Drop below zero to find the lost compass, then return to the rescue point.',
    start: 4,
    target: -6,
    low: -12,
    high: 12,
    oxygen: 5,
    equation: { known: -3, result: -6 },
    cards: [
      { id: 'm2-a', label: '-5', value: -5, note: 'descend past zero' },
      { id: 'm2-c', label: '+4', value: 4, note: 'recover altitude' },
      { id: 'm2-d', label: '-2', value: -2, note: 'short icy drop' },
      { id: 'm2-e', label: '+7', value: 7, note: 'ridge climb' },
    ],
  },
  {
    title: 'Avalanche Detour',
    story: 'Avoid the red danger zone and land exactly on the ranger camp.',
    start: -3,
    target: 9,
    low: -14,
    high: 14,
    oxygen: 6,
    danger: [-10, -9, -8, -7],
    equation: { known: 7, result: 12 },
    cards: [
      { id: 'm3-a', label: '+8', value: 8, note: 'major climb' },
      { id: 'm3-b', label: '-4', value: -4, note: 'wrong ravine' },
      { id: 'm3-d', label: '-6', value: -6, note: 'avalanche slope' },
      { id: 'm3-e', label: '+2', value: 2, note: 'final steps' },
    ],
  },
  {
    title: 'Summit Equation',
    story: 'Use positive and negative moves to finish at the summit beacon.',
    start: 6,
    target: -4,
    low: -16,
    high: 16,
    oxygen: 6,
    danger: [12, 13, 14, 15],
    equation: { known: -7, result: -10 },
    cards: [
      { id: 'm4-a', label: '-9', value: -9, note: 'deep descent' },
      { id: 'm4-c', label: '-7', value: -7, note: 'long drop' },
      { id: 'm4-d', label: '+10', value: 10, note: 'summit ridge' },
      { id: 'm4-e', label: '-4', value: -4, note: 'snow chute' },
      { id: 'm4-f', label: '+6', value: 6, note: 'rope pull' },
    ],
  },
  {
    title: 'Expert Ridge Traverse',
    story: 'Plan a short route through both sides of zero and stop on the final altitude.',
    start: -8,
    target: 7,
    low: -20,
    high: 20,
    oxygen: 7,
    danger: [-18, -17, 16, 17],
    equation: { known: 6, result: 15 },
    cards: [
      { id: 'm5-a', label: '+11', value: 11, note: 'long ascent' },
      { id: 'm5-b', label: '-5', value: -5, note: 'controlled descent' },
      { id: 'm5-c', label: '+4', value: 4, note: 'ridge steps' },
      { id: 'm5-e', label: '-12', value: -12, note: 'dangerous ravine' },
      { id: 'm5-f', label: '+1', value: 1, note: 'final meter' },
    ],
  },
];

function getMissionCount(grade) {
  if (grade <= 3) return 3;
  if (grade <= 5) return 4;
  return 5;
}

function formatInteger(value) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function getEquationAnswer(mission) {
  return mission.equation.result - mission.equation.known;
}

function ElevationMap({ mission, position, previewPosition, visited }) {
  const levels = [];
  for (let level = mission.high; level >= mission.low; level -= 1) levels.push(level);

  const danger = mission.danger || [];
  const activePosition = previewPosition ?? position;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Elevation number line</p>
          <h2 className="font-display text-xl font-black text-slate-950">Altitude {formatInteger(position)}</h2>
        </div>
        <div className="rounded-lg bg-cyan-50 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Target</p>
          <p className="text-lg font-black text-cyan-900">{formatInteger(mission.target)}</p>
        </div>
      </div>

      <div className="relative grid max-h-[620px] grid-cols-[54px_1fr] overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
        {levels.map((level) => {
          const isZero = level === BASE_CAMP;
          const isCurrent = level === position;
          const isPreview = level === previewPosition;
          const isTarget = level === mission.target;
          const isVisited = visited.includes(level);
          const isDanger = danger.includes(level);

          return (
            <div key={level} className="contents">
              <div className={`flex h-8 items-center justify-end border-r border-slate-200 pr-2 text-xs font-bold tabular-nums ${
                isZero ? 'bg-slate-200 text-slate-900' : level > 0 ? 'text-emerald-700' : 'text-blue-700'
              }`}>
                {formatInteger(level)}
              </div>
              <div className={`relative flex h-8 items-center border-b border-slate-100 px-3 ${
                isZero ? 'bg-slate-200/80' : isDanger ? 'bg-rose-50' : level > 0 ? 'bg-emerald-50/40' : 'bg-blue-50/40'
              }`}>
                <div className={`h-px flex-1 ${isZero ? 'bg-slate-500' : 'bg-slate-200'}`} />
                {isVisited && <span className="absolute left-3 h-2 w-2 rounded-full bg-slate-400" />}
                {isDanger && <span className="absolute right-3 text-[10px] font-black uppercase tracking-wide text-rose-500">danger</span>}
                {isTarget && (
                  <span className="absolute left-[48%] inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-cyan-700 px-2 text-xs font-black text-white">
                    <Flag size={12} />
                  </span>
                )}
                {isPreview && !isCurrent && (
                  <span className="absolute left-[66%] inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-amber-300 bg-amber-100 px-2 text-xs font-black text-amber-800">
                    preview
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute left-[28%] inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-950 px-2 text-sm font-black text-white shadow-md">
                    🧗
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div className="pointer-events-none absolute left-[54px] right-0 top-0 h-full" style={{
          background: activePosition === mission.target ? 'linear-gradient(90deg, transparent, rgba(8,145,178,.08))' : 'transparent',
        }} />
      </div>
    </div>
  );
}

function OperationCard({ card, disabled, selected, onUse, onPreview }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onUse(card)}
      onMouseEnter={() => onPreview(card.value)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(card.value)}
      onBlur={() => onPreview(null)}
      className={`rounded-xl border p-4 text-left shadow-sm transition-all disabled:cursor-not-allowed ${
        selected
          ? 'border-slate-300 bg-slate-100 opacity-50'
          : card.value > 0
            ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100'
            : 'border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`text-2xl font-black tabular-nums ${card.value > 0 ? 'text-emerald-800' : 'text-blue-800'}`}>{card.label}</span>
        <span className="rounded-md bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">move</span>
      </div>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{card.note}</p>
    </button>
  );
}

export default function IntegerMountain() {
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const navigate = useNavigate();
  const { addXP } = usePlayerStore();

  const missions = useMemo(() => MISSIONS.slice(0, getMissionCount(grade)), [grade]);
  const [missionIndex, setMissionIndex] = useState(0);
  const [position, setPosition] = useState(missions[0].start);
  const [visited, setVisited] = useState([missions[0].start]);
  const [usedCardIds, setUsedCardIds] = useState([]);
  const [previewDelta, setPreviewDelta] = useState(null);
  const [xInput, setXInput] = useState('');
  const [solvedX, setSolvedX] = useState(null);
  const [score, setScore] = useState(0);
  const [rescues, setRescues] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [gameState, setGameState] = useState('playing');
  const [feedback, setFeedback] = useState('Use operation cards to move on the integer elevation map.');

  const mission = missions[missionIndex];
  const oxygenLeft = mission.oxygen - usedCardIds.length;
  const previewPosition = previewDelta == null ? null : position + previewDelta;
  const reachedTarget = position === mission.target;
  const outOfBounds = (value) => value < mission.low || value > mission.high;
  const equationAnswer = getEquationAnswer(mission);
  const equationCard = solvedX == null ? null : {
    id: `equation-${missionIndex}`,
    label: formatInteger(solvedX),
    value: solvedX,
    note: `solved x from x + (${formatInteger(mission.equation.known)}) = ${formatInteger(mission.equation.result)}`,
    equation: true,
  };
  const routeCards = equationCard ? [equationCard, ...mission.cards] : mission.cards;

  const startMission = (index) => {
    const nextMission = missions[index];
    setMissionIndex(index);
    setPosition(nextMission.start);
    setVisited([nextMission.start]);
    setUsedCardIds([]);
    setPreviewDelta(null);
    setXInput('');
    setSolvedX(null);
    setFeedback(nextMission.story);
  };

  const restartGame = () => {
    setScore(0);
    setRescues(0);
    setMistakes(0);
    setGameState('playing');
    startMission(0);
  };

  const finishGame = () => {
    const accuracy = Math.max(0, Math.round((rescues / Math.max(1, rescues + mistakes)) * 100));
    const xpEarned = Math.max(75, score + accuracy);
    setGameState('complete');
    addXP(xpEarned, 'Integer Mountain', score, accuracy, 'Integers');
  };

  const solveEquation = (event) => {
    event.preventDefault();
    if (gameState !== 'playing' || solvedX != null) return;

    const guessedX = Number(xInput);
    if (!Number.isInteger(guessedX)) {
      setFeedback('Enter a whole number for x. Integer moves can be positive, negative, or zero.');
      return;
    }

    if (guessedX !== equationAnswer) {
      setMistakes((current) => current + 1);
      setScore((current) => Math.max(0, current - 10));
      setFeedback(`Not quite. Check the equation: x + (${formatInteger(mission.equation.known)}) must equal ${formatInteger(mission.equation.result)}.`);
      return;
    }

    setSolvedX(guessedX);
    setScore((current) => current + 30);
    setFeedback(`Correct. x = ${formatInteger(guessedX)} is now unlocked as a route card.`);
  };

  const useCard = (card) => {
    if (gameState !== 'playing' || reachedTarget || usedCardIds.includes(card.id)) return;

    const nextPosition = position + card.value;
    const danger = mission.danger || [];
    setUsedCardIds((current) => [...current, card.id]);
    setPreviewDelta(null);

    if (outOfBounds(nextPosition)) {
      setMistakes((current) => current + 1);
      setFeedback(`That move leaves the mapped mountain range: ${formatInteger(position)} ${card.label} = ${formatInteger(nextPosition)}.`);
      return;
    }

    setPosition(nextPosition);
    setVisited((current) => current.includes(nextPosition) ? current : [...current, nextPosition]);

    if (danger.includes(nextPosition)) {
      setMistakes((current) => current + 1);
      setScore((current) => Math.max(0, current - 15));
      setFeedback(`Avalanche zone at ${formatInteger(nextPosition)}. You survived, but lost 15 points.`);
      return;
    }

    if (nextPosition === mission.target) {
      const efficientBonus = Math.max(0, oxygenLeft - 1) * 10;
      const missionScore = 80 + efficientBonus + missionIndex * 20;
      setScore((current) => current + missionScore);
      setRescues((current) => current + 1);
      setFeedback(`Rescue reached: ${formatInteger(position)} ${card.label} = ${formatInteger(nextPosition)}. +${missionScore} points.`);
      return;
    }

    if (oxygenLeft <= 1) {
      setMistakes((current) => current + 1);
      setFeedback(`Oxygen is empty at ${formatInteger(nextPosition)}. Reset this mission or try to finish with a better route.`);
      return;
    }

    const direction = card.value > 0 ? 'climbed' : 'descended';
    setFeedback(`You ${direction}: ${formatInteger(position)} ${card.label} = ${formatInteger(nextPosition)}.`);
  };

  const resetMission = () => {
    setMistakes((current) => current + 1);
    const currentMission = mission;
    setPosition(currentMission.start);
    setVisited([currentMission.start]);
    setUsedCardIds([]);
    setPreviewDelta(null);
    setXInput('');
    setSolvedX(null);
    setFeedback('Mission reset. Plan the route before using oxygen.');
  };

  const nextMission = () => {
    if (!reachedTarget) return;
    if (missionIndex === missions.length - 1) {
      finishGame();
      return;
    }
    startMission(missionIndex + 1);
  };

  const accuracy = Math.max(0, Math.round((rescues / Math.max(1, rescues + mistakes)) * 100));

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f5f7fb] px-3 py-4 text-slate-900 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/student" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-950" aria-label="Back to dashboard">
              <ArrowLeft size={19} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Mountain size={24} className="text-slate-800" />
                <h1 className="font-display text-2xl font-black leading-none text-slate-950">Integer Mountain Rescue</h1>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">Solve for x, then use integer moves to navigate positive and negative elevations.</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score</p><p className="text-base font-black tabular-nums">{score}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Oxygen</p><p className="text-base font-black tabular-nums text-cyan-700">{Math.max(0, oxygenLeft)}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Rescues</p><p className="text-base font-black tabular-nums text-emerald-700">{rescues}/{missions.length}</p></div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Accuracy</p><p className="text-base font-black tabular-nums">{accuracy}%</p></div>
          </div>
        </header>

        {gameState === 'complete' ? (
          <section className="grid min-h-[620px] place-items-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="max-w-lg">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck size={34} />
              </div>
              <h2 className="font-display text-4xl font-black text-slate-950">Mountain Team Rescued</h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
                You used integer operations to cross above and below zero, avoided danger zones, and completed the route plan.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Score</p><p className="text-xl font-black">{score}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Accuracy</p><p className="text-xl font-black">{accuracy}%</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Mistakes</p><p className="text-xl font-black">{mistakes}</p></div>
              </div>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <button onClick={restartGame} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800">
                  <RotateCcw size={17} /> New Expedition
                </button>
                <button onClick={() => navigate('/student')} className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                  Dashboard
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_410px]">
            <ElevationMap
              mission={mission}
              position={position}
              previewPosition={previewPosition}
              visited={visited}
            />

            <aside className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mission {missionIndex + 1}</p>
                    <h2 className="font-display text-2xl font-black text-slate-950">{mission.title}</h2>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Start</p>
                    <p className="text-sm font-black">{formatInteger(mission.start)}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-slate-600">{mission.story}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-cyan-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-cyan-700">Target altitude</p><p className="text-xl font-black text-cyan-900">{formatInteger(mission.target)}</p></div>
                  <div className="rounded-lg bg-amber-50 px-3 py-2"><p className="text-[10px] font-bold uppercase text-amber-700">Oxygen moves</p><p className="text-xl font-black text-amber-900">{Math.max(0, oxygenLeft)}</p></div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Sigma size={18} className="text-violet-700" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Unlock the x move</h3>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">Equation beacon</p>
                  <p className="mt-1 text-2xl font-black tracking-wide text-violet-950">
                    x + ({formatInteger(mission.equation.known)}) = {formatInteger(mission.equation.result)}
                  </p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed text-violet-700">
                    Find x. If correct, x becomes a route card you can use on the mountain.
                  </p>
                </div>
                {solvedX == null ? (
                  <form onSubmit={solveEquation} className="mt-3 flex gap-2">
                    <input
                      type="number"
                      value={xInput}
                      onChange={(event) => setXInput(event.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-lg font-black text-slate-900 outline-none transition-colors focus:border-violet-400"
                      placeholder="x"
                      inputMode="numeric"
                    />
                    <button type="submit" className="rounded-lg bg-violet-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-violet-800">
                      Check
                    </button>
                  </form>
                ) : (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-bold text-emerald-800">
                    x = {formatInteger(solvedX)} unlocked. Use it as a route card below.
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Wind size={17} className="text-cyan-700" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Choose a route card</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {routeCards.map((card) => (
                    <OperationCard
                      key={card.id}
                      card={card}
                      disabled={usedCardIds.includes(card.id) || reachedTarget || gameState !== 'playing'}
                      selected={usedCardIds.includes(card.id)}
                      onUse={useCard}
                      onPreview={(delta) => setPreviewDelta(delta)}
                    />
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <MapPinned size={17} className="text-slate-700" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Expedition log</h3>
                </div>
                <p className="min-h-[58px] rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold leading-relaxed text-slate-700">{feedback}</p>
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                  Rule: adding a positive integer climbs up. Adding a negative integer descends below or toward zero.
                </div>
              </section>

              <div className="flex gap-2">
                <button onClick={resetMission} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                  <RotateCcw size={16} /> Reset
                </button>
                <button
                  onClick={nextMission}
                  disabled={!reachedTarget}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {missionIndex === missions.length - 1 ? 'Finish Expedition' : 'Next Mission'}
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
