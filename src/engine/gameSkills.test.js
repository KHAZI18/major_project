import { describe, it, expect } from 'vitest';
import { skillForGame, skillsForGame } from './gameSkills';
import { SKILL_IDS } from './knowledgeGraph';

describe('gameSkills', () => {
  it('returns the primary (first) skill for a game', () => {
    expect(skillForGame('ArithmeticGame')).toBe('addition');
    expect(skillForGame('MultiplicationMeteor')).toBe('multiplication');
    expect(skillForGame('FractionFrenzy')).toBe('fractions-basic');
    expect(skillForGame('PatternPuzzle')).toBe('patterns');
    expect(skillForGame('MultiplicationFarm')).toBe('multiplication');
    expect(skillForGame('FractionNinja')).toBe('fractions-basic');
    expect(skillForGame('DecimalMall')).toBe('decimals');
    expect(skillForGame('IntegerMountain')).toBe('integers');
  });

  it('returns the full skill list for a game', () => {
    expect(skillsForGame('ArithmeticGame')).toEqual(['addition', 'subtraction']);
    expect(skillsForGame('FractionNinja')).toEqual(['fractions-basic', 'equiv-fractions']);
  });

  it('every primary skill is a valid skill id', () => {
    for (const game of ['ArithmeticGame', 'MultiplicationMeteor', 'FractionFrenzy',
      'PatternPuzzle', 'MultiplicationFarm', 'FractionNinja', 'DecimalMall', 'IntegerMountain']) {
      expect(SKILL_IDS).toContain(skillForGame(game));
    }
  });

  it('throws for an unknown game name (typo guard)', () => {
    expect(() => skillForGame('NotARealGame')).toThrow(/unknown game/i);
  });
});
