import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RotateCcw, Sailboat, ShieldCheck, Target, XCircle } from 'lucide-react';
import { useGamification } from '../hooks/useGamification';
import { useAuthStore } from '../store/useAuthStore';
import { normalizeGrade } from '../lib/gradeUtils';

const SHIP_PARTS = [
  { id: 'sun', label: 'signal sun', shape: 'circle', family: 'curved', sides: 0, vertices: 0, zone: 'sky', clue: 'A round signal marker with no sides.' },
  { id: 'main-sail', label: 'main sail', shape: 'triangle', family: 'polygon', sides: 3, vertices: 3, zone: 'rigging', clue: 'A three-sided sail that catches the wind.' },
  { id: 'flag', label: 'command flag', shape: 'triangle', family: 'polygon', sides: 3, vertices: 3, zone: 'rigging', clue: 'A small triangular flag at the mast.' },
  { id: 'cabins', label: 'captain cabins', shape: 'square', family: 'quadrilateral', sides: 4, vertices: 4, zone: 'deck', clue: 'Equal-sided cabin windows.' },
  { id: 'deck', label: 'cargo deck', shape: 'rectangle', family: 'quadrilateral', sides: 4, vertices: 4, zone: 'deck', clue: 'A long four-sided loading deck.' },
  { id: 'hull', label: 'ship hull', shape: 'trapezoid', family: 'quadrilateral', sides: 4, vertices: 4, zone: 'hull', clue: 'A four-sided hull with one pair of parallel sides.' },
  { id: 'porthole-a', label: 'left porthole', shape: 'circle', family: 'curved', sides: 0, vertices: 0, zone: 'hull', clue: 'A round window in the hull.' },
  { id: 'porthole-b', label: 'right porthole', shape: 'circle', family: 'curved', sides: 0, vertices: 0, zone: 'hull', clue: 'Another circular hull window.' },
  { id: 'crate', label: 'supply crate', shape: 'square', family: 'quadrilateral', sides: 4, vertices: 4, zone: 'deck', clue: 'A square crate tied to the deck.' },
  { id: 'diamond-gem', label: 'navigation gem', shape: 'rhombus', family: 'quadrilateral', sides: 4, vertices: 4, zone: 'deck', clue: 'A diamond-shaped navigation gem.' },
  { id: 'anchor-plate', label: 'anchor plate', shape: 'pentagon', family: 'polygon', sides: 5, vertices: 5, zone: 'hull', clue: 'A five-sided anchor plate.' },
  { id: 'wheel', label: 'helm wheel', shape: 'hexagon', family: 'polygon', sides: 6, vertices: 6, zone: 'deck', clue: 'A six-sided wheel hub.' },
];

const MISSIONS = [
  {
    title: 'Launch Check',
    instruction: 'Select every triangle on the ship.',
    targetLabel: 'Triangles',
    test: (part) => part.shape === 'triangle',
    help: 'Triangles have exactly 3 sides and 3 vertices.',
    minGrade: 2,
  },
  {
    title: 'Porthole Audit',
    instruction: 'Select every circle on the ship.',
    targetLabel: 'Circles',
    test: (part) => part.shape === 'circle',
    help: 'Circles are curved shapes with no sides or corners.',
    minGrade: 2,
  },
  {
    title: 'Deck Blueprint',
    instruction: 'Select every quadrilateral used on the ship.',
    targetLabel: 'Quadrilaterals',
    test: (part) => part.sides === 4,
    help: 'Quadrilaterals are polygons with 4 sides.',
    minGrade: 3,
  },
  {
    title: 'Precision Rigging',
    instruction: 'Select every shape with more than 4 sides.',
    targetLabel: '5+ sided shapes',
    test: (part) => part.sides > 4,
    help: 'Pentagons and hexagons have more than 4 sides.',
    minGrade: 4,
  },
  {
    title: 'Hull Specialist',
    instruction: 'Select every shape located in the hull zone.',
    targetLabel: 'Hull zone',
    test: (part) => part.zone === 'hull',
    help: 'The hull is the lower body of the ship.',
    minGrade: 5,
  },
];

