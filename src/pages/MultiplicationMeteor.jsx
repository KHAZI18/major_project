import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Award, Crosshair, Flame, Rocket, RotateCcw, Shield } from 'lucide-react';
import { useGamification } from '../hooks/useGamification';
import { useAuthStore } from '../store/useAuthStore';
import { getGradeTier, normalizeGrade } from '../lib/gradeUtils';
import { recordAttempt } from '../engine/engineAPI';
import { skillForGame } from '../engine/gameSkills';

const SKILL = skillForGame('MultiplicationMeteor'); // 'multiplication'

const MAX_MISSES = 3;

function getDifficulty(grade) {
  if (grade <= 2) return { max: 6, spawnMs: 2100, fall: 0.62, limit: 16 };
  if (grade === 3) return { max: 9, spawnMs: 1950, fall: 0.72, limit: 20 };
  if (grade === 4) return { max: 12, spawnMs: 1800, fall: 0.82, limit: 24 };
  return { max: 14, spawnMs: 1650, fall: 0.92, limit: 28 };
}

function createMeteor(grade, score) {
  const difficulty = getDifficulty(grade);
  const min = 2;
  const a = Math.floor(Math.random() * (difficulty.max - min + 1)) + min;
  const b = Math.floor(Math.random() * (difficulty.max - min + 1)) + min;
  const drift = Math.random() > 0.5 ? 1 : -1;

  return {
    id: `${Date.now()}-${Math.random()}`,
    a,
    b,
    answer: a * b,
    x: 10 + Math.random() * 80,
    y: -12,
    speed: difficulty.fall + Math.min(0.65, score / 420) + Math.random() * 0.18,
    drift,
    kind: Math.random() > 0.72 ? 'balloon' : 'meteor',
  };
}

