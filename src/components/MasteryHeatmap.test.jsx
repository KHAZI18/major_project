// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MasteryHeatmap, { masteryColor } from './MasteryHeatmap';

describe('masteryColor', () => {
  it('maps mastery to a green/amber/red scale and gray for empty', () => {
    expect(masteryColor(null)).toMatch(/#e2e8f0|#E2E8F0/i); // neutral gray
    expect(masteryColor(0.9)).not.toBe(masteryColor(0.2)); // distinct buckets
  });
});

describe('MasteryHeatmap', () => {
  const students = [
    { id: 'A', name: 'Asha', grade: 4, mastery: { addition: 0.9, subtraction: 0.3 } },
    { id: 'B', name: 'Bilal', grade: 5, mastery: { addition: 0.4 } },
  ];

  it('renders a header, each student row, and a percent cell', () => {
    const { getByText, getAllByTitle } = render(<MasteryHeatmap students={students} />);
    expect(getByText(/Skill Heatmap/i)).toBeInTheDocument();
    expect(getByText('Asha')).toBeInTheDocument();
    expect(getByText('Bilal')).toBeInTheDocument();
    // Asha's addition cell carries a descriptive title.
    expect(getAllByTitle(/Asha.*Addition.*90%/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows an empty state with no students', () => {
    const { getByText } = render(<MasteryHeatmap students={[]} />);
    expect(getByText(/No class mastery data/i)).toBeInTheDocument();
  });
});
