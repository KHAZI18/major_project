import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Components under test use react-router's <Link>, which needs a Router ancestor.
export function renderWithRouter(ui, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}
