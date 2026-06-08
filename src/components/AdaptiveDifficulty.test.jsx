// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdaptiveDifficulty, { difficultyLevel } from './AdaptiveDifficulty';

vi.mock('../engine/engineAPI', () => ({
  getAllMastery: () => ({
    addition: 0.9,       // Hard  (level 2)
    subtraction: 0.6,    // Medium (level 1)
    counting: 0.3,       // Easy  (level 0)
    multiplication: 0.2, // prior → unpracticed, excluded
  }),
}));

describe('difficultyLevel', () => {
  it('maps mastery to the engine difficulty bands', () => {
    expect(difficultyLevel(0.2)).toBe(0);
    expect(difficultyLevel(0.39)).toBe(0);
    expect(difficultyLevel(0.4)).toBe(1);
    expect(difficultyLevel(0.75)).toBe(1);
    expect(difficultyLevel(0.8)).toBe(2);
  });
});

describe('AdaptiveDifficulty widget', () => {
  it('lists practiced skills and how many the ML raised above the old fixed level', () => {
    render(<AdaptiveDifficulty />);
    expect(screen.getByText(/Adaptive Difficulty/i)).toBeTruthy();
    // addition (Hard) + subtraction (Medium) are above the Easy baseline → 2 of 3
    // (multiplication sits at the 0.2 prior and is excluded as unpracticed).
    expect(screen.getByText(/2 of 3/)).toBeTruthy();
    expect(screen.getByText('Addition')).toBeTruthy();
  });
});
