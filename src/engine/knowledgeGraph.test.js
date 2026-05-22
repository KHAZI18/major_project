import { describe, it, expect } from 'vitest';
import {
  SKILL_IDS,
  SKILLS,
  getPrereqs,
  arePrereqsMet,
  getDescendants,
  getLeverage,
  getGamesForSkill,
  topologicalOrder,
} from './knowledgeGraph';

describe('knowledgeGraph', () => {
  it('declares 13 skills with metadata', () => {
    expect(SKILL_IDS).toHaveLength(13);
    expect(SKILL_IDS).toContain('counting');
    expect(SKILL_IDS).toContain('algebra-basics');
    for (const id of SKILL_IDS) {
      expect(SKILLS[id]).toBeDefined();
      expect(typeof SKILLS[id].description).toBe('string');
    }
  });

  it('only references valid skill ids in prerequisites', () => {
    for (const id of SKILL_IDS) {
      for (const p of getPrereqs(id)) {
        expect(SKILL_IDS).toContain(p);
      }
    }
  });

  it('is acyclic (topologicalOrder covers every skill)', () => {
    const order = topologicalOrder();
    expect(order).toHaveLength(SKILL_IDS.length);
    expect(new Set(order)).toEqual(new Set(SKILL_IDS));
  });

  it('arePrereqsMet respects the mastery cutoff', () => {
    expect(arePrereqsMet('addition', { counting: 0.8 }, 0.75)).toBe(true);
    expect(arePrereqsMet('addition', { counting: 0.5 }, 0.75)).toBe(false);
    expect(arePrereqsMet('counting', {}, 0.75)).toBe(true); // no prereqs
  });

  // Boundary: exactly 0.75 counts as "mastered" for unlocking (>= cutoff).
  it('treats exactly-0.75 prerequisite mastery as met', () => {
    expect(arePrereqsMet('addition', { counting: 0.75 }, 0.75)).toBe(true);
  });

  it('computes downstream descendants and leverage', () => {
    const desc = getDescendants('subtraction');
    expect(desc).toContain('multiplication');
    expect(desc).toContain('division');
    expect(desc).not.toContain('subtraction');
    expect(getLeverage('subtraction')).toBeGreaterThan(getLeverage('patterns'));
    expect(getLeverage('coord-geometry')).toBe(0); // leaf
  });

  it('maps games to skills', () => {
    expect(getGamesForSkill('multiplication')).toContain('MultiplicationMeteor');
    expect(getGamesForSkill('multiplication')).toContain('MultiplicationFarm');
  });
});
