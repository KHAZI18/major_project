from scripts.eval import bkt


def test_correct_raises_belief():
    p2 = bkt.update_belief(bkt.DEFAULT_PARAMS.pL0, True)
    assert p2 > bkt.DEFAULT_PARAMS.pL0
    assert abs(p2 - 0.600) < 0.01  # matches masteryModel.js test


def test_incorrect_lowers_belief():
    p2 = bkt.update_belief(bkt.DEFAULT_PARAMS.pL0, False)
    assert p2 < bkt.DEFAULT_PARAMS.pL0
    assert abs(p2 - 0.176) < 0.01


def test_belief_stays_in_unit_interval():
    p = bkt.DEFAULT_PARAMS.pL0
    for c in [True, True, True, False, True, False]:
        p = bkt.update_belief(p, c)
        assert 0.0 <= p <= 1.0


def test_prob_correct_uses_guess_and_slip():
    # not known -> roughly the guess rate; fully known -> roughly 1 - slip
    assert abs(bkt.prob_correct(0.0) - bkt.DEFAULT_PARAMS.pG) < 1e-9
    assert abs(bkt.prob_correct(1.0) - (1 - bkt.DEFAULT_PARAMS.pS)) < 1e-9
