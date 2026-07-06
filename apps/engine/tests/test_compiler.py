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
