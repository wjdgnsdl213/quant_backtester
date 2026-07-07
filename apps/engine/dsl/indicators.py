"""검증된 지표 블록 레지스트리.

전략 DSL이 참조할 수 있는 지표는 여기 등록된 것뿐이다.
- UI의 블록 팔레트가 이 스키마로 자동 생성된다
- AI 전략 생성 프롬프트에도 같은 스키마가 주입된다
즉 지표를 하나 추가하면 엔진·UI·AI가 동시에 알게 된다.

계산 규칙: 모든 지표는 해당 봉까지의 정보만 사용한다 (rolling/ewm).
미래 참조(lookahead)가 있는 지표는 등록 금지.
"""

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd


@dataclass
class ParamSpec:
    key: str
    label: str
    type: str  # "int" | "float"
    default: float
    min: float
    max: float
    step: float = 1

    def as_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class IndicatorSpec:
    id: str
    label: str
    description: str
    params: list[ParamSpec] = field(default_factory=list)
    fn: Callable[[pd.DataFrame, dict], pd.Series] = None
    unit: str = "price"  # "price" | "percent" | "volume" — UI 힌트용


def _rsi(df: pd.DataFrame, p: dict) -> pd.Series:
    period = int(p["period"])
    delta = df["close"].diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    # 하락이 전혀 없는 구간은 정의상 RSI=100 (NaN으로 두면 상승장에서 매도 조건이 침묵)
    return rsi.mask((loss == 0) & (gain > 0), 100.0)


def _bb(df: pd.DataFrame, p: dict, which: str) -> pd.Series:
    period = int(p["period"])
    mid = df["close"].rolling(period).mean()
    if which == "mid":
        return mid
    band = df["close"].rolling(period).std() * float(p["mult"])
    return mid + band if which == "upper" else mid - band


def _macd_line(df: pd.DataFrame, p: dict) -> pd.Series:
    fast = df["close"].ewm(span=int(p["fast"]), min_periods=int(p["fast"])).mean()
    slow = df["close"].ewm(span=int(p["slow"]), min_periods=int(p["slow"])).mean()
    return fast - slow


def _highest(df: pd.DataFrame, p: dict) -> pd.Series:
    """당일 이전 N봉 고가의 최댓값 (당일 봉 제외 — 돈치안 채널 정의).

    당일을 포함하면 close는 항상 high 이하이므로 'close가 highest를 상향 돌파'가
    수학적으로 절대 참이 될 수 없다 (당일이 신고가인 순간 highest==당일 high).
    돌파 전략이 실제로 작동하려면 반드시 당일 이전 구간만 봐야 한다.
    """
    period = int(p["period"])
    return df["high"].rolling(period).max().shift(1)


def _lowest(df: pd.DataFrame, p: dict) -> pd.Series:
    """당일 이전 N봉 저가의 최솟값 (당일 봉 제외). _highest와 대칭인 이유는 그 함수 참고."""
    period = int(p["period"])
    return df["low"].rolling(period).min().shift(1)


def _atr(df: pd.DataFrame, p: dict) -> pd.Series:
    period = int(p["period"])
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period).mean()


_PERIOD = lambda d, lo=2, hi=400: [ParamSpec("period", "기간(봉)", "int", d, lo, hi)]  # noqa: E731

SPECS: dict[str, IndicatorSpec] = {}


def _register(spec: IndicatorSpec):
    SPECS[spec.id] = spec


_register(IndicatorSpec("close", "종가", "봉 종가", [], lambda df, p: df["close"]))
_register(IndicatorSpec("open", "시가", "봉 시가", [], lambda df, p: df["open"]))
_register(IndicatorSpec("high", "고가", "봉 고가", [], lambda df, p: df["high"]))
_register(IndicatorSpec("low", "저가", "봉 저가", [], lambda df, p: df["low"]))
_register(IndicatorSpec("volume", "거래량", "봉 거래량", [], lambda df, p: df["volume"], unit="volume"))

_register(IndicatorSpec(
    "sma", "단순이동평균 (SMA)", "종가의 N봉 단순 평균",
    _PERIOD(20), lambda df, p: df["close"].rolling(int(p["period"])).mean()))
