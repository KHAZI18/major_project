// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../engine/engineAPI', () => ({
  getAllMastery: vi.fn(),
}));
import { getAllMastery } from '../engine/engineAPI';
import MasteryChart, { masteryBars } from './MasteryChart';

describe('masteryBars', () => {
  it('shapes a mastery map into sorted 0-100 bars, prior skills excluded', () => {
    const bars = masteryBars({ addition: 0.9, counting: 0.2, subtraction: 0.5 });
    expect(bars[0]).toMatchObject({ skill: 'Addition', value: 90 });
    expect(bars.map((b) => b.skill)).not.toContain('Counting'); // 0.2 = prior, excluded
    expect(bars.map((b) => b.skill)).toContain('Subtraction');
  });
});

describe('MasteryChart', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the card header and a practiced-skill count', () => {
    getAllMastery.mockReturnValue({ addition: 0.9, subtraction: 0.5, counting: 0.2 });
    const { getByText } = render(<MasteryChart />);
    expect(getByText(/Your Skills/i)).toBeInTheDocument();
    expect(getByText(/2 skills practiced/i)).toBeInTheDocument();
  });

  it('shows an empty state when nothing is practiced', () => {
    getAllMastery.mockReturnValue({ addition: 0.2, counting: 0.2 });
    const { getByText } = render(<MasteryChart />);
    expect(getByText(/Play a game/i)).toBeInTheDocument();
  });
});
