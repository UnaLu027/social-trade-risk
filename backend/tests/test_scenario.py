import pytest


def test_scenario_low_risk(client):
    resp = client.post("/api/v1/scenario/simulate", json={
        "mention_growth": 1.0,
        "bullish_ratio": 0.5,
        "hype_score": 20.0,
        "influencer_activity": 0.1,
        "short_interest": 0.05,
        "option_activity": 0.8,
        "trading_restriction": False,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_label"] in ["low", "medium", "high"]
    total_prob = sum(data["risk_probabilities"].values())
    assert abs(total_prob - 1.0) < 0.02


def test_scenario_high_risk(client):
    resp = client.post("/api/v1/scenario/simulate", json={
        "mention_growth": 5.0,
        "bullish_ratio": 0.90,
        "hype_score": 85.0,
        "influencer_activity": 0.9,
        "short_interest": 0.50,
        "option_activity": 4.0,
        "trading_restriction": False,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_label"] == "high"
    assert data["hype_score_computed"] > 60


def test_scenario_trading_restriction_increases_risk(client):
    base = {
        "mention_growth": 2.5,
        "bullish_ratio": 0.70,
        "hype_score": 55.0,
        "influencer_activity": 0.5,
        "short_interest": 0.25,
        "option_activity": 2.0,
        "trading_restriction": False,
    }
    restricted = {**base, "trading_restriction": True}
    resp_base = client.post("/api/v1/scenario/simulate", json=base)
    resp_restricted = client.post("/api/v1/scenario/simulate", json=restricted)
    assert resp_base.status_code == 200
    assert resp_restricted.status_code == 200
    # Restricted scenario should have higher or equal hype
    assert resp_restricted.json()["hype_score_computed"] >= resp_base.json()["hype_score_computed"]


def test_scenario_response_schema(client):
    resp = client.post("/api/v1/scenario/simulate", json={
        "mention_growth": 2.0, "bullish_ratio": 0.6, "hype_score": 50.0,
        "influencer_activity": 0.4, "short_interest": 0.15, "option_activity": 1.5,
        "trading_restriction": False,
    })
    data = resp.json()
    assert "risk_label" in data
    assert "risk_probabilities" in data
    assert "hype_score_computed" in data
    assert "dominant_factor" in data
    assert "explanation" in data
    assert 0 <= data["hype_score_computed"] <= 100
