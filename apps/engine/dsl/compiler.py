"""DSL → 포지션 시그널 컴파일러.

체결 모델 (backtester와 동일한 규칙):
- 모든 조건은 봉 종가 시점 정보로 평가된다
- pos[i]=1 이면 backtester가 i+1봉부터 포지션을 반영한다
- 손절/익절의 진입가는 진입 다음 봉 시가로 근사하고, 판정은 종가 기준
  (장중 터치는 보수적으로 무시 — 실제보다 유리하게 계산하지 않기 위한 단순화가 아니라
   종가 시그널 모델과의 일관성을 위한 선택이며, API 응답에 명시된다)
"""

import numpy as np
import pandas as pd

from dsl import indicators
from dsl.schema import Compare, Condition, ConstRef, IndicatorRef, Logic, Not, Risk, StrategyDSL


def build_position(dsl: StrategyDSL, df: pd.DataFrame) -> pd.Series:
    entry = eval_condition(dsl.entry, df)
    exit_ = eval_condition(dsl.exit, df)
    return _state_machine(df, entry, exit_, dsl.risk, dsl.direction)


def eval_condition(cond: Condition, df: pd.DataFrame) -> pd.Series:
    """조건 트리를 불리언 시리즈로 평가한다. NaN 비교는 False."""
    if isinstance(cond, Compare):
        l = _operand(cond.left, df)
        r = _operand(cond.right, df)
        if cond.op == "gt":
            return l > r
        if cond.op == "lt":
            return l < r
        if cond.op == "cross_above":
            return (l > r) & (l.shift(1) <= r.shift(1))
        return (l < r) & (l.shift(1) >= r.shift(1))  # cross_below
    if isinstance(cond, Logic):
        parts = [eval_condition(a, df) for a in cond.args]
        out = parts[0]
        for p in parts[1:]:
            out = (out & p) if cond.op == "and" else (out | p)
        return out
    if isinstance(cond, Not):
        return ~eval_condition(cond.arg, df)
    raise TypeError(f"알 수 없는 조건 노드: {type(cond)}")


def _operand(ref, df: pd.DataFrame) -> pd.Series:
    if isinstance(ref, ConstRef):
        return pd.Series(ref.const, index=df.index)
    assert isinstance(ref, IndicatorRef)
    return indicators.compute(ref.ind, df, ref.params)


def _state_machine(df: pd.DataFrame, entry: pd.Series, exit_: pd.Series, risk: Risk,
                    direction: str = "long") -> pd.Series:
    """direction="short"이면 포지션 값은 -1이 되고, 손절/익절 판정 방향이 반전된다
    (숏은 가격 상승 시 손실 → 상승 시 손절, 가격 하락 시 이익 → 하락 시 익절)."""
    n = len(df)
    open_ = df["open"].to_numpy(dtype=float)
    close = df["close"].to_numpy(dtype=float)
    ent = entry.to_numpy(dtype=bool)
    ext = exit_.to_numpy(dtype=bool)
    sl = risk.stop_loss_pct
    tp = risk.take_profit_pct
    sign = 1.0 if direction == "long" else -1.0

    pos = np.zeros(n)
    in_pos = False
    entry_price = np.nan

    for i in range(n):
        if in_pos and np.isnan(entry_price):
            entry_price = open_[i]  # 진입 시그널 다음 봉 → 이 봉 시가로 체결 근사

        if in_pos:
            exit_now = ext[i]
            if not exit_now and not np.isnan(entry_price):
                if direction == "long":
                    if sl is not None and close[i] <= entry_price * (1 - sl / 100):
                        exit_now = True
                    if tp is not None and close[i] >= entry_price * (1 + tp / 100):
                        exit_now = True
                else:
                    if sl is not None and close[i] >= entry_price * (1 + sl / 100):
                        exit_now = True
                    if tp is not None and close[i] <= entry_price * (1 - tp / 100):
                        exit_now = True
            if exit_now:
                in_pos = False
                entry_price = np.nan
        else:
            if ent[i] and not ext[i]:  # 진입·청산 동시 발생 시 진입하지 않음
                in_pos = True
                entry_price = np.nan  # 체결가는 다음 봉 시가에서 확정

        pos[i] = sign if in_pos else 0.0

    return pd.Series(pos, index=df.index)
