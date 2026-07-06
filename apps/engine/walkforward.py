"""워크포워드 분석 (앵커드/확장 방식).

70/30 고정 분할보다 엄밀한 과적합 검증:
전체 기간을 (n_folds+1)등분하고, 폴드 i마다
  학습 [0, (i+1)L) 에서 그리드 서치로 최적 파라미터를 찾아
  검증 [(i+1)L, (i+2)L) 에 적용한다.
검증 구간들을 이어붙인 성과가 "그때그때 최적화하며 운용했다면"의 근사치다.

시그널은 검증 끝까지의 데이터로 계산한 뒤 검증 구간만 슬라이스한다
(지표 웜업 확보 — 검증 구간 시작부터 지표가 유효).
"""

import numpy as np
import pandas as pd

import backtester
import strategies
import optimizer
from dsl import compiler
from dsl.schema import StrategyDSL

MIN_SEGMENT = 40  # 폴드(검증 구간)당 최소 봉 수


def _seg_metrics(returns: pd.Series, ppy: float) -> dict:
    eq = (1 + returns).cumprod()
    mdd = float((eq / eq.cummax() - 1).min())
    sharpe = float(returns.mean() / returns.std() * np.sqrt(ppy)) if returns.std() > 0 else 0.0
    return {
        "return_pct": round(float(eq.iloc[-1] - 1) * 100, 2),
        "sharpe": round(sharpe, 2),
        "mdd_pct": round(mdd * 100, 2),
    }


def _verdict(positive_folds: int, n_folds: int, oos_sharpe: float) -> str:
    if positive_folds == n_folds and oos_sharpe > 0.5:
        return "모든 검증 구간에서 수익 — 시기에 따라 파라미터를 갱신해도 일관된 성과를 냈습니다."
    if positive_folds * 2 >= n_folds:
        return f"{n_folds}개 구간 중 {positive_folds}개에서 수익 — 시기에 따라 성과 편차가 있습니다."
    return f"{n_folds}개 구간 중 {positive_folds}개만 수익 — 최적화된 파라미터가 미래 구간에서 잘 통하지 않았습니다. 과적합 가능성이 큽니다."


def run(preset_id: str, df: pd.DataFrame, fee: float, slippage: float,
        capital: float, ppy: float, n_folds: int = 4,
        grid: dict[str, list[float]] | None = None) -> dict:
    n = len(df)
    seg_len = n // (n_folds + 1)
    if seg_len < MIN_SEGMENT:
        raise ValueError(
            f"기간이 짧습니다: 폴드당 {seg_len}봉 (최소 {MIN_SEGMENT}봉). "
            "기간을 늘리거나 폴드 수를 줄여 주세요."
        )

    preset = strategies.PRESETS[preset_id]
    combos = optimizer.build_grid(preset, grid, prefer_short=True)

    folds = []
    oos_parts: list[pd.Series] = []

    for i in range(n_folds):
        train_end = (i + 1) * seg_len
        test_end = n if i == n_folds - 1 else (i + 2) * seg_len  # 마지막 폴드는 남는 봉 포함
        train_df = df.iloc[:train_end]

        # 학습 구간에서 IS 샤프가 가장 높은 조합 선택
        best_params, best_sharpe = None, -np.inf
        for params in combos:
            dsl = StrategyDSL.model_validate(strategies.build_dsl(preset_id, params))
            signal = compiler.build_position(dsl, train_df)
            ret = backtester.run(train_df, signal, fee, slippage, capital)["returns"]
            sharpe = float(ret.mean() / ret.std() * np.sqrt(ppy)) if ret.std() > 0 else 0.0
            if sharpe > best_sharpe:
                best_params, best_sharpe = params, sharpe

        # 검증: 검증 끝까지 시그널 계산 후 검증 구간 수익률만 평가
        dsl = StrategyDSL.model_validate(strategies.build_dsl(preset_id, best_params))
        full_df = df.iloc[:test_end]
        signal = compiler.build_position(dsl, full_df)
        returns = backtester.run(full_df, signal, fee, slippage, capital)["returns"]
        test_ret = returns.iloc[train_end:test_end]
        oos_parts.append(test_ret)

        folds.append({
            "fold": i + 1,
            "train_start": df.index[0].isoformat(),
            "train_end": df.index[train_end - 1].isoformat(),
            "test_start": df.index[train_end].isoformat(),
            "test_end": df.index[test_end - 1].isoformat(),
            "best_params": best_params,
            "is_sharpe": round(best_sharpe, 2),
            "oos": _seg_metrics(test_ret, ppy),
        })

    oos_returns = pd.concat(oos_parts)
    oos_equity = (1 + oos_returns).cumprod() * capital
    overall = _seg_metrics(oos_returns, ppy)
    positive = sum(1 for f in folds if f["oos"]["return_pct"] > 0)

    return {
        "strategy": preset.meta(),
        "n_folds": n_folds,
        "folds": folds,
        "oos": {
            **overall,
            "positive_folds": positive,
            "verdict": _verdict(positive, n_folds, overall["sharpe"]),
        },
        "series": {
            "time": [t.isoformat() for t in oos_returns.index],
            "equity": [round(float(v), 2) for v in oos_equity.to_numpy()],
        },
        "note": "각 폴드마다 학습 구간에서 최적 파라미터를 찾아 그 다음(미래) 구간에 적용한 결과입니다. 실제 운용에 가장 가까운 검증 방식입니다.",
    }
