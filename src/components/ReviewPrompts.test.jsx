// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter } from '../test/renderWithRouter';

vi.mock('../engine/engineAPI', () => ({
  getDueReviews: vi.fn(),
}));
import { getDueReviews } from '../engine/engineAPI';
import ReviewPrompts from './ReviewPrompts';

describe('ReviewPrompts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists each due skill with a refresh link', () => {
    getDueReviews.mockReturnValue(['addition', 'multiplication']);
    const { getByText, getAllByRole } = renderWithRouter(<ReviewPrompts />);
    expect(getByText(/Time to refresh/i)).toBeInTheDocument();
    expect(getByText(/Addition/i)).toBeInTheDocument();
    expect(getByText(/Multiplication/i)).toBeInTheDocument();
    expect(getAllByRole('link').length).toBeGreaterThanOrEqual(2);
  });

  it('renders nothing when no skill is due', () => {
    getDueReviews.mockReturnValue([]);
    const { container } = renderWithRouter(<ReviewPrompts />);
    expect(container).toBeEmptyDOMElement();
  });
});
