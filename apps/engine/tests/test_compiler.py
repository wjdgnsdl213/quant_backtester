"""dsl.compiler — 조건 평가와 포지션 상태 머신(손절/익절) 검증."""

import pytest

from dsl import compiler
from dsl.schema import StrategyDSL
from tests.conftest import make_df


def _dsl(entry, exit_, risk=None, direction="long"):
    return StrategyDSL.model_validate(
        {"version": 1, "name": "테스트", "direction": direction,
         "entry": entry, "exit": exit_, "risk": risk or {}}
    )


CLOSE = {"ind": "close", "params": {}}
NEVER = {"op": "gt", "left": {"ind": "close", "params": {}}, "right": {"const": 1e12}}


class TestCrossSemantics:
    def test_cross_above_fires_once_at_crossing_bar(self):
        df = make_df([100, 102, 104, 106, 108, 110])  # 105를 3번 봉(106)에서 상향 돌파
        cond = compiler.eval_condition(
            _dsl({"op": "cross_above", "left": CLOSE, "right": {"const": 105}}, NEVER).entry,
            df,
        )
        assert cond.tolist() == [False, False, False, True, False, False]

    def test_cross_below_fires_once(self):
        df = make_df([110, 108, 106, 104, 102, 100])  # 105를 3번 봉(104)에서 하향 돌파
        cond = compiler.eval_condition(
            _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 105}}, NEVER).entry,
            df,
        )
        assert cond.tolist() == [False, False, False, True, False, False]


class TestStateMachine:
    def test_stop_loss_exits_on_close_below_threshold(self):
        # 2번 봉에서 진입 시그널(95 하향 돌파) → 진입가 = 3번 봉 시가(=2번 종가 90)
        # 5번 봉 종가 85 <= 90 * 0.95 → 손절
        closes = [100, 100, 90, 90, 90, 85, 90, 90]
        df = make_df(closes)
        dsl = _dsl(
            {"op": "cross_below", "left": CLOSE, "right": {"const": 95}},
            NEVER,
            {"stop_loss_pct": 5},
        )
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[2] == 1.0  # 진입 시그널 봉부터 상태는 in-position
        assert pos.iloc[4] == 1.0
        assert pos.iloc[5] == 0.0  # 손절 발동
        assert pos.iloc[6] == 0.0

    def test_take_profit_exits(self):
        closes = [100, 100, 90, 90, 100, 100]  # 4번 봉 종가 100 >= 90*1.10 → 익절
        df = make_df(closes)
        dsl = _dsl(
            {"op": "cross_below", "left": CLOSE, "right": {"const": 95}},
            NEVER,
            {"take_profit_pct": 10},
        )
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[3] == 1.0
        assert pos.iloc[4] == 0.0

    def test_simultaneous_entry_exit_does_not_enter(self, ramp_df):
        always = {"op": "gt", "left": CLOSE, "right": {"const": 0}}
        dsl = _dsl(always, always)
        pos = compiler.build_position(dsl, ramp_df)
        assert (pos == 0.0).all()

    def test_no_stop_loss_stays_in_position(self):
        closes = [100, 100, 90, 90, 90, 85, 80, 75]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER)
        pos = compiler.build_position(dsl, df)
        assert (pos.iloc[2:] == 1.0).all()  # 청산 조건 없음 + 손절 없음 → 계속 보유


class TestShortStateMachine:
    """direction="short" — 손절/익절 방향이 반전되고 포지션 값이 -1이 된다."""

    def test_entry_sets_negative_position(self):
        closes = [100, 100, 90, 90, 90, 90]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER,
                    direction="short")
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[2] == -1.0
        assert pos.iloc[5] == -1.0  # 청산 조건 없음 → 계속 보유

    def test_short_stop_loss_on_price_rise(self):
        # 진입가 = 3번 봉 시가(=2번 종가 90); 5번 봉 종가 95 >= 90*1.05 → 손절(가격 상승)
        closes = [100, 100, 90, 90, 90, 95, 90, 90]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER,
                    {"stop_loss_pct": 5}, direction="short")
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[4] == -1.0
        assert pos.iloc[5] == 0.0

    def test_short_take_profit_on_price_fall(self):
        # 진입가=90; take_profit=10% → 임계값 81; 4번 봉 종가 80 <= 81 → 익절(가격 하락)
        closes = [100, 100, 90, 90, 80, 80]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER,
                    {"take_profit_pct": 10}, direction="short")
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[3] == -1.0
        assert pos.iloc[4] == 0.0


