"""프리셋 파라미터 그리드 서치.

과적합 방지가 설계의 중심:
- 파라미터는 In-Sample(앞 70%) 성과로 순위를 매기고, Out-of-Sample(뒤 30%) 성과를
  나란히 보여준다. OOS를 정렬 기준으로 쓰면 검증 구간까지 오염되므로 쓰지 않는다.
- 각 조합마다 과적합 판정(overfit_risk)을 함께 반환한다.
"""

import itertools

import pandas as pd

import backtester
import metrics
import strategies
from dsl import compiler
from dsl.indicators import ParamSpec
from dsl.schema import StrategyDSL

MAX_COMBOS = 300
TOP_N = 20

_FRACTIONS = [0.5, 0.75, 1.0, 1.5, 2.0]
_FRACTIONS_SHORT = [0.5, 1.0, 2.0]


def _grid_values(spec: ParamSpec, short: bool) -> list[float]:
    if spec.key == "stop_loss_pct":
        return [0, 5, 10] if not short else [0, 5]
    fractions = _FRACTIONS_SHORT if short else _FRACTIONS
    values = []
    for f in fractions:
        v = max(spec.min, min(spec.max, spec.default * f))
        v = int(round(v)) if spec.type == "int" else round(v, 2)
        if v not in values:
            values.append(v)
    return values


def _build_grid(preset: strategies.Preset) -> list[dict]:
    for short in (False, True):
        axes = {p.key: _grid_values(p, short) for p in preset.params}
        combos = [
            dict(zip(axes.keys(), vals))
            for vals in itertools.product(*axes.values())
        ]
        # 단기 기간 >= 장기 기간인 조합은 전략 의미가 없으므로 제외
        combos = [c for c in combos if not ("fast" in c and "slow" in c and c["fast"] >= c["slow"])]
        if len(combos) <= MAX_COMBOS:
            return combos
    return combos[:MAX_COMBOS]


def optimize(preset_id: str, df: pd.DataFrame, fee: float, slippage: float,
             capital: float, ppy: float) -> dict:
    preset = strategies.PRESETS[preset_id]
    combos = _build_grid(preset)

    rows = []
    for params in combos:
        dsl = StrategyDSL.model_validate(strategies.build_dsl(preset_id, params))
        signal = compiler.build_position(dsl, df)
        result = backtester.run(df, signal, fee, slippage, capital)
        full = metrics.compute(result, ppy)
        split = metrics.compute_split(result, ppy)
        row = {
            "params": params,
            "total_return_pct": full["total_return_pct"],
            "sharpe": full["sharpe"],
            "mdd_pct": full["mdd_pct"],
            "num_trades": full["num_trades"],
        }
        if split.get("available"):
            row["is_sharpe"] = split["in_sample"]["sharpe"]
            row["is_return_pct"] = split["in_sample"]["return_pct"]
            row["oos_sharpe"] = split["out_of_sample"]["sharpe"]
            row["oos_return_pct"] = split["out_of_sample"]["return_pct"]
            row["overfit_risk"] = split["overfit_risk"]
        else:
            row["is_sharpe"] = full["sharpe"]
            row["is_return_pct"] = full["total_return_pct"]
            row["oos_sharpe"] = None
            row["oos_return_pct"] = None
            row["overfit_risk"] = "medium"
        rows.append(row)

    # 학습(IS) 구간 샤프 기준 정렬 — 검증(OOS) 구간은 순위에 쓰지 않고 보여주기만 한다
    rows.sort(key=lambda r: (r["is_sharpe"] is not None, r["is_sharpe"]), reverse=True)

    return {
        "strategy": preset.meta(),
        "evaluated": len(rows),
        "note": "순위는 학습 구간(IS) 샤프 기준입니다. 검증 구간(OOS) 성과가 무너지는 조합은 과적합을 의심하세요.",
        "results": rows[:TOP_N],
    }