function ShipDiagram({ selectedIds, correctIds, wrongIds, disabled, onSelect }) {
  const getState = (id) => {
    if (correctIds.includes(id)) return 'correct';
    if (wrongIds.includes(id)) return 'wrong';
    if (selectedIds.includes(id)) return 'selected';
    return 'idle';
  };

  const shapeClass = (id) => {
    const state = getState(id);
    const base = 'cursor-pointer transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-cyan-300';
    if (state === 'correct') return `${base} fill-emerald-400 stroke-emerald-900 opacity-95`;
    if (state === 'wrong') return `${base} fill-rose-300 stroke-rose-800 opacity-95`;
    if (state === 'selected') return `${base} fill-cyan-300 stroke-cyan-900 drop-shadow-lg`;
    return `${base} fill-white stroke-slate-700 hover:fill-cyan-50 hover:stroke-cyan-700`;
  };

  const shapeProps = (id) => ({
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    className: shapeClass(id),
    onClick: () => !disabled && onSelect(id),
    onKeyDown: (event) => {
      if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onSelect(id);
      }
    },
  });

  return (
    <svg viewBox="0 0 920 520" className="h-full w-full" aria-label="Ship made from selectable geometric shapes">
      <defs>
        <linearGradient id="geometrySea" x1="0" x2="1">
          <stop offset="0%" stopColor="#0891b2" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id="geometrySky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>
      </defs>

      <rect width="920" height="520" rx="24" fill="url(#geometrySky)" />
      <path d="M0 392 C120 372 210 414 330 392 C465 366 550 424 690 394 C785 374 850 380 920 398 L920 520 L0 520 Z" fill="url(#geometrySea)" opacity="0.9" />
      <path d="M84 430 C210 410 300 448 432 428 C558 409 650 444 834 424" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="8" strokeLinecap="round" />

      <circle {...shapeProps('sun')} cx="790" cy="86" r="34" strokeWidth="5" />

      <line x1="456" y1="95" x2="456" y2="326" stroke="#334155" strokeWidth="9" strokeLinecap="round" />
      <line x1="318" y1="318" x2="656" y2="318" stroke="#475569" strokeWidth="8" strokeLinecap="round" />

      <polygon {...shapeProps('main-sail')} points="460,112 460,310 652,310" strokeWidth="6" />
      <polygon {...shapeProps('flag')} points="466,86 560,110 466,134" strokeWidth="5" />
      <rect {...shapeProps('deck')} x="302" y="300" width="300" height="52" rx="6" strokeWidth="5" />
      <polygon {...shapeProps('hull')} points="210,344 700,344 642,424 266,424" strokeWidth="6" />

      <rect {...shapeProps('cabins')} x="344" y="242" width="46" height="46" rx="4" strokeWidth="5" />
      <rect {...shapeProps('crate')} x="616" y="290" width="48" height="48" rx="4" strokeWidth="5" />
      <polygon {...shapeProps('diamond-gem')} points="518,256 548,286 518,316 488,286" strokeWidth="5" />
      <circle {...shapeProps('porthole-a')} cx="342" cy="382" r="25" strokeWidth="5" />
      <circle {...shapeProps('porthole-b')} cx="514" cy="382" r="25" strokeWidth="5" />
      <polygon {...shapeProps('anchor-plate')} points="610,358 642,374 634,410 586,410 578,374" strokeWidth="5" />
      <polygon {...shapeProps('wheel')} points="704,274 730,288 730,316 704,330 678,316 678,288" strokeWidth="5" />

      <text x="48" y="58" fill="#0f172a" fontSize="20" fontWeight="800">Inspect the ship blueprint</text>
      <text x="48" y="88" fill="#64748b" fontSize="14" fontWeight="600">Tap the geometric ship parts that match the mission.</text>
    </svg>
  );
}

function ResultPanel({ mission, selectedCount, targetCount, wrongCount, isRoundComplete }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current mission</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">{mission.title}</h2>
        </div>
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{mission.targetLabel}</p>
          <p className="text-sm font-black text-slate-900">{selectedCount}/{targetCount}</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">{mission.instruction}</p>
      <p className="mt-2 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-semibold leading-relaxed text-cyan-800">{mission.help}</p>
      {wrongCount > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-rose-600">
          <XCircle size={15} /> {wrongCount} incorrect inspection mark{wrongCount > 1 ? 's' : ''}
        </p>
      )}
      {isRoundComplete && (
        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700">
          <CheckCircle2 size={15} /> Mission secured. Continue to the next inspection.
        </p>
      )}
    </div>
  );
}