class TestSizing:
    def test_size_pct_scales_position(self):
        closes = [100, 100, 90, 90, 90, 90]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER,
                    {"size_pct": 30})
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[3] == pytest.approx(0.3)

    def test_short_size_pct_is_negative(self):
        closes = [100, 100, 90, 90, 90, 90]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER,
                    {"size_pct": 50}, direction="short")
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[3] == pytest.approx(-0.5)

    def test_default_size_is_full(self):
        closes = [100, 100, 90, 90]
        df = make_df(closes)
        dsl = _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER)
        pos = compiler.build_position(dsl, df)
        assert pos.iloc[3] == pytest.approx(1.0)


class TestIntrabarStops:
    """장중 저가/고가 터치 판정 — 종가가 회복해도 손절이 발동해야 한다."""

    def _entry_dsl(self, risk, direction="long"):
        return _dsl({"op": "cross_below", "left": CLOSE, "right": {"const": 95}}, NEVER,
                     risk, direction=direction)

    def test_intrabar_stop_fires_on_low_touch_despite_close_recovery(self):
        # 진입가 = open[3] = 90 (전일 종가). 5번 봉: 저가 84(손절선 85.5 터치), 종가 90(회복)
        closes = [100, 100, 90, 90, 90, 90, 90, 90]
        df = make_df(closes)
        df.loc[df.index[5], "low"] = 84.0
        dsl = self._entry_dsl({"stop_loss_pct": 5, "intrabar": True})
        pos, fills = compiler.compile_strategy(dsl, df)
        assert pos.iloc[5] == 0.0  # 장중 터치로 청산
        assert 5 in fills
        assert fills[5] == pytest.approx(90 * 0.95)  # 체결가 = 손절선

        # 종가 기준(intrabar=False)이면 종가 90 > 85.5 → 청산 안 됨
        dsl_close = self._entry_dsl({"stop_loss_pct": 5, "intrabar": False})
        pos_close, fills_close = compiler.compile_strategy(dsl_close, df)
        assert pos_close.iloc[5] == 1.0
        assert fills_close == {}

    def test_gap_down_fills_at_open(self):
        # 5번 봉이 시가 80으로 갭 하락 (손절선 85.5 아래) → 체결가는 시가 80
        closes = [100, 100, 90, 90, 90, 80, 80, 80]
        df = make_df(closes)  # open[5] = 전일 종가 90... 시가를 직접 조작
        df.loc[df.index[5], "open"] = 80.0
        df.loc[df.index[5], "low"] = 79.0
        dsl = self._entry_dsl({"stop_loss_pct": 5, "intrabar": True})
        pos, fills = compiler.compile_strategy(dsl, df)
        assert fills[5] == pytest.approx(80.0)  # 갭: 손절선이 아니라 시가 체결

    def test_intrabar_take_profit_on_high_touch(self):
        # 진입가 90, 익절 10% → 99. 5번 봉 고가 100 터치, 종가 90
        closes = [100, 100, 90, 90, 90, 90, 90, 90]
        df = make_df(closes)
        df.loc[df.index[5], "high"] = 100.0
        dsl = self._entry_dsl({"take_profit_pct": 10, "intrabar": True})
        pos, fills = compiler.compile_strategy(dsl, df)
        assert pos.iloc[5] == 0.0
        assert fills[5] == pytest.approx(99.0)

    def test_short_intrabar_stop_on_high_touch(self):
        # 숏 진입가 90, 손절 5% → 94.5. 5번 봉 고가 95 터치, 종가 90
        closes = [100, 100, 90, 90, 90, 90, 90, 90]
        df = make_df(closes)
        df.loc[df.index[5], "high"] = 95.0
        dsl = self._entry_dsl({"stop_loss_pct": 5, "intrabar": True}, direction="short")
        pos, fills = compiler.compile_strategy(dsl, df)
        assert pos.iloc[5] == 0.0
        assert fills[5] == pytest.approx(94.5)

    def test_equity_uses_fill_price_not_close(self):
        """장중 손절 봉의 손익은 종가(회복)가 아니라 체결가 기준이어야 한다."""
        import backtester
        closes = [100.0] * 3 + [90, 90, 90, 90, 90]
        df = make_df(closes)
        df.loc[df.index[5], "low"] = 84.0  # 손절선 85.5 터치 후 종가 90 회복
        dsl = self._entry_dsl({"stop_loss_pct": 5, "intrabar": True})
        pos, fills = compiler.compile_strategy(dsl, df)
        result = backtester.run(df, pos, 0.0, 0.0, 1_000_000)
        result_fill = backtester.run(df, pos, 0.0, 0.0, 1_000_000, fills)
        # 체결가 반영 시: 5번 봉 수익률 = 85.5/90 - 1 = -5% 손실이 자산에 반영
        assert result_fill["equity"].iloc[-1] < result["equity"].iloc[-1]
        assert result_fill["equity"].iloc[-1] == pytest.approx(1_000_000 * (85.5 / 90), rel=1e-6)

    def test_trades_record_fill_price_and_trigger_bar(self):
        import backtester
        closes = [100.0] * 3 + [90, 90, 90, 90, 90]
        df = make_df(closes)
        df.loc[df.index[5], "low"] = 84.0
        dsl = self._entry_dsl({"stop_loss_pct": 5, "intrabar": True})
        pos, fills = compiler.compile_strategy(dsl, df)
        trades = backtester.run(df, pos, 0.0, 0.0, 1_000_000, fills)["trades"]
        closed = [t for t in trades if t["exit_time"] is not None]
        assert len(closed) == 1
        assert closed[0]["exit_price"] == pytest.approx(85.5)
        assert closed[0]["exit_time"] == df.index[5].isoformat()  # 트리거 봉 시각


