import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGamification } from '../hooks/useGamification';
import { ChevronLeft, Rocket, Shield, Crosshair, Flame } from 'lucide-react';

function generateProblem() {
  const m1 = Math.floor(Math.random() * 10) + 2; // 2 to 11
  const m2 = Math.floor(Math.random() * 10) + 2; 
  return { q: `${m1} × ${m2}`, a: m1 * m2, id: Date.now() + Math.random() };
}

function MultiplicationMeteor() {
  const { addXP } = useGamification();
  const navigate = useNavigate();

  const [isPlaying, setIsPlaying] = useState(false);
  const [meteors, setMeteors] = useState([]);
  const [explosions, setExplosions] = useState([]);
  const [lasers, setLasers] = useState([]);
  const [score, setScore] = useState(0);
  const [health, setHealth] = useState(3);
  const [inputValue, setInputValue] = useState('');
  const [turretAngle, setTurretAngle] = useState(0);
  
  const inputRef = useRef(null);
  const fallRate = Math.min(2.5, 0.3 + score / 40); // Base rate 0.3 (very slow), scales up as player gets further

  const startGame = () => {
    setIsPlaying(true);
    setMeteors([]);
    setExplosions([]);
    setLasers([]);
    setScore(0);
    setHealth(3);
    setInputValue('');
    setTurretAngle(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  useEffect(() => {
    let spawnTimer;
    let fallTimer;
    
    if (isPlaying && health > 0) {
      spawnTimer = setInterval(() => {
        setMeteors(prev => {
          if (prev.length < 5) {
             const m = generateProblem();
             return [...prev, { ...m, top: -10, left: Math.floor(Math.random() * 80) + 10 }];
          }
          return prev;
        });
      }, 1500);

      fallTimer = setInterval(() => {
        setMeteors(prev => {
          let damaged = false;
          const nextState = prev.map(m => ({ ...m, top: m.top + fallRate })).filter(m => {
            if (m.top > 100) {
               damaged = true;
               return false;
            }
            return true;
          });
          
          if (damaged) {
            setHealth(h => Math.max(0, h - 1));
            // Add damage flash effect if possible
            setExplosions(prev => [...prev, { id: Date.now(), top: 90, left: 50, type: 'damage' }]);
            setTimeout(() => {
               setExplosions(prev => prev.filter(e => e.type !== 'damage'));
            }, 300);
          }
          return nextState;
        });
      }, 100); // Smoother 10fps physics rate
    } else if (health === 0 && isPlaying) {
      setIsPlaying(false);
      addXP(score * 20, 'Multiplication Meteor', score);
    }
    
    return () => {
      clearInterval(spawnTimer);
      clearInterval(fallTimer);
    };
  }, [isPlaying, health, fallRate, score, addXP]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPlaying) return;
    
    const ans = parseInt(inputValue);
    const hitMeteorIndex = meteors.findIndex(m => m.a === ans);
    
    if (hitMeteorIndex !== -1) {
      const target = meteors[hitMeteorIndex];
      
      // Calculate laser angle
      const dx = target.left - 50;
      const dy = 100 - target.top;
      const angle = Math.atan2(dx, dy) * (180 / Math.PI);

      const hitId = Date.now();
      
      // Spawn laser & explosion visuals
      setLasers(prev => [...prev, { id: hitId, angle }]);
      setExplosions(prev => [...prev, { id: hitId, top: target.top, left: target.left, type: 'destroy' }]);
      setTurretAngle(angle);
      
      // Remove visual effects after 300ms
      setTimeout(() => {
         setLasers(prev => prev.filter(l => l.id !== hitId));
         setExplosions(prev => prev.filter(ex => ex.id !== hitId));
         setTurretAngle(0); // Reset turret to face forward after firing lock
      }, 300);

      setMeteors(prev => prev.filter((_, idx) => idx !== hitMeteorIndex));
      setScore(s => s + 1);
    }
    setInputValue('');
  };

  return (
    <div className="animate-fade-in-up flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto w-full">
      <header className="flex justify-between items-center mb-4 flex-shrink-0 px-2">
        <Link to="/student" className="btn btn-glass px-4 py-2">
          <ChevronLeft size={20} /> Back
        </Link>
        <h2 className="text-xl font-semibold flex items-center gap-2 px-4 py-2 bg-slate-800/80 rounded-full border border-white/10 hidden sm:flex">
            <Rocket className="text-accent" /> Multiplication Meteor
        </h2>
        <div className="flex gap-4">
          <div className="px-4 py-2 bg-white/10 rounded-full font-medium">Score: {score}</div>
          <div className="px-4 py-2 bg-danger/20 text-danger flex items-center gap-2 rounded-full font-bold shadow-[0_0_15px_rgba(248,113,113,0.3)] transition-colors">
            <Shield size={18} className={health === 1 ? 'animate-pulse' : ''} /> {health} AP
          </div>
        </div>
      </header>

      <div className="glass-card flex-1 relative overflow-hidden flex flex-col justify-end border-t border-x border-white/10 rounded-b-none bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] transition-all duration-300">
        
        {/* Background Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-[#0a071d] opacity-50 pointer-events-none"></div>

        {/* Global Damage Overlay */}
        {explosions.some(e => e.type === 'damage') && (
            <div className="absolute inset-0 bg-danger/30 z-40 scale-105 pointer-events-none transition-all duration-100"></div>
        )}

        {!isPlaying && health === 3 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md z-50">
                <Rocket size={80} className="text-accent mb-6 animate-float" />
                <h3 className="text-3xl sm:text-4xl font-bold mb-4">Planetary Defense System</h3>
                <p className="text-slate-300 max-w-lg text-center mb-8 px-4">
                   Intercept incoming meteors by typing the solution to their multiplication matrices. Press Enter to fire lasers.
                   If 3 meteors break through the shield, the base is lost!
                </p>
                <button className="btn btn-primary px-8 py-4 text-xl tracking-wider hover:scale-105" onClick={startGame}>INITIATE DEFENSE</button>
            </div>
        )}

        {!isPlaying && health === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-danger/20 backdrop-blur-lg z-50 animate-fade-in-up">
                <Shield size={80} className="text-danger mb-4 opacity-50" />
                <h3 className="text-4xl font-bold mb-2 tracking-widest text-[#f87171]">BASE DESTROYED</h3>
                <p className="text-xl mb-4 text-white">You intercepted <strong className="text-2xl">{score}</strong> meteors.</p>
                <div className="px-6 py-3 bg-success/20 border border-success rounded-xl text-success text-xl font-bold mb-8 shadow-success-glow">+{score * 20} XP Transmitted!</div>
                <div className="flex gap-4">
                  <button className="btn btn-primary px-6" onClick={startGame}>RESTART DEFENSE</button>
                  <button className="btn btn-outline px-6" onClick={() => navigate('/student')}>DASHBOARD</button>
                </div>
            </div>
        )}

        {/* Game Canvas */}
        <div className="absolute inset-0 z-10 w-full h-full overflow-hidden pointer-events-none">
           {/* Meteors */}
           {meteors.map(m => (
              <div 
                key={m.id} 
                className="absolute flex items-center justify-center w-[80px] h-[80px] -ml-[40px] bg-gradient-to-b from-[#f87171] to-[#7f1d1d] text-white rounded-lg font-bold text-2xl shadow-[0_5px_25px_rgba(248,113,113,0.8)] border border-white/20 animate-[meteor-shake_0.1s_ease-in-out_infinite] transition-all duration-[100ms] ease-linear"
                style={{ top: `${m.top}%`, left: `${m.left}%`, clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' }}
              >
                 <div className="absolute top-0 w-full h-[500px] -mt-[500px] bg-gradient-to-t from-danger/40 to-transparent"></div>
                 {m.q}
              </div>
           ))}

           {/* Laser Beams */}
           {lasers.map(l => (
              <div 
                key={`laser-${l.id}`}
                className="absolute bg-success opacity-90 z-20 shadow-[0_0_20px_rgba(34,197,94,1)]"
                style={{ 
                   left: '50%', bottom: '20px', 
                   height: '200vh', width: '12px', 
                   transformOrigin: 'bottom center',
                   transform: `translateX(-50%) rotate(${l.angle}deg)`,
                }}
              />
           ))}

           {/* Explosions */}
           {explosions.map(ex => {
              if(ex.type === 'damage') return null; // Damage is handled by full screen flash
              return (
                <div 
                  key={`exp-${ex.id}`}
                  className="absolute z-30 flex items-center justify-center w-[150px] h-[150px] -ml-[75px] -mt-[75px]"
                  style={{ top: `${ex.top}%`, left: `${ex.left}%` }}
                >
                  <Flame size={80} className="text-orange-400 animate-pulse drop-shadow-[0_0_20px_rgba(249,115,22,1)]" />
                  <div className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-60 mix-blend-screen scale-150 animate-ping"></div>
                </div>
              );
           })}
        </div>

        {/* Ground Base / Input Area */}
        <div className="h-36 bg-slate-900 border-t-4 border-accent shadow-[0_-10px_40px_rgba(244,114,182,0.15)] z-20 flex flex-col items-center justify-center relative rounded-t-[3rem]">
             {/* Cannon Body */}
             <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <div 
                    className="w-8 h-12 bg-slate-300 rounded-t-full shadow-[0_0_15px_rgba(255,255,255,0.5)] z-20 group transition-transform duration-200 ease-out origin-bottom"
                    style={{ transform: `rotate(${turretAngle}deg)` }}
                >
                    <div className="w-full h-full bg-accent opacity-0 group-hover:opacity-50 transition-opacity rounded-t-full blur-sm"></div>
                </div>
                <div className="w-24 h-16 bg-slate-800 border-t-2 border-x-2 border-white/10 rounded-t-full flex items-center justify-center -mt-2 z-10">
                   <Crosshair className="text-accent opacity-50" size={32} />
                </div>
             </div>
             
             <form onSubmit={handleSubmit} className="w-full max-w-sm px-4 mt-6 z-30">
                <div className="relative">
                    <input
                      ref={inputRef}
                      type="number"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      disabled={!isPlaying}
                      placeholder="Target coordinates..."
                      className="w-full px-6 py-4 text-2xl text-center bg-black/60 border-2 border-white/10 text-white rounded-full outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(244,114,182,0.5)] transition-all"
                    />
                    {isPlaying && <div className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full ${lasers.length > 0 ? 'bg-white shadow-xl scale-125' : 'bg-accent animate-pulse'} transition-all`}></div>}
                </div>
                <button type="submit" className="hidden">Fire</button>
             </form>
        </div>
      </div>
    </div>
  );
}

export default MultiplicationMeteor;
