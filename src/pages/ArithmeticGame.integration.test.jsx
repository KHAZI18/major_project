// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock the public engine API so we assert the integration, not the BKT math.
const getNextDifficulty = vi.fn(() => 'hard');
const recordAttempt = vi.fn(() => Promise.resolve(0.5));
vi.mock('../engine/engineAPI', () => ({
  getNextDifficulty: (...a) => getNextDifficulty(...a),
  recordAttempt: (...a) => recordAttempt(...a),
}));

// The redesigned game gates on an authenticated student — provide one.
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { name: 'Test Student', grade: 3 } }),
}));

import ArithmeticGame from './ArithmeticGame';

function renderGame() {
  return render(
    <MemoryRouter>
      <ArithmeticGame />
    </MemoryRouter>
  );
}

describe('ArithmeticGame engine integration', () => {
  beforeEach(() => {
    getNextDifficulty.mockClear();
    recordAttempt.mockClear();
    getNextDifficulty.mockReturnValue('hard');
  });

  it('seeds difficulty from the engine for the addition skill', () => {
    // The engine drives the (now-internal) difficulty; the UI no longer shows a
    // selector, so we just verify the engine is consulted for the right skill.
    renderGame();
    expect(getNextDifficulty).toHaveBeenCalledWith('addition');
  });

  it('records an attempt with the addition skill after an answer', async () => {
    const user = userEvent.setup();
    renderGame();
    await user.click(screen.getByRole('button', { name: /start session/i }));

    // After starting, the numeric answer input appears; enter a value and submit.
    const input = await screen.findByPlaceholderText('0');
    await user.type(input, '7');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    const arg = recordAttempt.mock.calls[0][0];
    expect(arg.skillId).toBe('addition');
    expect(typeof arg.correct).toBe('boolean');
    expect(typeof arg.responseTime).toBe('number');
  });
});