export default function GeometryGame() {
  const { addXP } = useGamification();
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const navigate = useNavigate();

  const missions = useMemo(() => MISSIONS.filter((mission) => grade >= mission.minGrade).slice(0, grade >= 5 ? 5 : 4), [grade]);
  const [missionIndex, setMissionIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [correctIds, setCorrectIds] = useState([]);
  const [wrongIds, setWrongIds] = useState([]);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState('Select the matching geometric parts on the ship.');

  const mission = missions[missionIndex];
  const targetIds = useMemo(() => SHIP_PARTS.filter(mission.test).map((part) => part.id), [mission]);
  const isRoundComplete = targetIds.every((id) => correctIds.includes(id));
  const hullIntegrity = Math.max(0, 100 - mistakes * 12);
  const accuracy = Math.max(0, Math.round((score / Math.max(1, score + mistakes * 20)) * 100));

  const resetRound = () => {
    setSelectedIds([]);
    setCorrectIds([]);
    setWrongIds([]);
    setFeedback('Select the matching geometric parts on the ship.');
  };

  const restartGame = () => {
    setMissionIndex(0);
    setScore(0);
    setMistakes(0);
    setCompleted(false);
    resetRound();
  };

  const finishGame = (finalScore, finalMistakes) => {
    const finalAccuracy = Math.max(0, Math.round((finalScore / Math.max(1, finalScore + finalMistakes * 20)) * 100));
    const xpEarned = Math.max(60, Math.round(finalScore * 0.75 + finalAccuracy));
    setCompleted(true);
    addXP(xpEarned, 'Shape Explorer', finalScore, finalAccuracy, 'Geometry');
  };

  const handleSelect = (partId) => {
    if (completed || correctIds.includes(partId) || wrongIds.includes(partId)) return;

    const part = SHIP_PARTS.find((item) => item.id === partId);
    if (!part) return;

    setSelectedIds((current) => current.includes(partId) ? current : [...current, partId]);

    if (mission.test(part)) {
      const nextCorrect = [...correctIds, partId];
      const addedScore = 25 + missionIndex * 8;
      const nextScore = score + addedScore;
      setCorrectIds(nextCorrect);
      setScore(nextScore);
      setFeedback(`${part.label} is correct: ${part.clue}`);

      if (targetIds.every((id) => nextCorrect.includes(id))) {
        setFeedback(`Mission complete: ${mission.targetLabel} secured.`);
      }
      return;
    }

    const nextMistakes = mistakes + 1;
    setWrongIds((current) => [...current, partId]);
    setMistakes(nextMistakes);
    setFeedback(`${part.label} is not part of this mission. ${part.clue}`);
  };

  const advanceMission = () => {
    if (!isRoundComplete) return;

    if (missionIndex === missions.length - 1) {
      finishGame(score, mistakes);
      return;
    }

    setMissionIndex((current) => current + 1);
    resetRound();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f4f7fb] px-3 py-4 text-slate-900 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/student" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-900" aria-label="Back to dashboard">
              <ArrowLeft size={19} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Sailboat size={22} className="text-cyan-700" />
                <h1 className="font-display text-2xl font-black leading-none text-slate-950">Geometry Shipyard</h1>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">Inspect a ship built from geometric shapes.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:w-auto">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score</p>
              <p className="text-base font-black tabular-nums text-slate-900">{score}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Integrity</p>
              <p className="text-base font-black tabular-nums text-emerald-700">{hullIntegrity}%</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Mission</p>
              <p className="text-base font-black tabular-nums text-slate-900">{missionIndex + 1}/{missions.length}</p>
            </div>
          </div>
        </header>

        {completed ? (
          <section className="grid min-h-[620px] place-items-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="max-w-lg">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <ShieldCheck size={34} />
              </div>
              <h2 className="font-display text-4xl font-black text-slate-950">Ship Cleared For Launch</h2>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
                You inspected the blueprint, identified the geometry systems, and protected the hull integrity.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Score</p><p className="text-xl font-black">{score}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Accuracy</p><p className="text-xl font-black">{accuracy}%</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Mistakes</p><p className="text-xl font-black">{mistakes}</p></div>
              </div>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <button onClick={restartGame} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-cyan-800">
                  <RotateCcw size={17} /> Play Again
                </button>
                <button onClick={() => navigate('/student')} className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                  Dashboard
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <section className="min-h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:p-4">
              <ShipDiagram
                selectedIds={selectedIds}
                correctIds={correctIds}
                wrongIds={wrongIds}
                disabled={completed}
                onSelect={handleSelect}
              />
            </section>

            <aside className="space-y-4">
              <ResultPanel
                mission={mission}
                selectedCount={correctIds.length}
                targetCount={targetIds.length}
                wrongCount={wrongIds.length}
                isRoundComplete={isRoundComplete}
              />

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Target size={17} className="text-cyan-700" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Inspection log</h3>
                </div>
                <p className="min-h-[48px] rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold leading-relaxed text-slate-700">{feedback}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${hullIntegrity}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">Hull integrity drops when you select shapes outside the mission.</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">Shape reference</h3>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600">
                  {['circle', 'triangle', 'square', 'rectangle', 'trapezoid', 'rhombus', 'pentagon', 'hexagon'].map((shape) => (
                    <div key={shape} className="rounded-lg bg-slate-50 px-3 py-2 capitalize">{shape}</div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={resetRound} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                  <RotateCcw size={16} /> Reset Round
                </button>
                <button
                  onClick={advanceMission}
                  disabled={!isRoundComplete}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {missionIndex === missions.length - 1 ? 'Finish' : 'Next'}
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
