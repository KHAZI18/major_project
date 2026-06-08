from scripts.eval import decision


def test_next_difficulty_bins():
    assert decision.next_difficulty("addition", {"addition": 0.2}) == "easy"
    assert decision.next_difficulty("addition", {"addition": 0.4}) == "medium"
    assert decision.next_difficulty("addition", {"addition": 0.75}) == "medium"
    assert decision.next_difficulty("addition", {"addition": 0.9}) == "hard"
    assert decision.next_difficulty("addition", {}) == "easy"


def test_suggest_next_skill_unlock_and_leverage():
    r = decision.suggest_next_skill({"counting": 0.8})
    assert r["skill_id"] == "addition"
    # counting+addition mastered -> subtraction beats patterns on leverage
    r2 = decision.suggest_next_skill({"counting": 0.8, "addition": 0.8})
    assert r2["skill_id"] == "subtraction"


def test_suggest_returns_none_when_all_mastered():
    from scripts.eval.knowledge_graph import SKILL_IDS
    allm = {sid: 0.99 for sid in SKILL_IDS}
    assert decision.suggest_next_skill(allm) is None


def test_sm2_grows_and_resets():
    DAY = 86_400_000
    r0 = decision.create_review(1_000_000)
    assert r0 == {"ease": 2.5, "interval": 1, "last_reviewed": 1_000_000, "reps": 0}
    r1 = decision.update_review(r0, True, 1_000_000)
    assert r1["interval"] == 3 and r1["ease"] == 2.5 and r1["reps"] == 1
    r2 = decision.update_review(r1, True, 1_000_000)
    assert r2["interval"] == 8
    lapsed = decision.update_review(
        {"ease": 2.5, "interval": 8, "last_reviewed": 0, "reps": 2}, False, 5
    )
    assert lapsed["interval"] == 1
    assert abs(lapsed["ease"] - 2.3) < 1e-9
    assert lapsed["reps"] == 0
    now = 10 * DAY
    assert decision.is_due({"ease": 2.5, "interval": 1, "last_reviewed": now - 2 * DAY, "reps": 0}, now)
    assert not decision.is_due({"ease": 2.5, "interval": 5, "last_reviewed": now - 2 * DAY, "reps": 0}, now)
