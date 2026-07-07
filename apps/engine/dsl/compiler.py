"""DSL → 포지션 시그널 컴파일러.

체결 모델 (backtester와 동일한 규칙):
- 모든 조건은 봉 종가 시점 정보로 평가된다
- pos[i]!=0 이면 backtester가 i+1봉부터 포지션을 반영한다
- 손절/익절의 진입가는 진입 다음 봉 시가로 근사
- 손절/익절 판정:
  - 기본(종가 기준): 종가가 임계값을 넘으면 청산, 해당 봉 수익률은 종가 기준
  - intrabar(장중 기준): 저가/고가가 임계값을 터치하면 청산으로 보고
    체결가를 임계값(갭이면 시가)으로 근사해 fills로 반환 — backtester가
    그 봉의 수익률을 체결가 기준으로 교체한다
- 포지션 크기: risk.size_pct (기본 100%). 숏이면 부호가 음수
"""

import numpy as np
import pandas as pd

from dsl import indicators
from dsl.schema import Compare, Condition, ConstRef, IndicatorRef, Logic, Not, Risk, StrategyDSL


def compile_strategy(dsl: StrategyDSL, df: pd.DataFrame) -> tuple[pd.Series, dict[int, float]]:
    """(포지션 시그널, 장중 청산 체결가) 반환.

    fills는 {트리거 봉 위치 → 체결가} — intrabar 청산이 없으면 빈 dict.
    """
    entry = eval_condition(dsl.entry, df)
    exit_ = eval_condition(dsl.exit, df)
    return _state_machine(df, entry, exit_, dsl.risk, dsl.direction)


def build_position(dsl: StrategyDSL, df: pd.DataFrame) -> pd.Series:
    return compile_strategy(dsl, df)[0]


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
                    direction: str = "long") -> tuple[pd.Series, dict[int, float]]:
    """direction="short"이면 포지션 부호가 음수이고 손절/익절 판정 방향이 반전된다
    (숏은 가격 상승 시 손실 → 상승 시 손절, 가격 하락 시 이익 → 하락 시 익절)."""
    n = len(df)
    open_ = df["open"].to_numpy(dtype=float)
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    close = df["close"].to_numpy(dtype=float)
    ent = entry.to_numpy(dtype=bool)
    ext = exit_.to_numpy(dtype=bool)
    sl = risk.stop_loss_pct
    tp = risk.take_profit_pct
    is_long = direction == "long"
    size = (1.0 if is_long else -1.0) * risk.size_pct / 100

    pos = np.zeros(n)
    fills: dict[int, float] = {}
    in_pos = False
    entry_price = np.nan

    for i in range(n):
        if in_pos and np.isnan(entry_price):
            entry_price = open_[i]  # 진입 시그널 다음 봉 → 이 봉 시가로 체결 근사

        if in_pos:
            exit_now = ext[i]
            fill = None
            if not exit_now and not np.isnan(entry_price):
                sl_level = None
                if sl is not None:
                    sl_level = entry_price * (1 - sl / 100) if is_long else entry_price * (1 + sl / 100)
                tp_level = None
                if tp is not None:
                    tp_level = entry_price * (1 + tp / 100) if is_long else entry_price * (1 - tp / 100)
                if risk.intrabar:
                    # 장중 터치 판정. 손절이 익절보다 우선(같은 봉에서 둘 다 닿으면 보수적으로 손절)
                    if sl is not None and (low[i] <= sl_level if is_long else high[i] >= sl_level):
                        exit_now = True
                        # 갭으로 시가가 이미 임계값을 넘었으면 시가 체결 (더 불리한 쪽)
                        fill = min(open_[i], sl_level) if is_long else max(open_[i], sl_level)
                    elif tp is not None and (high[i] >= tp_level if is_long else low[i] <= tp_level):
                        exit_now = True
                        # 익절은 갭이 유리한 쪽이면 시가 체결
                        fill = max(open_[i], tp_level) if is_long else min(open_[i], tp_level)
                else:
                    # 종가 기준 판정 (체결가 = 종가이므로 fills 불필요)
                    if sl is not None and (close[i] <= sl_level if is_long else close[i] >= sl_level):
                        exit_now = True
                    if tp is not None and (close[i] >= tp_level if is_long else close[i] <= tp_level):
                        exit_now = True
            if exit_now:
                in_pos = False
                entry_price = np.nan
                if fill is not None:
                    fills[i] = float(fill)
        else:
            if ent[i] and not ext[i]:  # 진입·청산 동시 발생 시 진입하지 않음
                in_pos = True
                entry_price = np.nan  # 체결가는 다음 봉 시가에서 확정

        pos[i] = size if in_pos else 0.0

    return pd.Series(pos, index=df.index), fills