class TestChannelBreakout:
    """회귀 테스트: close vs highest/lowest 채널 돌파가 실제로 발동해야 한다.

    highest/lowest가 당일 봉을 포함해 계산되던 버전에서는 close가 항상 high 이하이므로
    'close > highest' 상향 돌파가 수학적으로 절대 참이 될 수 없었다 (0건 거래로 조용히 실패).
    """

    def test_close_can_cross_above_highest_channel(self):
        prices = [100] * 25 + [130]  # 오랜 횡보 후 급등
        df = make_df(prices)
        dsl = _dsl(
            {"op": "cross_above", "left": CLOSE, "right": {"ind": "highest", "params": {"period": 20}}},
            NEVER,
        )
        entry = compiler.eval_condition(dsl.entry, df)
        assert entry.any()

    def test_close_can_cross_below_lowest_channel(self):
        prices = [100] * 25 + [70]  # 오랜 횡보 후 급락
        df = make_df(prices)
        dsl = _dsl(
            {"op": "cross_below", "left": CLOSE, "right": {"ind": "lowest", "params": {"period": 20}}},
            NEVER,
        )
        entry = compiler.eval_condition(dsl.entry, df)
        assert entry.any()


class TestLogic:
    def test_and_or_not(self, ramp_df):
        above_120 = {"op": "gt", "left": CLOSE, "right": {"const": 120}}
        below_140 = {"op": "lt", "left": CLOSE, "right": {"const": 140}}
        band = compiler.eval_condition(
            _dsl({"op": "and", "args": [above_120, below_140]}, NEVER).entry, ramp_df
        )
        # ramp: close = 100..159 → 121~139 구간만 True
        expected = (ramp_df["close"] > 120) & (ramp_df["close"] < 140)
        assert (band == expected).all()

        negated = compiler.eval_condition(
            _dsl({"op": "not", "arg": above_120}, NEVER).entry, ramp_df
        )
        assert (negated == ~(ramp_df["close"] > 120)).all()
