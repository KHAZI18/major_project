// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const recordAttempt = vi.fn(() => Promise.resolve(0.5));
vi.mock('../engine/engineAPI', () => ({
  recordAttempt: (...a) => recordAttempt(...a),
  getNextDifficulty: () => 'easy',
}));

import MultiplicationFarm from './MultiplicationFarm';

describe('MultiplicationFarm engine integration', () => {
  beforeEach(() => recordAttempt.mockClear());

  it('records an attempt with the multiplication skill on an answer choice', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MultiplicationFarm />
      </MemoryRouter>
    );

    // Four numeric answer buttons render in a grid; click the first.
    const answerButtons = screen.getAllByRole('button').filter((b) => /^\d+$/.test(b.textContent.trim()));
    expect(answerButtons.length).toBeGreaterThan(0);
    await user.click(answerButtons[0]);

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    const arg = recordAttempt.mock.calls[0][0];
    expect(arg.skillId).toBe('multiplication');
    expect(typeof arg.correct).toBe('boolean');
  });
});
