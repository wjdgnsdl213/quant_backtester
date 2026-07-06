"""backtester.run — 체결 시점(look-ahead 방지), 비용 차감, 거래 추출 검증."""

import numpy as np
import pandas as pd
import pytest

import backtester
from tests.conftest import make_df

CAPITAL = 1_000_000.0


def _signal(df, on_bars) -> pd.Series:
    s = pd.Series(0.0, index=df.index)
    s.iloc[list(on_bars)] = 1.0
    return s


class TestLookAhead:
    """시그널이 뜬 봉의 수익은 절대 잡으면 안 되고, 다음 봉부터 반영되어야 한다."""

    def _jump_df(self):
        # 10번 봉에서 100 → 110 점프, 이후 110 유지
        return make_df([100.0] * 10 + [110.0] * 10)

    def test_signal_on_jump_bar_misses_the_jump(self):
        """점프 당일(10번 봉)에 시그널 → 포지션은 11번 봉부터 → 점프 수익 없음."""
        df = self._jump_df()
        result = backtester.run(df, _signal(df, range(10, 20)), 0.0, 0.0, CAPITAL)
        # 점프(+10%)를 놓쳤으므로 자산은 그대로여야 한다 (이후 가격 변화 없음)
        assert result["equity"].iloc[-1] == pytest.approx(CAPITAL)

    def test_signal_before_jump_captures_the_jump(self):
        """점프 전날(9번 봉)에 시그널 → 포지션은 10번 봉부터 → +10% 획득."""
        df = self._jump_df()
        result = backtester.run(df, _signal(df, range(9, 20)), 0.0, 0.0, CAPITAL)
        assert result["equity"].iloc[-1] == pytest.approx(CAPITAL * 1.10)


class TestCosts:
    def test_round_trip_cost_deducted_twice(self, flat_df):
        """가격 변화 없는 왕복 1회: 진입·청산 각각 (fee+slippage)만큼 차감."""
        fee, slip = 0.001, 0.0005
        result = backtester.run(flat_df, _signal(flat_df, range(5, 9)), fee, slip, CAPITAL)
        expected = CAPITAL * (1 - (fee + slip)) ** 2
        assert result["equity"].iloc[-1] == pytest.approx(expected)

    def test_no_cost_when_no_trades(self, flat_df):
        result = backtester.run(flat_df, _signal(flat_df, []), 0.001, 0.0005, CAPITAL)
        assert result["equity"].iloc[-1] == pytest.approx(CAPITAL)


class TestBuyAndHold:
    def test_all_one_signal_tracks_benchmark_minus_entry_cost(self, ramp_df):
        fee, slip = 0.001, 0.0005
        signal = pd.Series(1.0, index=ramp_df.index)
        result = backtester.run(ramp_df, signal, fee, slip, CAPITAL)
        bench_final = result["benchmark"].iloc[-1]
        # 진입 1회 비용만 차이 (근사 — 비용이 수익률에서 차감되는 가산 모델)
        ratio = result["equity"].iloc[-1] / bench_final
        assert ratio == pytest.approx(1 - (fee + slip), rel=1e-3)


class TestTrades:
    def test_closed_trade_has_entry_and_exit(self, flat_df):
        result = backtester.run(flat_df, _signal(flat_df, range(5, 9)), 0.0, 0.0, CAPITAL)
        closed = [t for t in result["trades"] if t["exit_time"] is not None]
        assert len(closed) == 1
        assert closed[0]["holding_bars"] > 0

    def test_open_position_reported_with_null_exit(self, flat_df):
        n = len(flat_df)
        result = backtester.run(flat_df, _signal(flat_df, range(5, n)), 0.0, 0.0, CAPITAL)
        assert len(result["trades"]) == 1
        assert result["trades"][0]["exit_time"] is None

    def test_equity_never_nan(self, ramp_df):
        result = backtester.run(ramp_df, _signal(ramp_df, range(3, 40)), 0.001, 0.0005, CAPITAL)
        assert not np.isnan(result["equity"].to_numpy()).any()
        assert not np.isnan(result["drawdown"].to_numpy()).any()
