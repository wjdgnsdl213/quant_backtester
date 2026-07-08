"""신뢰 점수: 등급 서열·거래 부족 상한·컴포넌트 가용성 검증."""

import numpy as np
import pytest

import backtester
import metrics
import scoring
from dsl import compiler
from dsl.schema import StrategyDSL
from tests.conftest import make_df

PPY = 252.0
CAPITAL = 1_000_000

CROSS_DSL = {
    "version": 1,
    "name": "SMA5 교차",
    "entry": {"op": "cross_above", "left": {"ind": "close", "params": {}},
              "right": {"ind": "sma", "params": {"period": 5}}},
    "exit": {"op": "cross_below", "left": {"ind": "close", "params": {}},
             "right": {"ind": "sma", "params": {"period": 5}}},
    "risk": {},
}


def _score(df, dsl_dict=CROSS_DSL, n_sims=200):
    dsl = StrategyDSL.model_validate(dsl_dict)
    signal, fills = compiler.compile_strategy(dsl, df)
    result = backtester.run(df, signal, 0.001, 0.0005, CAPITAL, fills)
    split = metrics.compute_split(result, PPY)
    return scoring.compute(result, split, PPY, CAPITAL, n_sims)


@pytest.fixture
def uptrend_wave_df():
    """꾸준한 상승 + 진동 (600봉) — 교차 전략이 잘 통하는 시세."""
    t = np.arange(600)
    closes = 100 + t * 0.3 + 8 * np.sin(2 * np.pi * t / 20)
    return make_df(closes)


@pytest.fixture
def random_walk_df():
    """시드 고정 랜덤워크 (600봉) — 예측 불가능해 교차 전략이 비용만 내는 시세."""
    rng = np.random.default_rng(7)
    closes = 100 * np.cumprod(1 + rng.normal(0, 0.01, 600))
    return make_df(closes)


class TestGradeOrdering:
    def test_good_strategy_scores_higher_than_bad(self, uptrend_wave_df, random_walk_df):
        good = _score(uptrend_wave_df)
        bad = _score(random_walk_df)
        assert good["score"] > bad["score"]
        # 서열만이 아니라 등급대도 갈려야 의미가 있다
        assert good["grade"] in ("A", "B")
        assert bad["grade"] in ("C", "D", "F")

    def test_grade_matches_score_cut(self, uptrend_wave_df):
        out = _score(uptrend_wave_df)
        order = ["F", "D", "C", "B", "A"]
        # 등급은 점수 컷 등급보다 좋을 수 없다 (상한은 낮출 수만 있음)
        assert order.index(out["grade"]) <= order.index(scoring._grade(out["score"]))

    def test_score_in_range(self, uptrend_wave_df, random_walk_df):
        for df in (uptrend_wave_df, random_walk_df):
            out = _score(df)
            assert 0 <= out["score"] <= 100
            for c in out["components"]:
                if c["available"]:
                    assert 0 <= c["score"] <= 100


class TestTradeCap:
    def test_few_trades_caps_grade(self, uptrend_wave_df):
        # 거래가 거의 없는 전략: 진입 조건이 사실상 불가능
        rare = {**CROSS_DSL,
                "entry": {"op": "gt", "left": {"ind": "close", "params": {}},
                          "right": {"const": 1e9}}}
        out = _score(uptrend_wave_df, rare)
        order = ["F", "D", "C", "B", "A"]
        assert order.index(out["grade"]) <= order.index(scoring.TRADE_CAP_GRADE)
        # 몬테카를로는 거래 부족으로 불가 → 경고에 반영
        mc = next(c for c in out["components"] if c["id"] == "montecarlo")
        assert not mc["available"]
        assert out["warnings"]

    def test_cap_warning_present_when_capped(self, uptrend_wave_df):
        rare = {**CROSS_DSL,
                "entry": {"op": "gt", "left": {"ind": "close", "params": {}},
                          "right": {"const": 1e9}}}
        out = _score(uptrend_wave_df, rare)
        trades_comp = next(c for c in out["components"] if c["id"] == "trades")
        assert trades_comp["score"] < 40  # 30건 만점 기준으로 매우 낮아야


class TestComponents:
    def test_short_period_disables_consistency_only(self):
        df = make_df(100 + np.arange(70, dtype=float))
        out = _score(df)
        is_oos = next(c for c in out["components"] if c["id"] == "is_oos")
        cons = next(c for c in out["components"] if c["id"] == "consistency")
        # 70봉: IS/OOS(49/21봉, 각 최소 20봉)는 가능하지만 4등분 구간(17봉 < 20봉)은 불가
        assert cons["available"] is False
        assert is_oos["available"] is True

    def test_weights_sum_to_one(self):
        assert abs(sum(scoring.WEIGHTS.values()) - 1.0) < 1e-9

    def test_consistency_segments_reported(self, uptrend_wave_df):
        out = _score(uptrend_wave_df)
        cons = next(c for c in out["components"] if c["id"] == "consistency")
        assert cons["available"] and len(cons["segments"]) == scoring.N_SEGMENTS


class TestScoreApi:
    def test_score_endpoint(self, monkeypatch):
        from fastapi.testclient import TestClient
        import main

        t = np.arange(400)
        closes = 100 + 10 * np.sin(2 * np.pi * t / 20) + t * 0.01
        monkeypatch.setattr(main.loader, "load_ohlcv", lambda *a, **k: make_df(closes))
        client = TestClient(main.app)

        res = client.post("/score", json={
            "source": "stock", "symbol": "TEST", "interval": "1d",
            "start": "2023-01-01", "end": "2024-12-31",
            "strategy": "custom", "dsl": CROSS_DSL, "n_sims": 200,
        })
        assert res.status_code == 200
        body = res.json()
        assert body["grade"] in "ABCDF"
        assert {c["id"] for c in body["components"]} == {"is_oos", "consistency", "montecarlo", "trades"}
        assert body["strategy"]["id"] == "custom"
