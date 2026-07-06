"""프리셋 전략 레지스트리.

각 프리셋은 사용자 파라미터(dict)를 받아 DSL(dict)을 만들어 반환한다.
실행 전 반드시 StrategyDSL 스키마를 통과하므로, 프리셋도 AI 생성 전략과
같은 검증 경로를 지난다. UI 폼은 /strategies 응답의 params로 자동 생성된다.
"""

from dataclasses import dataclass, field
from typing import Callable

from dsl.indicators import ParamSpec


@dataclass
class Preset:
    id: str
    name: str
    description: str
    params: list[ParamSpec] = field(default_factory=list)
    build: Callable[[dict], dict] = None

    def meta(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "params": [p.as_dict() for p in self.params],
        }


def _ind(ind: str, **params) -> dict:
    return {"ind": ind, "params": params}


def _const(v: float) -> dict:
    return {"const": v}


def _cmp(op: str, left: dict, right: dict) -> dict:
    return {"op": op, "left": left, "right": right}


def _risk(p: dict) -> dict:
    """stop_loss_pct=0 은 '사용 안 함'."""
    sl = p.get("stop_loss_pct", 0)
    return {"stop_loss_pct": sl} if sl and sl > 0 else {}


_STOP = ParamSpec("stop_loss_pct", "손절 % (0=사용 안 함)", "float", 0, 0, 50, 0.5)

PRESETS: dict[str, Preset] = {}


def _register(p: Preset):
    PRESETS[p.id] = p


_register(Preset(
    "sma_cross", "이동평균 골든크로스",
    "단기 이동평균이 장기 이동평균을 상향 돌파하면 매수, 하향 돌파하면 매도합니다.",
    [
        ParamSpec("fast", "단기 기간(봉)", "int", 20, 2, 200),
        ParamSpec("slow", "장기 기간(봉)", "int", 60, 5, 400),
        _STOP,
    ],
    lambda p: {
        "name": "이동평균 골든크로스",
        "entry": _cmp("cross_above", _ind("sma", period=p["fast"]), _ind("sma", period=p["slow"])),
        "exit": _cmp("cross_below", _ind("sma", period=p["fast"]), _ind("sma", period=p["slow"])),
        "risk": _risk(p),
    },
))

_register(Preset(
    "rsi_reversal", "RSI 과매도 반등",
    "RSI가 기준선 아래로 떨어지면(과매도) 매수하고, 반등해 상단 기준선을 넘으면 매도합니다.",
    [
        ParamSpec("period", "RSI 기간(봉)", "int", 14, 2, 100),
        ParamSpec("buy_below", "매수 기준 (이하)", "float", 30, 5, 50),
        ParamSpec("sell_above", "매도 기준 (이상)", "float", 70, 50, 95),
        _STOP,
    ],
    lambda p: {
        "name": "RSI 과매도 반등",
        "entry": _cmp("lt", _ind("rsi", period=p["period"]), _const(p["buy_below"])),
        "exit": _cmp("gt", _ind("rsi", period=p["period"]), _const(p["sell_above"])),
        "risk": _risk(p),
    },
))

_register(Preset(
    "bb_reversal", "볼린저밴드 평균회귀",
    "종가가 볼린저 하단 밴드 아래로 내려가면 매수하고, 중심선을 회복하면 매도합니다.",
    [
        ParamSpec("period", "밴드 기간(봉)", "int", 20, 5, 200),
        ParamSpec("mult", "표준편차 배수", "float", 2.0, 0.5, 4.0, 0.1),
        _STOP,
    ],
    lambda p: {
        "name": "볼린저밴드 평균회귀",
        "entry": _cmp("lt", _ind("close"), _ind("bb_lower", period=p["period"], mult=p["mult"])),
        "exit": _cmp("gt", _ind("close"), _ind("bb_mid", period=p["period"])),
        "risk": _risk(p),
    },
))

_register(Preset(
    "macd_cross", "MACD 시그널 교차",
    "MACD 선이 시그널 선을 상향 돌파하면 매수, 하향 돌파하면 매도합니다.",
    [
        ParamSpec("fast", "단기 기간(봉)", "int", 12, 2, 100),
        ParamSpec("slow", "장기 기간(봉)", "int", 26, 5, 300),
        ParamSpec("signal", "시그널 기간(봉)", "int", 9, 2, 100),
        _STOP,
    ],
    lambda p: {
        "name": "MACD 시그널 교차",
        "entry": _cmp("cross_above",
                      _ind("macd", fast=p["fast"], slow=p["slow"]),
                      _ind("macd_signal", fast=p["fast"], slow=p["slow"], signal=p["signal"])),
        "exit": _cmp("cross_below",
                     _ind("macd", fast=p["fast"], slow=p["slow"]),
                     _ind("macd_signal", fast=p["fast"], slow=p["slow"], signal=p["signal"])),
        "risk": _risk(p),
    },
))

_register(Preset(
    "momentum", "모멘텀 추세추종",
    "최근 N봉 수익률이 기준치를 넘으면 상승 추세로 보고 매수, 수익률이 0 아래로 내려가면 매도합니다.",
    [
        ParamSpec("period", "관측 기간(봉)", "int", 60, 5, 400),
        ParamSpec("threshold", "진입 수익률 기준(%)", "float", 5, 0, 50, 0.5),
        _STOP,
    ],
    lambda p: {
        "name": "모멘텀 추세추종",
        "entry": _cmp("gt", _ind("roc", period=p["period"]), _const(p["threshold"])),
        "exit": _cmp("lt", _ind("roc", period=p["period"]), _const(0)),
        "risk": _risk(p),
    },
))


def list_meta() -> list[dict]:
    return [p.meta() for p in PRESETS.values()]


def build_dsl(strategy_id: str, params: dict) -> dict:
    preset = PRESETS.get(strategy_id)
    if preset is None:
        raise KeyError(strategy_id)
    # 폼에서 빠진 파라미터는 기본값으로, 범위 밖 값은 클램프
    p = {}
    for spec in preset.params:
        v = params.get(spec.key, spec.default)
        v = max(spec.min, min(spec.max, float(v)))
        p[spec.key] = int(v) if spec.type == "int" else v
    return preset.build(p)
