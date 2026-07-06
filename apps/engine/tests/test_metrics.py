"""metrics — 성과 지표와 IS/OOS 과적합 판정."""

import pandas as pd
import pytest

import backtester
import metrics


def _result(df, signal_on):
    signal = pd.Series(0.0, index=df.index)
    signal.iloc[signal_on] = 1.0
    return backtester.run(df, signal, 0.0, 0.0, 1_000_000)


class TestCompute:
    def test_buy_and_hold_return_matches_price_change(self, ramp_df):
        result = _result(ramp_df, slice(0, len(ramp_df)))
        m = metrics.compute(result, 252)
        # 포지션은 1번 봉부터 → close[0] 대비 마지막 종가 수익률
        expected = (ramp_df["close"].iloc[-1] / ramp_df["close"].iloc[0] - 1) * 100
        assert m["total_return_pct"] == pytest.approx(expected, rel=1e-3)
        assert m["benchmark_return_pct"] == pytest.approx(expected, rel=1e-3)
        assert m["exposure_pct"] > 90

    def test_no_trades_zero_metrics(self, ramp_df):
        result = _result(ramp_df, slice(0, 0))
        m = metrics.compute(result, 252)
        assert m["num_trades"] == 0
        assert m["win_rate_pct"] == 0.0
        assert m["total_return_pct"] == pytest.approx(0.0)


class TestSplit:
    def test_short_period_not_available(self, ramp_df):
        result = _result(ramp_df, slice(0, len(ramp_df)))  # 60봉 → OOS 18봉 < 20
        split = metrics.compute_split(result, 252)
        assert split["available"] is False

    def test_long_period_available_with_verdict(self, sine_df):
        result = _result(sine_df, slice(0, len(sine_df)))
        split = metrics.compute_split(result, 252)
        assert split["available"] is True
        assert split["overfit_risk"] in ("low", "medium", "high")
        assert set(split["in_sample"]) == set(split["out_of_sample"])


class TestVerdict:
    def _m(self, sharpe, return_pct, num_trades=10):
        return {"sharpe": sharpe, "return_pct": return_pct, "num_trades": num_trades,
                "mdd_pct": -10.0, "win_rate_pct": 50.0}

    def test_is_profit_oos_loss_is_high_risk(self):
        verdict, _ = metrics._overfit_verdict(self._m(1.5, 30), self._m(-0.5, -10))
        assert verdict == "high"

    def test_consistent_performance_is_low_risk(self):
        verdict, _ = metrics._overfit_verdict(self._m(1.0, 20), self._m(0.9, 15))
        assert verdict == "low"

    def test_too_few_trades_is_medium(self):
        verdict, _ = metrics._overfit_verdict(self._m(1.0, 20, 2), self._m(1.0, 15, 1))
        assert verdict == "medium"


def test_periods_per_year():
    assert metrics.periods_per_year("crypto", "1d") == 365
    assert metrics.periods_per_year("stock", "1d") == 252
