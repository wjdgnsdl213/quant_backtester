"""FastAPI 엔드포인트 스모크 — loader를 합성 데이터로 대체해 네트워크 없이 검증."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

import main
from tests.conftest import make_df


@pytest.fixture
def client(monkeypatch):
    t = np.arange(400)
    closes = 100 + 10 * np.sin(2 * np.pi * t / 20) + t * 0.01
    df = make_df(closes)
    monkeypatch.setattr(main.loader, "load_ohlcv", lambda *a, **k: df)
    return TestClient(main.app)


BASE = {
    "source": "stock", "symbol": "TEST", "interval": "1d",
    "start": "2023-01-01", "end": "2024-12-31",
    "fee": 0.001, "slippage": 0.0005, "initial_capital": 1_000_000,
}

CROSS_DSL = {
    "version": 1,
    "name": "SMA5 교차",
    "entry": {"op": "cross_above", "left": {"ind": "close", "params": {}},
              "right": {"ind": "sma", "params": {"period": 5}}},
    "exit": {"op": "cross_below", "left": {"ind": "close", "params": {}},
             "right": {"ind": "sma", "params": {"period": 5}}},
    "risk": {},
}


def test_strategies_and_indicators(client):
    assert len(client.get("/strategies").json()) >= 5
    assert any(i["id"] == "rsi" for i in client.get("/indicators").json())


def test_backtest_preset(client):
    res = client.post("/backtest", json={**BASE, "strategy": "sma_cross", "params": {}})
    assert res.status_code == 200
    body = res.json()
    assert set(body) >= {"metrics", "series", "ohlcv", "trades", "split"}
    assert len(body["series"]["equity"]) == 400


def test_backtest_custom_dsl(client):
    res = client.post("/backtest", json={**BASE, "strategy": "custom", "dsl": CROSS_DSL})
    assert res.status_code == 200
    assert res.json()["strategy"]["id"] == "custom"


def test_backtest_bad_dates(client):
    res = client.post("/backtest", json={**BASE, "start": "2025-01-01", "end": "2023-01-01",
                                         "strategy": "sma_cross"})
    assert res.status_code == 400


def test_dsl_validate(client):
    ok = client.post("/dsl/validate", json={"dsl": CROSS_DSL})
    assert ok.status_code == 200
    assert "summary" in ok.json()

    bad = client.post("/dsl/validate", json={"dsl": {"version": 1}})
    assert bad.status_code == 400


def test_montecarlo(client):
    res = client.post("/montecarlo", json={**BASE, "strategy": "custom", "dsl": CROSS_DSL,
                                           "n_sims": 200})
    assert res.status_code == 200
    body = res.json()
    n = body["n_trades"]
    assert n >= 10
    env = body["envelope"]
    assert len(env["p50"]) == n + 1
    # 백분위 단조성: 모든 스텝에서 p5 <= p50 <= p95
    assert all(a <= b <= c for a, b, c in zip(env["p5"], env["p50"], env["p95"]))
    assert 0 <= body["stats"]["prob_loss"] <= 100


def test_montecarlo_too_few_trades(client):
    # 교차가 거의 없는 전략 → 거래 부족 400
    rare = {**CROSS_DSL,
            "entry": {"op": "gt", "left": {"ind": "close", "params": {}}, "right": {"const": 1e9}}}
    res = client.post("/montecarlo", json={**BASE, "strategy": "custom", "dsl": rare})
    assert res.status_code == 400
