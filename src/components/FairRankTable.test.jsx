// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../engine/engineAPI', () => ({ classMastery: vi.fn() }));
import { classMastery } from '../engine/engineAPI';
import FairRankTable from './FairRankTable';

describe('FairRankTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the ranking with breadth and mastery percent', () => {
    classMastery.mockReturnValue({
      perSkill: {},
      ranking: [
        { id: 'B', name: 'Bilal', breadth: 5, shrunkenMastery: 0.82, score: 4.1 },
        { id: 'A', name: 'Asha', breadth: 1, shrunkenMastery: 0.61, score: 0.61 },
      ],
    });
    const students = [{ id: 'B', name: 'Bilal', attempts: 100, mastery: {} }];
    const { getByText } = render(<FairRankTable students={students} />);
    expect(getByText(/Fair Ranking/i)).toBeInTheDocument();
    expect(getByText('Bilal')).toBeInTheDocument();
    expect(getByText('82%')).toBeInTheDocument(); // shrunken mastery
    expect(getByText('4.10')).toBeInTheDocument(); // score, 2 dp
    expect(classMastery).toHaveBeenCalledWith(students);
  });

  it('shows an empty state with no students', () => {
    classMastery.mockReturnValue({ perSkill: {}, ranking: [] });
    const { getByText } = render(<FairRankTable students={[]} />);
    expect(getByText(/No ranking data/i)).toBeInTheDocument();
  });
});