_register(IndicatorSpec(
    "ema", "지수이동평균 (EMA)", "최근 봉에 가중치를 두는 이동평균",
    _PERIOD(20), lambda df, p: df["close"].ewm(span=int(p["period"]), min_periods=int(p["period"])).mean()))
_register(IndicatorSpec(
    "rsi", "RSI", "상대강도지수 (0~100). 30 이하 과매도, 70 이상 과매수로 흔히 해석",
    _PERIOD(14, 2, 100), _rsi, unit="percent"))
_register(IndicatorSpec(
    "bb_upper", "볼린저 상단", "이동평균 + 표준편차×배수",
    _PERIOD(20, 5, 200) + [ParamSpec("mult", "표준편차 배수", "float", 2.0, 0.5, 4.0, 0.1)],
    lambda df, p: _bb(df, p, "upper")))
_register(IndicatorSpec(
    "bb_mid", "볼린저 중심선", "볼린저밴드 중심 이동평균",
    _PERIOD(20, 5, 200), lambda df, p: _bb(df, p, "mid")))
_register(IndicatorSpec(
    "bb_lower", "볼린저 하단", "이동평균 - 표준편차×배수",
    _PERIOD(20, 5, 200) + [ParamSpec("mult", "표준편차 배수", "float", 2.0, 0.5, 4.0, 0.1)],
    lambda df, p: _bb(df, p, "lower")))
_register(IndicatorSpec(
    "macd", "MACD 선", "단기 EMA - 장기 EMA",
    [ParamSpec("fast", "단기 기간", "int", 12, 2, 100), ParamSpec("slow", "장기 기간", "int", 26, 5, 300)],
    _macd_line))
_register(IndicatorSpec(
    "macd_signal", "MACD 시그널", "MACD 선의 EMA",
    [ParamSpec("fast", "단기 기간", "int", 12, 2, 100), ParamSpec("slow", "장기 기간", "int", 26, 5, 300),
     ParamSpec("signal", "시그널 기간", "int", 9, 2, 100)],
    lambda df, p: _macd_line(df, p).ewm(span=int(p["signal"]), min_periods=int(p["signal"])).mean()))
_register(IndicatorSpec(
    "atr", "ATR", "평균 진폭 (변동성 지표)",
    _PERIOD(14, 2, 100), _atr))
_register(IndicatorSpec(
    "roc", "수익률 (ROC)", "최근 N봉 수익률(%). 0보다 크면 상승 추세",
    _PERIOD(60, 1, 400), lambda df, p: df["close"].pct_change(int(p["period"])) * 100, unit="percent"))
_register(IndicatorSpec(
    "highest", "최고가 채널", "당일 이전 N봉 고가의 최댓값 (돌파 전략용, 당일 봉 제외)",
    _PERIOD(20, 2, 400), _highest))
_register(IndicatorSpec(
    "lowest", "최저가 채널", "당일 이전 N봉 저가의 최솟값 (돌파 전략용, 당일 봉 제외)",
    _PERIOD(20, 2, 400), _lowest))
_register(IndicatorSpec(
    "volume_sma", "거래량 이동평균", "거래량의 N봉 평균",
    _PERIOD(20, 2, 400), lambda df, p: df["volume"].rolling(int(p["period"])).mean(), unit="volume"))


def compute(ind_id: str, df: pd.DataFrame, params: dict) -> pd.Series:
    """지표 계산. params는 스키마 기본값으로 채운 뒤 전달된 값으로 덮어쓴다."""
    spec = SPECS[ind_id]
    p = {ps.key: ps.default for ps in spec.params}
    p.update(params or {})
    return spec.fn(df, p)


def schema() -> list[dict]:
    """UI 블록 팔레트 / AI 프롬프트용 스키마."""
    return [
        {
            "id": s.id,
            "label": s.label,
            "description": s.description,
            "unit": s.unit,
            "params": [ps.as_dict() for ps in s.params],
        }
        for s in SPECS.values()
    ]