function FallingField({ meteors, explosions, lasers, danger, turretAngle }) {
  return (
    <div className={`relative h-[560px] overflow-hidden rounded-xl border border-white/10 bg-[#090f24] shadow-sm ${danger ? 'animate-pulse' : ''}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.1),rgba(2,6,23,0.75))]" />
      <div className="absolute left-[8%] top-[12%] h-1 w-1 rounded-full bg-white/80" />
      <div className="absolute left-[30%] top-[24%] h-1 w-1 rounded-full bg-white/60" />
      <div className="absolute left-[68%] top-[18%] h-1 w-1 rounded-full bg-white/70" />
      <div className="absolute left-[86%] top-[36%] h-1 w-1 rounded-full bg-white/70" />

      {meteors.map((meteor) => (
        <div
          key={meteor.id}
          className={`absolute flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center text-lg font-black text-white shadow-[0_10px_30px_rgba(248,113,113,0.48)] transition-[top,left] duration-100 ease-linear ${
            meteor.kind === 'balloon'
              ? 'rounded-full border border-cyan-200/60 bg-gradient-to-br from-cyan-400 to-blue-700'
              : 'rounded-[35%] border border-orange-200/50 bg-gradient-to-br from-orange-400 to-red-800'
          }`}
          style={{ left: `${meteor.x}%`, top: `${meteor.y}%` }}
        >
          <span className="leading-tight">{meteor.a} x {meteor.b}</span>
          {meteor.kind === 'balloon' && <span className="absolute -bottom-5 h-6 w-px bg-cyan-100/60" />}
          {meteor.kind === 'meteor' && <span className="absolute -top-12 h-12 w-9 rounded-full bg-gradient-to-t from-orange-400/60 to-transparent blur-sm" />}
        </div>
      ))}

      {lasers.map((laser) => (
        <div
          key={laser.id}
          className="absolute bottom-24 left-1/2 h-[760px] w-2 origin-bottom -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(103,232,249,0.95)]"
          style={{ transform: `translateX(-50%) rotate(${laser.angle}deg)` }}
        />
      ))}

      {explosions.map((explosion) => (
        <div
          key={explosion.id}
          className="absolute z-20 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: `${explosion.x}%`, top: `${explosion.y}%` }}
        >
          <Flame size={58} className="text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.9)]" />
          <div className="absolute inset-0 animate-ping rounded-full bg-orange-300/35" />
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-0 h-24 border-t-4 border-cyan-300 bg-slate-950 shadow-[0_-18px_40px_rgba(34,211,238,0.16)]" />
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
        <div
          className="mx-auto h-16 w-7 origin-bottom rounded-t-full bg-slate-200 shadow-[0_0_20px_rgba(255,255,255,0.45)] transition-transform duration-150"
          style={{ transform: `rotate(${turretAngle}deg)` }}
        />
        <div className="-mt-2 flex h-16 w-36 items-center justify-center rounded-t-[2rem] border border-white/10 bg-slate-800">
          <Crosshair className="text-cyan-300" size={30} />
        </div>
      </div>
    </div>
  );
}

export default function MultiplicationMeteor() {
  const { addXP } = useGamification();
  const { user } = useAuthStore();
  const grade = normalizeGrade(user?.grade);
  const gradeTier = getGradeTier(grade);
  const navigate = useNavigate();
  const difficulty = useMemo(() => getDifficulty(grade), [grade]);
  const inputRef = useRef(null);
  const awardedRef = useRef(false);

  const [gameState, setGameState] = useState('idle');
  const [meteors, setMeteors] = useState([]);
  const [explosions, setExplosions] = useState([]);
  const [lasers, setLasers] = useState([]);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [turretAngle, setTurretAngle] = useState(0);
  const [message, setMessage] = useState('Type a falling product answer and press Enter to fire.');

  const accuracy = Math.max(0, Math.round((hits / Math.max(1, hits + misses)) * 100));
  const isPlaying = gameState === 'playing';

  const startGame = () => {
    awardedRef.current = false;
    setGameState('playing');
    setMeteors([createMeteor(grade, 0)]);
    setExplosions([]);
    setLasers([]);
    setAnswer('');
    setScore(0);
    setHits(0);
    setMisses(0);
    setCombo(0);
    setBestCombo(0);
    setTurretAngle(0);
    setMessage('Defense online. Type the product on a falling object and press Enter.');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const endGame = useCallback((finalScore = score, finalHits = hits, finalAccuracy = accuracy, finalBestCombo = bestCombo) => {
    setGameState('ended');
    if (!awardedRef.current) {
      awardedRef.current = true;
      const xpEarned = Math.max(60, Math.round(finalScore * 0.7 + finalAccuracy + finalBestCombo * 8 + gradeTier * 20));
      addXP(xpEarned, 'Multiplication Meteor', finalHits, finalAccuracy, 'Multiplication');
    }
  }, [accuracy, addXP, bestCombo, gradeTier, hits, score]);

  useEffect(() => {
    if (!isPlaying) return undefined;

    const spawnTimer = setInterval(() => {
      setMeteors((current) => {
        if (current.length >= 6 || hits >= difficulty.limit) return current;
        return [...current, createMeteor(grade, score)];
      });
    }, difficulty.spawnMs);

    const fallTimer = setInterval(() => {
      setMeteors((current) => {
        const survivors = [];
        let lost = 0;

        current.forEach((meteor) => {
          const nextY = meteor.y + meteor.speed;
          const nextX = Math.max(7, Math.min(93, meteor.x + meteor.drift * 0.08));
          if (nextY >= 94) {
            lost += 1;
            return;
          }
          survivors.push({ ...meteor, y: nextY, x: nextX });
        });

        if (lost > 0) {
          setMisses((currentMisses) => {
            const nextMisses = currentMisses + lost;
            if (nextMisses >= MAX_MISSES) setTimeout(endGame, 0);
            return nextMisses;
          });
          setCombo(0);
          setMessage(`${lost} object${lost > 1 ? 's' : ''} reached the floor. ${MAX_MISSES} misses ends the mission.`);
        }

        return survivors;
      });
    }, 100);

    return () => {
      clearInterval(spawnTimer);
      clearInterval(fallTimer);
    };
  }, [difficulty.limit, difficulty.spawnMs, endGame, grade, hits, isPlaying, score]);

  const fire = (event) => {
    event.preventDefault();
    if (!isPlaying) return;

    const value = Number(answer);
    if (!Number.isInteger(value)) {
      setMessage('Enter a whole-number product before firing.');
      return;
    }

    const targetIndex = meteors.findIndex((meteor) => meteor.answer === value);
    recordAttempt({ skillId: SKILL, correct: targetIndex !== -1, responseTime: 0 });
    if (targetIndex === -1) {
      setMisses((current) => {
        const next = current + 1;
        if (next >= MAX_MISSES) setTimeout(endGame, 0);
        return next;
      });
      setCombo(0);
      setMessage(`No falling object has product ${value}. Miss ${Math.min(MAX_MISSES, misses + 1)}/${MAX_MISSES}.`);
      setAnswer('');
      return;
    }

    const target = meteors[targetIndex];
    const nextHits = hits + 1;
    const nextCombo = combo + 1;
    const nextBestCombo = Math.max(bestCombo, nextCombo);
    const nextScore = score + 25 + nextCombo * 5;
    const nextAccuracy = Math.max(0, Math.round((nextHits / Math.max(1, nextHits + misses)) * 100));
    const dx = target.x - 50;
    const dy = 92 - target.y;
    const angle = Math.atan2(dx, dy) * (180 / Math.PI);
    const effectId = `${target.id}-hit`;

    setTurretAngle(angle);
    setLasers((current) => [...current, { id: effectId, angle }]);
    setExplosions((current) => [...current, { id: effectId, x: target.x, y: target.y }]);
    setMeteors((current) => current.filter((_, index) => index !== targetIndex));
    setHits(nextHits);
    setCombo((current) => {
      const updatedCombo = current + 1;
      setBestCombo((best) => Math.max(best, updatedCombo));
      return updatedCombo;
    });
    setScore(nextScore);
    setMessage(`Hit confirmed: ${target.a} x ${target.b} = ${target.answer}.`);
    setAnswer('');

    if (nextHits >= difficulty.limit) {
      setTimeout(() => endGame(nextScore, nextHits, nextAccuracy, nextBestCombo), 300);
    }

    setTimeout(() => {
      setLasers((current) => current.filter((laser) => laser.id !== effectId));
      setExplosions((current) => current.filter((explosion) => explosion.id !== effectId));
      setTurretAngle(0);
    }, 260);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0b1022] px-3 py-4 text-white sm:px-5 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Link to="/student" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10" aria-label="Back to dashboard">
              <ArrowLeft size={19} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Rocket size={24} className="text-cyan-300" />
                <h1 className="font-display text-2xl font-black leading-none">Multiplication Meteor Defense</h1>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-300">Type the product on a falling object and press Enter to shoot it.</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Score</p><p className="text-base font-black tabular-nums">{score}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Hits</p><p className="text-base font-black tabular-nums text-cyan-300">{hits}/{difficulty.limit}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Misses</p><p className="text-base font-black tabular-nums text-rose-300">{misses}/{MAX_MISSES}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Combo</p><p className="text-base font-black tabular-nums text-amber-300">{combo}x</p></div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
          <div className="relative">
            <FallingField
              meteors={meteors}
              explosions={explosions}
              lasers={lasers}
              danger={misses >= 2}
              turretAngle={turretAngle}
            />

            {gameState === 'idle' && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-slate-950/70 p-6 text-center backdrop-blur">
                <div className="max-w-md">
                  <Rocket size={58} className="mx-auto mb-4 text-cyan-300" />
                  <h2 className="font-display text-4xl font-black">Defend The Station</h2>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-300">
                    Falling meteors and balloons contain multiplication problems. Type the product and press Enter to shoot. Three missed objects ends the game.
                  </p>
                  <button onClick={startGame} className="mt-6 rounded-lg bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-cyan-300">
                    Start Defense
                  </button>
                </div>
              </div>
            )}

            {gameState === 'ended' && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-slate-950/75 p-6 text-center backdrop-blur">
                <div className="max-w-md">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                    {misses >= MAX_MISSES ? <Shield size={34} className="text-rose-300" /> : <Award size={34} className="text-amber-300" />}
                  </div>
                  <h2 className="font-display text-4xl font-black">{misses >= MAX_MISSES ? 'Defense Offline' : 'Sector Cleared'}</h2>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-300">
                    You hit {hits} targets, missed {misses}, reached a best combo of {bestCombo}, and finished with {accuracy}% accuracy.
                  </p>
                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button onClick={startGame} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300">
                      <RotateCcw size={17} /> Play Again
                    </button>
                    <button onClick={() => navigate('/student')} className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
                      Dashboard
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h2 className="text-sm font-black uppercase tracking-wide text-white">Fire control</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">{message}</p>
              <form onSubmit={fire} className="mt-4">
                <input
                  ref={inputRef}
                  type="number"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  disabled={!isPlaying}
                  placeholder="Type product"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-center text-2xl font-black text-white outline-none transition-colors focus:border-cyan-300 disabled:opacity-60"
                />
                <button disabled={!isPlaying} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-500">
                  Fire Laser
                </button>
              </form>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h3 className="text-sm font-black uppercase tracking-wide text-white">Mission rules</h3>
              <div className="mt-3 space-y-2 text-sm font-semibold text-slate-300">
                <div className="rounded-lg bg-black/20 px-3 py-2">Solve the multiplication shown on any falling object.</div>
                <div className="rounded-lg bg-black/20 px-3 py-2">Type the product and press Enter to shoot the matching object.</div>
                <div className="rounded-lg bg-black/20 px-3 py-2">If 3 objects reach the floor or you fire 3 wrong answers, the game stops.</div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <h3 className="text-sm font-black uppercase tracking-wide text-white">Performance</h3>
              <div className="mt-3 space-y-2 text-sm font-semibold text-slate-300">
                <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2"><span>Accuracy</span><span>{accuracy}%</span></div>
                <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2"><span>Best combo</span><span>{bestCombo}x</span></div>
                <div className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2"><span>Active objects</span><span>{meteors.length}</span></div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
