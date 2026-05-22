// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

vi.mock('../engine/engineAPI', () => ({
  suggestNext: vi.fn(),
}));
import { suggestNext } from '../engine/engineAPI';
import SuggestedForYou from './SuggestedForYou';

describe('SuggestedForYou', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the suggested skill label and a game link', () => {
    suggestNext.mockReturnValue({ skillId: 'multiplication', games: ['MultiplicationMeteor'] });
    const { getByText, getByRole } = renderWithRouter(<SuggestedForYou />);
    expect(getByText(/Suggested for you/i)).toBeInTheDocument();
    // The skill label renders in the "Practice next:" line. (Both this span and the
    // "Multiplication Meteor" game name match /Multiplication/, so scope to the label.)
    expect(getByText('Multiplication')).toBeInTheDocument();
    const link = getByRole('link', { name: /Multiplication Meteor/i });
    expect(link).toHaveAttribute('href', '/games/meteor');
  });

  it('renders an all-caught-up state when there is no suggestion', () => {
    suggestNext.mockReturnValue(null);
    const { getByText, queryByRole } = renderWithRouter(<SuggestedForYou />);
    expect(getByText(/all caught up/i)).toBeInTheDocument();
    expect(queryByRole('link')).toBeNull();
  });

  it('skips games with no known route mapping', () => {
    suggestNext.mockReturnValue({ skillId: 'integers', games: ['UnmappedGame'] });
    const { queryAllByRole, getByText } = renderWithRouter(<SuggestedForYou />);
    expect(getByText(/Integers/i)).toBeInTheDocument();
    expect(queryAllByRole('link')).toHaveLength(0);
  });
});
