import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useSyncStore } from './store/useSyncStore';
import { usePlayerStore } from './store/usePlayerStore';
import { initSyncEngine, processSyncQueue } from './lib/syncEngine';
import { initEngine } from './engine/engineAPI';

// Layout & Global
import Navbar from './components/Navbar';
import { InstallPrompter } from './components/InstallPrompter';

// Pages
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import Profile from './pages/Profile';

import Leaderboard from './components/Leaderboard';

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

function GameRoute({ children }) {
  return <div className="game-route-surface">{children}</div>;
}

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
    // If the user clicked Sync, reload first and then process the queue once.
    if (sessionStorage.getItem('mv_sync_after_reload') === '1') {
      sessionStorage.removeItem('mv_sync_after_reload');
      processSyncQueue(setStatus).catch(() => {});
    }
    // Init online/offline listeners
    initListeners();
    // Hydrate player data from IndexedDB
    hydrate();
    // Hydrate the adaptive learning engine from IndexedDB (once, at startup)
    initEngine().catch(() => {});
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
                <a href="/student" className="btn btn-soft btn-sm bg-white shadow-sm">← Back</a>
                <h1 className="font-display text-2xl font-bold">🏆 Village Leaderboard</h1>
              </div>
              {/* Full leaderboard inline */}
              <div className="w-full">
                <Leaderboard />
              </div>
            </div>
          </ProtectedRoute>} />

          {/* Teacher routes */}
          <Route path="/teacher" element={<ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>} />

          {/* Existing game routes */}
          <Route path="/games/arithmetic" element={<ProtectedRoute><GameRoute><ArithmeticGame /></GameRoute></ProtectedRoute>} />
          <Route path="/games/geometry" element={<ProtectedRoute><GameRoute><GeometryGame /></GameRoute></ProtectedRoute>} />
          <Route path="/games/fractions" element={<ProtectedRoute><GameRoute><FractionFrenzy /></GameRoute></ProtectedRoute>} />
          <Route path="/games/balancer" element={<ProtectedRoute><GameRoute><EquationBalancer /></GameRoute></ProtectedRoute>} />
          <Route path="/games/meteor" element={<ProtectedRoute><GameRoute><MultiplicationMeteor /></GameRoute></ProtectedRoute>} />
          <Route path="/games/patterns" element={<ProtectedRoute><GameRoute><PatternPuzzle /></GameRoute></ProtectedRoute>} />

          {/* New game routes */}
          <Route path="/games/number-catcher" element={<ProtectedRoute><GameRoute><NumberCatcher /></GameRoute></ProtectedRoute>} />
          <Route path="/games/balloon-pop" element={<ProtectedRoute><GameRoute><BalloonPopSequence /></GameRoute></ProtectedRoute>} />
          <Route path="/games/fruit-rush" element={<ProtectedRoute><GameRoute><FruitRush /></GameRoute></ProtectedRoute>} />
          <Route path="/games/math-racing" element={<ProtectedRoute><GameRoute><MathRacing /></GameRoute></ProtectedRoute>} />
          <Route path="/games/farm-multiply" element={<ProtectedRoute><GameRoute><MultiplicationFarm /></GameRoute></ProtectedRoute>} />
          <Route path="/games/fraction-ninja" element={<ProtectedRoute><GameRoute><FractionNinja /></GameRoute></ProtectedRoute>} />
          <Route path="/games/decimal-mall" element={<ProtectedRoute><GameRoute><DecimalMall /></GameRoute></ProtectedRoute>} />
          <Route path="/games/coordinate-treasure" element={<ProtectedRoute><GameRoute><CoordinateTreasure /></GameRoute></ProtectedRoute>} />
          <Route path="/games/integer-mountain" element={<ProtectedRoute><GameRoute><IntegerMountain /></GameRoute></ProtectedRoute>} />
          <Route path="/games/algebra-dungeon" element={<ProtectedRoute><GameRoute><AlgebraDungeon /></GameRoute></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
