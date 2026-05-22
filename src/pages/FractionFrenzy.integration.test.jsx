// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const recordAttempt = vi.fn(() => Promise.resolve(0.5));
vi.mock('../engine/engineAPI', () => ({
  // FractionFrenzy imports only recordAttempt; provide getNextDifficulty as a no-op
  // so the module's import list resolves regardless of future edits.
  recordAttempt: (...a) => recordAttempt(...a),
  getNextDifficulty: () => 'easy',
}));
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ user: { name: 'Test Student', grade: 3 } }),
}));

import FractionFrenzy from './FractionFrenzy';

describe('FractionFrenzy engine integration', () => {
  beforeEach(() => recordAttempt.mockClear());

  it('records an attempt with the fractions-basic skill on an option click', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FractionFrenzy />
      </MemoryRouter>
    );

    // The redesigned game has a start screen — begin the challenge first.
    await user.click(screen.getByRole('button', { name: /start challenge/i }));

    // The four answer options render as ChoiceCard buttons (rounded-2xl).
    const optionButtons = screen.getAllByRole('button').filter((b) => b.className.includes('rounded-2xl'));
    expect(optionButtons.length).toBeGreaterThan(0);
    await user.click(optionButtons[0]);

    expect(recordAttempt).toHaveBeenCalledTimes(1);
    const arg = recordAttempt.mock.calls[0][0];
    expect(arg.skillId).toBe('fractions-basic');
    expect(typeof arg.correct).toBe('boolean');
  });
});
