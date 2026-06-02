import re
from pathlib import Path

from scripts.eval import knowledge_graph as kg

JS_PATH = Path(__file__).resolve().parents[1] / "src" / "engine" / "knowledgeGraph.js"


def test_thirteen_skills_in_canonical_order():
    assert len(kg.SKILL_IDS) == 13
    assert kg.SKILL_IDS[0] == "counting"
    assert "algebra-basics" in kg.SKILL_IDS
    # canonical index lookup is consistent
    for i, sid in enumerate(kg.SKILL_IDS):
        assert kg.skill_index(sid) == i


def test_prereqs_only_reference_valid_skills():
    for sid in kg.SKILL_IDS:
        for p in kg.get_prereqs(sid):
            assert p in kg.SKILL_IDS


def test_graph_is_acyclic():
    order = kg.topological_order()
    assert len(order) == len(kg.SKILL_IDS)
    assert set(order) == set(kg.SKILL_IDS)


def test_prereqs_met_respects_cutoff():
    assert kg.are_prereqs_met("addition", {"counting": 0.8}, 0.75) is True
    assert kg.are_prereqs_met("addition", {"counting": 0.5}, 0.75) is False
    assert kg.are_prereqs_met("counting", {}, 0.75) is True  # no prereqs


def test_descendants_and_leverage():
    desc = kg.get_descendants("subtraction")
    assert "multiplication" in desc and "division" in desc
    assert "subtraction" not in desc
    assert kg.get_leverage("subtraction") > kg.get_leverage("patterns")
    assert kg.get_leverage("coord-geometry") == 0  # leaf


def test_python_graph_matches_js_source():
    """Guard against drift: parse PREREQS from knowledgeGraph.js and compare."""
    src = JS_PATH.read_text()
    block = re.search(r"const PREREQS = \{(.*?)\n\};", src, re.S).group(1)
    js_prereqs = {}
    for line in block.splitlines():
        m = re.match(r"\s*'([\w-]+)':\s*\[(.*?)\],", line)
        if not m:
            continue
        key = m.group(1)
        deps = re.findall(r"'([\w-]+)'", m.group(2))
        js_prereqs[key] = deps
    assert set(js_prereqs) == set(kg.SKILL_IDS)
    for sid in kg.SKILL_IDS:
        assert sorted(js_prereqs[sid]) == sorted(kg.get_prereqs(sid)), sid
