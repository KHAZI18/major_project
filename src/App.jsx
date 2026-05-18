import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useSyncStore } from './store/useSyncStore';
import { usePlayerStore } from './store/usePlayerStore';
import { initSyncEngine } from './lib/syncEngine';

// Layout & Global
import Navbar from './components/Navbar';
import { InstallPrompter } from './components/InstallPrompter';

// Pages
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import Profile from './pages/Profile';

// Existing games
import ArithmeticGame from './pages/ArithmeticGame';
import GeometryGame from './pages/GeometryGame';
import FractionFrenzy from './pages/FractionFrenzy';
import EquationBalancer from './pages/EquationBalancer';
import MultiplicationMeteor from './pages/MultiplicationMeteor';
import PatternPuzzle from './pages/PatternPuzzle';

// New games
import NumberCatcher from './pages/NumberCatcher';
import BalloonPopSequence from './pages/BalloonPopSequence';
import FruitRush from './pages/FruitRush';
import MathRacing from './pages/MathRacing';
import MultiplicationFarm from './pages/MultiplicationFarm';
import FractionNinja from './pages/FractionNinja';
import DecimalMall from './pages/DecimalMall';
import CoordinateTreasure from './pages/CoordinateTreasure';
import IntegerMountain from './pages/IntegerMountain';
import AlgebraDungeon from './pages/AlgebraDungeon';

// Protected route wrapper
function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, role } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // If the user lands on a route they don't have access to, redirect to their dashboard
  if (requiredRole && role !== requiredRole) {
    return <Navigate to={role === 'student' ? '/student' : '/teacher'} replace />;
  }
  return children;
}

function App() {
  const { isAuthenticated, role } = useAuthStore();
  const { setStatus, initListeners } = useSyncStore();
  const { hydrate } = usePlayerStore();

  useEffect(() => {
    // Init offline sync engine
    initSyncEngine(setStatus);
    // Init online/offline listeners
    initListeners();
    // Hydrate player data from IndexedDB
    hydrate();
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative w-full overflow-x-hidden">
      <InstallPrompter />
      {isAuthenticated && <Navbar />}

      <main className="flex-1 w-full relative">
        <Routes>
          {/* Public: Force login as entry point */}
          <Route path="/" element={
            isAuthenticated ? (
              <Navigate to={role === 'teacher' ? '/teacher' : '/student'} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          <Route path="/login" element={<Login />} />

          {/* Student routes */}
          <Route path="/student" element={<ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>} />
          <Route path="/student/profile" element={<ProtectedRoute requiredRole="student"><Profile /></ProtectedRoute>} />
          <Route path="/student/leaderboard" element={<ProtectedRoute requiredRole="student">
            <div className="max-w-lg mx-auto pt-4">
              <div className="flex items-center gap-3 mb-6">
                <a href="/student" className="btn btn-glass btn-sm">← Back</a>
                <h1 className="font-display text-2xl font-bold">🏆 Village Leaderboard</h1>
              </div>
              {/* Full leaderboard inline */}
              <div className="glass-panel p-5">
                <p className="text-slate-400 text-sm text-center mb-4">Top players from your class</p>
                {/* Leaderboard component used here */}
                <div id="leaderboard-full"/>
              </div>
            </div>
          </ProtectedRoute>} />

          {/* Teacher routes */}
          <Route path="/teacher" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />

          {/* Existing game routes */}
          <Route path="/games/arithmetic" element={<ProtectedRoute><ArithmeticGame /></ProtectedRoute>} />
          <Route path="/games/geometry" element={<ProtectedRoute><GeometryGame /></ProtectedRoute>} />
          <Route path="/games/fractions" element={<ProtectedRoute><FractionFrenzy /></ProtectedRoute>} />
          <Route path="/games/balancer" element={<ProtectedRoute><EquationBalancer /></ProtectedRoute>} />
          <Route path="/games/meteor" element={<ProtectedRoute><MultiplicationMeteor /></ProtectedRoute>} />
          <Route path="/games/patterns" element={<ProtectedRoute><PatternPuzzle /></ProtectedRoute>} />

          {/* New game routes */}
          <Route path="/games/number-catcher" element={<ProtectedRoute><NumberCatcher /></ProtectedRoute>} />
          <Route path="/games/balloon-pop" element={<ProtectedRoute><BalloonPopSequence /></ProtectedRoute>} />
          <Route path="/games/fruit-rush" element={<ProtectedRoute><FruitRush /></ProtectedRoute>} />
          <Route path="/games/math-racing" element={<ProtectedRoute><MathRacing /></ProtectedRoute>} />
          <Route path="/games/farm-multiply" element={<ProtectedRoute><MultiplicationFarm /></ProtectedRoute>} />
          <Route path="/games/fraction-ninja" element={<ProtectedRoute><FractionNinja /></ProtectedRoute>} />
          <Route path="/games/decimal-mall" element={<ProtectedRoute><DecimalMall /></ProtectedRoute>} />
          <Route path="/games/coordinate-treasure" element={<ProtectedRoute><CoordinateTreasure /></ProtectedRoute>} />
          <Route path="/games/integer-mountain" element={<ProtectedRoute><IntegerMountain /></ProtectedRoute>} />
          <Route path="/games/algebra-dungeon" element={<ProtectedRoute><AlgebraDungeon /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
