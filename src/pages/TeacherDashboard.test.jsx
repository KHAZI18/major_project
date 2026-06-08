// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

// No backend in tests: fetch rejects, so the dashboard uses MOCK_STUDENTS + synthesized mastery.
beforeEach(() => {
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));
});

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { name: 'Teacher' }, token: null }),
}));
vi.mock('../store/usePlayerStore', () => ({
  usePlayerStore: () => ({}),
}));

import TeacherDashboard from './TeacherDashboard';

describe('TeacherDashboard engine integration', () => {
  it('renders the heatmap, weakness alerts, fair-rank table, and keeps the XP roster', async () => {
    const { getByText, findByText } = renderWithRouter(<TeacherDashboard />);
    expect(await findByText(/Skill Heatmap/i)).toBeInTheDocument();
    expect(getByText(/Weakness Alerts/i)).toBeInTheDocument();
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    // The original XP roster table is still present (not deleted).
    expect(getByText(/Class Roster/i)).toBeInTheDocument();
  });
});
