"""Python re-encoding of src/engine/knowledgeGraph.js (the JS source is canonical).

13 skills, prerequisite DAG, plus the decision-layer constants the eval harness needs.
Kept manually in sync; tests/test_knowledge_graph.py guards against drift.
"""
from __future__ import annotations

# Ordered exactly as Object.keys(SKILLS) in knowledgeGraph.js — this order defines
# every skill_idx / one-hot index used in the trajectory dataset.
SKILL_IDS: list[str] = [
    "counting",
    "addition",
    "subtraction",
    "multiplication",
    "division",
    "patterns",
    "fractions-basic",
    "equiv-fractions",
    "decimals",
    "integers",
    "geometry-shapes",
    "coord-geometry",
    "algebra-basics",
]

NUM_SKILLS: int = len(SKILL_IDS)  # 13
DKT_INPUT_DIM: int = 2 * NUM_SKILLS  # 26 — see knowledgeGraph.js header note

# prereq -> skills that must be mastered first (transcribed from PREREQS in the JS).
PREREQS: dict[str, list[str]] = {
    "counting": [],
    "addition": ["counting"],
    "subtraction": ["addition"],
    "multiplication": ["subtraction"],
    "division": ["multiplication"],
    "patterns": ["addition", "subtraction"],
    "integers": ["multiplication"],
    "fractions-basic": ["division"],
    "equiv-fractions": ["fractions-basic"],
    "decimals": ["fractions-basic"],
    "coord-geometry": ["decimals"],
    "algebra-basics": ["patterns"],
    "geometry-shapes": ["algebra-basics"],
}

# Decision-layer constants mirrored from decisionLayer.js.
MASTERY_CUTOFF: float = 0.75   # "mastered" for unlock/prereq/breadth
PREREQ_LEARN_GATE: float = 0.5  # spec §5.3: cannot LEARN a skill until prereqs > 0.5

_SKILL_INDEX = {sid: i for i, sid in enumerate(SKILL_IDS)}


def skill_index(skill_id: str) -> int:
    return _SKILL_INDEX[skill_id]


def get_prereqs(skill_id: str) -> list[str]:
    return PREREQS.get(skill_id, [])


def are_prereqs_met(skill_id: str, mastery: dict[str, float], cutoff: float = MASTERY_CUTOFF) -> bool:
    return all(mastery.get(p, 0.0) >= cutoff for p in get_prereqs(skill_id))


def prereqs_learnable(skill_id: str, mastery: dict[str, float], gate: float = PREREQ_LEARN_GATE) -> bool:
    """spec §5.3 learn gate: a skill cannot be LEARNED until every prereq > `gate`."""
    return all(mastery.get(p, 0.0) > gate for p in get_prereqs(skill_id))


# children[skill] = skills that list `skill` as a prerequisite.
_CHILDREN: dict[str, list[str]] = {
    sid: [other for other in SKILL_IDS if sid in get_prereqs(other)] for sid in SKILL_IDS
}


def get_children(skill_id: str) -> list[str]:
    return _CHILDREN.get(skill_id, [])


def get_descendants(skill_id: str) -> list[str]:
    seen: set[str] = set()
    stack = list(_CHILDREN.get(skill_id, []))
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(_CHILDREN.get(cur, []))
    return sorted(seen)


def get_leverage(skill_id: str) -> int:
    return len(get_descendants(skill_id))


def topological_order() -> list[str]:
    """Kahn's algorithm — raises on a cycle."""
    indeg = {sid: len(get_prereqs(sid)) for sid in SKILL_IDS}
    queue = [sid for sid in SKILL_IDS if indeg[sid] == 0]
    order: list[str] = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for child in _CHILDREN[node]:
            indeg[child] -= 1
            if indeg[child] == 0:
                queue.append(child)
    if len(order) != len(SKILL_IDS):
        raise ValueError("knowledge_graph: prerequisite cycle detected")
    return order
