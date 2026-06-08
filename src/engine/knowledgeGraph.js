// Layer 1: hand-authored DAG of math skills. Transcribed from spec §4.
// Note: spec summary says "12 nodes" but the §4 table lists 13; we implement all 13
// and derive any model dimensions from SKILL_IDS.length (so the DKT input dim is
// 2 * SKILL_IDS.length = 26, not the spec's hard-coded 24).

export const SKILLS = {
  'counting':        { description: 'Number recognition, ordering', grade: '2' },
  'addition':        { description: 'Single & multi-digit addition', grade: '2-3' },
  'subtraction':     { description: 'Single & multi-digit subtraction', grade: '2-3' },
  'multiplication':  { description: 'Times tables, multi-digit', grade: '3-4' },
  'division':        { description: 'Basic division, remainders', grade: '4-5' },
  'patterns':        { description: 'Sequences, AP/GP basics', grade: '3-5' },
  'fractions-basic': { description: 'Identifying & comparing fractions', grade: '4-5' },
  'equiv-fractions': { description: 'Equivalence, addition of fractions', grade: '5-6' },
  'decimals':        { description: 'Decimal operations', grade: '5-6' },
  'integers':        { description: 'Negative numbers', grade: '5-6' },
  'geometry-shapes': { description: 'Shapes, angles, area, perimeter', grade: '4-6' },
  'coord-geometry':  { description: 'Coordinate plane, distance', grade: '6+' },
  'algebra-basics':  { description: 'Variables, simple equations', grade: '6+' },
};

export const SKILL_IDS = Object.keys(SKILLS);

// prereq -> the skill cannot be attempted until these are mastered (spec §4 DAG).
// The "(equations)" label on the algebra->geometry edge in the §4 diagram is not a
// skill; it is collapsed into the algebra-basics -> geometry-shapes edge.
const PREREQS = {
  'counting':        [],
  'addition':        ['counting'],
  'subtraction':     ['addition'],
  'multiplication':  ['subtraction'],
  'division':        ['multiplication'],
  'patterns':        ['addition', 'subtraction'],
  'integers':        ['multiplication'],
  'fractions-basic': ['division'],
  'equiv-fractions': ['fractions-basic'],
  'decimals':        ['fractions-basic'],
  'coord-geometry':  ['decimals'],
  'algebra-basics':  ['patterns'],
  'geometry-shapes': ['algebra-basics'],
};

// game page (component name) -> skills exercised (spec §4 table).
export const GAME_SKILLS = {
  ArithmeticGame:       ['addition', 'subtraction'],
  MultiplicationMeteor: ['multiplication'],
  MultiplicationFarm:   ['multiplication'],
  FractionFrenzy:       ['fractions-basic'],
  FractionNinja:        ['fractions-basic', 'equiv-fractions'],
  EquationBalancer:     ['algebra-basics'],
  AlgebraDungeon:       ['algebra-basics'],
  GeometryGame:         ['geometry-shapes'],
  CoordinateTreasure:   ['coord-geometry'],
  DecimalMall:          ['decimals'],
  IntegerMountain:      ['integers'],
  PatternPuzzle:        ['patterns'],
  NumberCatcher:        ['counting', 'patterns'],
  BalloonPopSequence:   ['counting', 'patterns'],
  FruitRush:            ['addition', 'multiplication'],
  MathRacing:           ['addition', 'multiplication'],
};

export function getPrereqs(skillId) {
  return PREREQS[skillId] ?? [];
}

export function arePrereqsMet(skillId, mastery, cutoff = 0.75) {
  return getPrereqs(skillId).every((p) => (mastery[p] ?? 0) >= cutoff);
}

// children[skill] = skills that list `skill` as a prerequisite.
const CHILDREN = SKILL_IDS.reduce((acc, id) => {
  acc[id] = SKILL_IDS.filter((other) => getPrereqs(other).includes(id));
  return acc;
}, {});

export function getDescendants(skillId) {
  const seen = new Set();
  const stack = [...(CHILDREN[skillId] ?? [])];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(CHILDREN[cur] ?? []));
  }
  return [...seen];
}

export function getLeverage(skillId) {
  return getDescendants(skillId).length;
}

export function getGamesForSkill(skillId) {
  return Object.keys(GAME_SKILLS).filter((g) => GAME_SKILLS[g].includes(skillId));
}

// Kahn's algorithm — throws if the graph has a cycle.
export function topologicalOrder() {
  const indeg = {};
  for (const id of SKILL_IDS) indeg[id] = getPrereqs(id).length;
  const queue = SKILL_IDS.filter((id) => indeg[id] === 0);
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const child of CHILDREN[node]) {
      indeg[child] -= 1;
      if (indeg[child] === 0) queue.push(child);
    }
  }
  if (order.length !== SKILL_IDS.length) {
    throw new Error('knowledgeGraph: prerequisite cycle detected');
  }
  return order;
}
