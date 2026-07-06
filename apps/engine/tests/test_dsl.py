"""dsl.schema — 전략 DSL 검증 규칙."""

import pytest
from pydantic import ValidationError

from dsl.schema import StrategyDSL

RSI = {"ind": "rsi", "params": {"period": 14}}
VALID = {
    "version": 1,
    "name": "테스트",
    "entry": {"op": "lt", "left": RSI, "right": {"const": 30}},
    "exit": {"op": "gt", "left": RSI, "right": {"const": 70}},
}


def test_valid_dsl_passes():
    dsl = StrategyDSL.model_validate(VALID)
    assert dsl.name == "테스트"


def test_unknown_indicator_rejected():
    bad = {**VALID, "entry": {"op": "lt", "left": {"ind": "hacker", "params": {}}, "right": {"const": 1}}}
    with pytest.raises(ValidationError, match="알 수 없는 지표"):
        StrategyDSL.model_validate(bad)


def test_unknown_param_rejected():
    bad = {**VALID, "entry": {"op": "lt", "left": {"ind": "rsi", "params": {"nope": 1}}, "right": {"const": 30}}}
    with pytest.raises(ValidationError, match="없는 파라미터"):
        StrategyDSL.model_validate(bad)


def test_out_of_range_param_clamped():
    dsl = StrategyDSL.model_validate(
        {**VALID, "entry": {"op": "lt", "left": {"ind": "rsi", "params": {"period": 9999}}, "right": {"const": 30}}}
    )
    from dsl.schema import Compare, IndicatorRef
    assert isinstance(dsl.entry, Compare)
    assert isinstance(dsl.entry.left, IndicatorRef)
    assert dsl.entry.left.params["period"] == 100  # rsi period max


def test_cross_with_two_constants_rejected():
    bad = {**VALID, "entry": {"op": "cross_above", "left": {"const": 1}, "right": {"const": 2}}}
    with pytest.raises(ValidationError, match="상수일 수 없습니다"):
        StrategyDSL.model_validate(bad)


def test_name_truncated_to_60():
    dsl = StrategyDSL.model_validate({**VALID, "name": "가" * 100})
    assert len(dsl.name) == 60


def test_empty_name_gets_default():
    dsl = StrategyDSL.model_validate({**VALID, "name": "   "})
    assert dsl.name == "이름 없는 전략"


def test_risk_bounds():
    with pytest.raises(ValidationError):
        StrategyDSL.model_validate({**VALID, "risk": {"stop_loss_pct": -5}})
    with pytest.raises(ValidationError):
        StrategyDSL.model_validate({**VALID, "risk": {"stop_loss_pct": 95}})
