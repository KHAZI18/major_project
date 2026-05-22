"""Pure-Python Bayesian Knowledge Tracing — mirrors src/engine/masteryModel.js.

Used for (a) the simulator's belief-tracking policy and (b) the §8.1 baseline
next-correct predictor so AUC is computable without a trained DKT model.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BKTParams:
    pL0: float = 0.2  # prior P(knows skill)
    pT: float = 0.15  # P(learn) transition per opportunity
    pG: float = 0.2   # P(guess correct | not known)
    pS: float = 0.1   # P(slip incorrect | known)


DEFAULT_PARAMS = BKTParams()


def update_belief(pL: float, correct: bool, params: BKTParams = DEFAULT_PARAMS) -> float:
    """One BKT step: condition belief on the observation, then apply learn transition."""
    pG, pS, pT = params.pG, params.pS, params.pT
    if correct:
        denom = pL * (1 - pS) + (1 - pL) * pG
        posterior = (pL * (1 - pS)) / denom if denom > 0 else pL
    else:
        denom = pL * pS + (1 - pL) * (1 - pG)
        posterior = (pL * pS) / denom if denom > 0 else pL
    return posterior + (1 - posterior) * pT


def prob_correct(pL: float, params: BKTParams = DEFAULT_PARAMS) -> float:
    """P(correct) given belief P(known): mixture of slip (known) and guess (unknown)."""
    return pL * (1 - params.pS) + (1 - pL) * params.pG
