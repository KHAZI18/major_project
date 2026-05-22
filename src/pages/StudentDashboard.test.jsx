// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

// Mock the engine API used by the child cards.
vi.mock('../engine/engineAPI', () => ({
  suggestNext: vi.fn(() => ({ skillId: 'addition', games: ['ArithmeticGame'] })),
  getDueReviews: vi.fn(() => ['multiplication']),
  getAllMastery: vi.fn(() => ({ addition: 0.9 })),
  classMastery: vi.fn(() => ({ perSkill: {}, ranking: [{ id: 'me', name: 'You', breadth: 1, shrunkenMastery: 0.9, score: 0.9 }] })),
}));
// Stores used by the page + FairLeaderboard + BadgeDisplay child.
// (allBadgesMeta is required by the existing BadgeDisplay card the page renders.)
vi.mock('../store/usePlayerStore', () => ({
  usePlayerStore: () => ({ xp: 100, level: 1, coins: 0, streak: 0, avatar: '🦊', badges: [], allBadgesMeta: [], gamesPlayed: 2, history: [] }),
}));
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { id: 'me', name: 'You', grade: 2 }, token: null }),
}));

import StudentDashboard from './StudentDashboard';

describe('StudentDashboard engine integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the engine-driven cards and the fair-rank widget', () => {
    const { getByText, queryByText } = renderWithRouter(<StudentDashboard />);
    expect(getByText(/Suggested for you/i)).toBeInTheDocument();
    expect(getByText(/Time to refresh/i)).toBeInTheDocument();
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    expect(getByText(/Your Skills/i)).toBeInTheDocument();
    // The raw-XP "Top Players" leaderboard block is gone.
    expect(queryByText(/Top Players/i)).toBeNull();
  });
});
