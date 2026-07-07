"""전략 DSL을 사람이 읽을 수 있는 한국어 문장으로 변환한다.

AI가 생성한 전략을 실행 전에 사용자가 눈으로 확인하는 용도.
"""

from dsl import indicators
from dsl.schema import Compare, Condition, ConstRef, IndicatorRef, Logic, Not, StrategyDSL

_OPS = {
    "gt": "＞",
    "lt": "＜",
    "cross_above": "상향 돌파",
    "cross_below": "하향 돌파",
}


def _operand(ref) -> str:
    if isinstance(ref, ConstRef):
        v = ref.const
        return f"{v:g}"
    assert isinstance(ref, IndicatorRef)
    spec = indicators.SPECS[ref.ind]
    label = spec.label.split(" (")[0]  # "단순이동평균 (SMA)" → "단순이동평균"
    if not ref.params:
        defaults = {p.key: p.default for p in spec.params}
    else:
        defaults = {p.key: p.default for p in spec.params}
        defaults.update(ref.params)
    if defaults:
        args = ", ".join(f"{v:g}" for v in defaults.values())
        return f"{label}({args})"
    return label


def describe_condition(cond: Condition) -> str:
    if isinstance(cond, Compare):
        l, r = _operand(cond.left), _operand(cond.right)
        if cond.op in ("cross_above", "cross_below"):
            return f"{l}이(가) {r}을(를) {_OPS[cond.op]}"
        return f"{l} {_OPS[cond.op]} {r}"
    if isinstance(cond, Logic):
        joiner = " 그리고 " if cond.op == "and" else " 또는 "
        return "(" + joiner.join(describe_condition(a) for a in cond.args) + ")"
    if isinstance(cond, Not):
        return f"NOT ({describe_condition(cond.arg)})"
    return "?"


def describe(dsl: StrategyDSL) -> str:
    parts = []
    if dsl.direction == "short":
        parts.append("숏(하락 베팅)")
    parts.append(f"진입: {describe_condition(dsl.entry)}")
    parts.append(f"청산: {describe_condition(dsl.exit)}")
    if dsl.risk.stop_loss_pct:
        parts.append(f"손절: 진입가 대비 {dsl.risk.stop_loss_pct:g}%")
    if dsl.risk.take_profit_pct:
        parts.append(f"익절: 진입가 대비 {dsl.risk.take_profit_pct:g}%")
    if dsl.risk.size_pct < 100:
        parts.append(f"진입 비중: 자본의 {dsl.risk.size_pct:g}%")
    if dsl.risk.intrabar and (dsl.risk.stop_loss_pct or dsl.risk.take_profit_pct):
        parts.append("손절/익절 장중 판정")
    return " · ".join(parts)
