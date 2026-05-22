"""Python port of src/engine/decisionLayer.js for the A/B treatment arm.

Reimplemented (not bridged to Node) for a single-process, deterministic eval run.
Golden tests in tests/test_decision.py mirror decisionLayer.test.js verbatim.
"""
from __future__ import annotations

import math

from scripts.eval.knowledge_graph import (
    MASTERY_CUTOFF,
    SKILL_IDS,
    get_leverage,
    get_prereqs,
)

DAY_MS = 86_400_000


def next_difficulty(skill_id: str, mastery: dict[str, float]) -> str:
    """§6.1 ZPD bins. Boundary 0.75 -> medium (matches decisionLayer.js)."""
    m = mastery.get(skill_id, 0.0)
    if m < 0.4:
        return "easy"
    if m <= 0.75:
        return "medium"
    return "hard"


def suggest_next_skill(mastery: dict[str, float], last_practiced: dict[str, float] | None = None,
                       now: float = 0.0):
    """§6.2 highest-leverage unlocked, unmastered skill; tie-break to not-recent."""
    last_practiced = last_practiced or {}
    candidates = [
        sid for sid in SKILL_IDS
        if mastery.get(sid, 0.0) < MASTERY_CUTOFF
        and all(mastery.get(p, 0.0) >= MASTERY_CUTOFF for p in get_prereqs(sid))
    ]
    if not candidates:
        return None

    def sort_key(sid: str):
        recent = 1 if (now - last_practiced.get(sid, 0.0)) < DAY_MS else 0
        # higher leverage first (negate), then not-recent first
        return (-get_leverage(sid), recent)

    candidates.sort(key=sort_key)
    return {"skill_id": candidates[0]}


def create_review(now: float = 0.0) -> dict:
    return {"ease": 2.5, "interval": 1, "last_reviewed": now, "reps": 0}


def update_review(prev: dict, correct: bool, now: float = 0.0) -> dict:
    if correct:
        return {
            "ease": min(2.5, prev["ease"] + 0.1),
            # JS Math.round is half-UP; Python round() is banker's rounding
            # (round(2.5)==2). The SM-2 golden values (1*2.5 -> 3, 3*2.5 -> 8)
            # require half-up, so use floor(x + 0.5). Do NOT use bare round().
            "interval": math.floor(prev["interval"] * prev["ease"] + 0.5),
            "last_reviewed": now,
            "reps": prev["reps"] + 1,
        }
    return {
        "ease": max(1.3, prev["ease"] - 0.2),
        "interval": 1,
        "last_reviewed": now,
        "reps": 0,
    }


def is_due(review: dict, now: float = 0.0) -> bool:
    return now > review["last_reviewed"] + review["interval"] * DAY_MS


def due_for_review(review_map: dict[str, dict], now: float = 0.0) -> list[str]:
    return [sid for sid, r in review_map.items() if is_due(r, now)]
