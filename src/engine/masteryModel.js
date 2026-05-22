// Layer 2: mastery estimation. Backend = Bayesian Knowledge Tracing (spec §10 fallback).
// Belief shape: { [skillId]: P(known) }. The DKT backend (separate plan) must implement
// the same three exports: createInitialBelief, updateBelief, getMastery.
import { SKILL_IDS } from './knowledgeGraph';

// Literature-typical defaults (spec §5.3 distributions, taken at their means).
export const DEFAULT_BKT_PARAMS = {
  pL0: 0.2, // prior P(knows skill)
  pT: 0.15, // P(learn) transition per opportunity
  pG: 0.2,  // P(guess) correct while not knowing
  pS: 0.1,  // P(slip) incorrect while knowing
};

export function createInitialBelief(params = DEFAULT_BKT_PARAMS) {
  const belief = {};
  for (const id of SKILL_IDS) belief[id] = params.pL0;
  return belief;
}

export function updateBelief(belief, skillId, correct, params = DEFAULT_BKT_PARAMS) {
  const { pT, pG, pS, pL0 } = params;
  const pL = belief[skillId] ?? pL0;

  const posterior = correct
    ? (pL * (1 - pS)) / (pL * (1 - pS) + (1 - pL) * pG)
    : (pL * pS) / (pL * pS + (1 - pL) * (1 - pG));

  const updated = posterior + (1 - posterior) * pT;
  return { ...belief, [skillId]: updated };
}

export function getMastery(belief, skillId, params = DEFAULT_BKT_PARAMS) {
  return belief?.[skillId] ?? params.pL0;
}
