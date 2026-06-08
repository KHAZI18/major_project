// Test helper: render a component inside a MemoryRouter so react-router
// primitives (Link, useNavigate, etc.) work under jsdom.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export function renderWithRouter(ui, { route = '/', ...options } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>, options);
}
