// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// NOTE: no `fetch` is mocked — v1 never calls the (teacher-only) class endpoint.
vi.mock('../engine/engineAPI', () => ({
  classMastery: vi.fn(),
  getAllMastery: vi.fn(() => ({})),
}));
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { id: 'B', name: 'Bilal' } }),
}));
vi.mock('../store/usePlayerStore', () => ({
  usePlayerStore: () => ({ gamesPlayed: 3 }),
}));

import { classMastery, getAllMastery } from '../engine/engineAPI';
import FairLeaderboard from './FairLeaderboard';

describe('FairLeaderboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the fair ranking from an injected class and highlights the local student', () => {
    classMastery.mockReturnValue({
      perSkill: {},
      ranking: [
        { id: 'B', name: 'Bilal', breadth: 5, shrunkenMastery: 0.8, score: 4.0 },
        { id: 'A', name: 'Asha', breadth: 1, shrunkenMastery: 0.6, score: 0.6 },
      ],
    });
    const students = [
      { id: 'B', name: 'Bilal', attempts: 100, mastery: { addition: 0.8 } },
      { id: 'A', name: 'Asha', attempts: 1, mastery: { addition: 1.0 } },
    ];
    const { getByText } = render(<FairLeaderboard students={students} />);
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    expect(getByText('Bilal')).toBeInTheDocument();
    expect(getByText(/You/i)).toBeInTheDocument(); // local student tag
    expect(classMastery).toHaveBeenCalledWith(students);
  });

  it('builds a local-only class (no fetch) and shows the offline note when no students prop is given', () => {
    // Engine reports practiced skills for the local student.
    getAllMastery.mockReturnValue({ addition: 0.8, counting: 0.2 /* prior, dropped */ });
    classMastery.mockReturnValue({
      perSkill: {},
      ranking: [{ id: 'B', name: 'Bilal', breadth: 1, shrunkenMastery: 0.8, score: 0.8 }],
    });

    const { getByText } = render(<FairLeaderboard />);

    // The "class" is the single local student, built from the engine — NOT a fetch.
    expect(classMastery).toHaveBeenCalledWith([
      { id: 'B', name: 'Bilal', attempts: 3, mastery: { addition: 0.8 } },
    ]);
    expect(getByText(/Class data offline/i)).toBeInTheDocument();
    expect(getByText(/Bilal/)).toBeInTheDocument();
  });

  it('never references a global fetch (no network call in v1)', () => {
    getAllMastery.mockReturnValue({});
    classMastery.mockReturnValue({ perSkill: {}, ranking: [] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<FairLeaderboard />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
