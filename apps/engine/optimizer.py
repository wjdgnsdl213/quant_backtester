"""프리셋 파라미터 그리드 서치.

과적합 방지가 설계의 중심:
- 파라미터는 In-Sample(앞 70%) 성과로 순위를 매기고, Out-of-Sample(뒤 30%) 성과를
  나란히 보여준다. OOS를 정렬 기준으로 쓰면 검증 구간까지 오염되므로 쓰지 않는다.
- 각 조합마다 과적합 판정(overfit_risk)을 함께 반환한다.

그리드는 자동 생성(기본값 배수) 또는 고급 모드의 커스텀 지정(파라미터별 값 목록)을 지원한다.
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
MAX_VALUES_PER_PARAM = 10
TOP_N = 20

_FRACTIONS = [0.5, 0.75, 1.0, 1.5, 2.0]
_FRACTIONS_SHORT = [0.5, 1.0, 2.0]

SORT_KEYS = {
    "is_sharpe": "학습 구간(IS) 샤프",
    "is_return_pct": "학습 구간(IS) 수익률",
    "total_return_pct": "전체 수익률",
    "mdd_pct": "최대 낙폭(MDD, 얕은 순)",
}


def _clamp(spec: ParamSpec, v: float):
    v = max(spec.min, min(spec.max, float(v)))
    return int(round(v)) if spec.type == "int" else round(v, 4)


def _grid_values(spec: ParamSpec, short: bool) -> list[float]:
    if spec.key == "stop_loss_pct":
        return [0, 5, 10] if not short else [0, 5]
    fractions = _FRACTIONS_SHORT if short else _FRACTIONS
    values = []
    for f in fractions:
        v = _clamp(spec, spec.default * f)
        if v not in values:
            values.append(v)
    return values


def _combos_from_axes(axes: dict[str, list[float]]) -> list[dict]:
    combos = [dict(zip(axes.keys(), vals)) for vals in itertools.product(*axes.values())]
    # 단기 기간 >= 장기 기간인 조합은 전략 의미가 없으므로 제외
    return [c for c in combos if not ("fast" in c and "slow" in c and c["fast"] >= c["slow"])]


def auto_grid(preset: strategies.Preset, prefer_short: bool = False) -> list[dict]:
    order = (True,) if prefer_short else (False, True)
    combos = []
    for short in order:
        axes = {p.key: _grid_values(p, short) for p in preset.params}
        combos = _combos_from_axes(axes)
        if len(combos) <= MAX_COMBOS:
            return combos
    return combos[:MAX_COMBOS]


def custom_grid(preset: strategies.Preset, grid: dict[str, list[float]]) -> list[dict]:
    """고급 모드: 파라미터별 값 목록을 직접 지정. 문제가 있으면 조용히 고치지 않고 에러를 낸다."""
    specs = {p.key: p for p in preset.params}
    unknown = set(grid) - set(specs)
    if unknown:
        raise ValueError(f"알 수 없는 파라미터: {sorted(unknown)} (사용 가능: {sorted(specs)})")

    axes: dict[str, list[float]] = {}
    for key, spec in specs.items():
        values = grid.get(key)
        if not values:
            axes[key] = [spec.default]
            continue
        if len(values) > MAX_VALUES_PER_PARAM:
            raise ValueError(f"'{key}' 값이 {len(values)}개입니다 (파라미터당 최대 {MAX_VALUES_PER_PARAM}개)")
        clamped = []
        for v in values:
            cv = _clamp(spec, v)
            if cv not in clamped:
                clamped.append(cv)
        axes[key] = clamped

    combos = _combos_from_axes(axes)
    if not combos:
        raise ValueError("유효한 조합이 없습니다 (단기 기간 < 장기 기간인지 확인해 주세요)")
    if len(combos) > MAX_COMBOS:
        raise ValueError(f"조합이 {len(combos)}개입니다 (최대 {MAX_COMBOS}개). 값 개수를 줄여 주세요.")
    return combos


def build_grid(preset: strategies.Preset, grid: dict[str, list[float]] | None,
               prefer_short: bool = False) -> list[dict]:
    if grid:
        return custom_grid(preset, grid)
    return auto_grid(preset, prefer_short)


def evaluate(preset_id: str, params: dict, df: pd.DataFrame, fee: float,
             slippage: float, capital: float, ppy: float) -> dict:
    """조합 하나를 백테스트해 전체/IS/OOS 지표 행으로 만든다."""
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
    return row


def optimize(preset_id: str, df: pd.DataFrame, fee: float, slippage: float,
             capital: float, ppy: float, grid: dict[str, list[float]] | None = None,
             sort_by: str = "is_sharpe") -> dict:
    if sort_by not in SORT_KEYS:
        raise ValueError(f"알 수 없는 정렬 기준: {sort_by} (사용 가능: {sorted(SORT_KEYS)})")

    preset = strategies.PRESETS[preset_id]
    combos = build_grid(preset, grid)
    rows = [evaluate(preset_id, params, df, fee, slippage, capital, ppy) for params in combos]

    # mdd_pct는 음수이므로 내림차순 정렬이 곧 '얕은 낙폭 우선'이다
    rows.sort(key=lambda r: (r[sort_by] is not None, r[sort_by] or 0), reverse=True)

    return {
        "strategy": preset.meta(),
        "evaluated": len(rows),
        "sort_by": sort_by,
        "note": f"순위는 {SORT_KEYS[sort_by]} 기준입니다. 검증 구간(OOS) 성과가 무너지는 조합은 과적합을 의심하세요.",
        "results": rows[:TOP_N],
    }
