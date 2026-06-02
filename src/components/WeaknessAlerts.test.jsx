// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import WeaknessAlerts from './WeaknessAlerts';

describe('WeaknessAlerts', () => {
  const students = [
    { id: 'A', name: 'Asha', mastery: { addition: 0.9, 'fractions-basic': 0.2 } },
    { id: 'B', name: 'Bilal', mastery: { addition: 0.8, 'fractions-basic': 0.4 } },
  ];
  const perSkill = { addition: 0.85, 'fractions-basic': 0.3 };

  it('lists weak skills weakest-first with class-mean percent', () => {
    const { getByText, queryByText } = render(<WeaknessAlerts perSkill={perSkill} students={students} />);
    expect(getByText(/Weakness Alerts/i)).toBeInTheDocument();
    expect(getByText(/Fractions Basic/i)).toBeInTheDocument();
    expect(getByText(/30%/)).toBeInTheDocument();        // class mean
    expect(queryByText(/^Addition$/)).toBeNull();        // strong skill not listed
  });

  it('shows an all-clear state when no skill is weak', () => {
    const { getByText } = render(<WeaknessAlerts perSkill={{ addition: 0.85 }} students={students} />);
    expect(getByText(/No class-wide weaknesses/i)).toBeInTheDocument();
  });
});
