"""성과 지표 계산.

compute()       — 전체 기간 지표
compute_split() — 기간을 In-Sample/Out-of-Sample로 나눠 각각 지표를 내고
                  과적합 위험 신호를 판정한다. AI로 전략을 쉽게 찍어낼수록
                  과적합도 쉬워지므로, 이 분할 지표가 서비스 신뢰의 핵심이다.
"""

import numpy as np
import pandas as pd

SPLIT_RATIO = 0.7  # 앞 70% In-Sample, 뒤 30% Out-of-Sample


def compute(result: dict, periods_per_year: float) -> dict:
    returns: pd.Series = result["returns"]
    equity: pd.Series = result["equity"]
    bench: pd.Series = result["benchmark"]
    drawdown: pd.Series = result["drawdown"]
    trades: list[dict] = result["trades"]

    n = len(returns)
    years = n / periods_per_year if periods_per_year else 1

    total_return = float(equity.iloc[-1] / equity.iloc[0] - 1)
    bench_return = float(bench.iloc[-1] / bench.iloc[0] - 1)
    cagr = float((1 + total_return) ** (1 / years) - 1) if years > 0 and total_return > -1 else 0.0

    vol = float(returns.std() * np.sqrt(periods_per_year))
    sharpe = float(returns.mean() / returns.std() * np.sqrt(periods_per_year)) if returns.std() > 0 else 0.0
    downside = returns[returns < 0]
    sortino = float(returns.mean() / downside.std() * np.sqrt(periods_per_year)) if len(downside) > 1 and downside.std() > 0 else 0.0

    closed = [t for t in trades if t["exit_time"] is not None]
    wins = [t for t in closed if t["return_pct"] > 0]
    losses = [t for t in closed if t["return_pct"] <= 0]
    gross_profit = sum(t["return_pct"] for t in wins)
    gross_loss = abs(sum(t["return_pct"] for t in losses))

    return {
        "total_return_pct": round(total_return * 100, 2),
        "benchmark_return_pct": round(bench_return * 100, 2),
        "cagr_pct": round(cagr * 100, 2),
        "sharpe": round(sharpe, 2),
        "sortino": round(sortino, 2),
        "volatility_pct": round(vol * 100, 2),
        "mdd_pct": round(float(drawdown.min()) * 100, 2),
        "num_trades": len(closed),
        "win_rate_pct": round(len(wins) / len(closed) * 100, 1) if closed else 0.0,
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else None,
        "avg_trade_pct": round(sum(t["return_pct"] for t in closed) / len(closed), 3) if closed else 0.0,
        "exposure_pct": round(float(result["position"].mean()) * 100, 1),
    }


def compute_split(result: dict, periods_per_year: float) -> dict:
    """IS/OOS 분할 지표 + 과적합 위험 판정."""
    returns: pd.Series = result["returns"]
    n = len(returns)
    k = int(n * SPLIT_RATIO)
    if k < 20 or n - k < 20:  # 구간이 너무 짧으면 판정 불가
        return {"available": False}

    is_m = _segment(result, 0, k, periods_per_year)
    oos_m = _segment(result, k, n, periods_per_year)

    verdict, reason = _overfit_verdict(is_m, oos_m)
    return {
        "available": True,
        "split_date": returns.index[k].isoformat(),
        "in_sample": is_m,
        "out_of_sample": oos_m,
        "overfit_risk": verdict,   # "low" | "medium" | "high"
        "overfit_reason": reason,
    }


def _segment(result: dict, i: int, j: int, ppy: float) -> dict:
    ret = result["returns"].iloc[i:j]
    eq = (1 + ret).cumprod()
    peak = eq.cummax()
    mdd = float((eq / peak - 1).min())
    total = float(eq.iloc[-1] - 1)
    sharpe = float(ret.mean() / ret.std() * np.sqrt(ppy)) if ret.std() > 0 else 0.0

    lo, hi = ret.index[0], ret.index[-1]
    seg_trades = [
        t for t in result["trades"]
        if t["exit_time"] is not None and lo.isoformat() <= t["entry_time"] <= hi.isoformat()
    ]
    wins = [t for t in seg_trades if t["return_pct"] > 0]

    return {
        "return_pct": round(total * 100, 2),
        "sharpe": round(sharpe, 2),
        "mdd_pct": round(mdd * 100, 2),
        "num_trades": len(seg_trades),
        "win_rate_pct": round(len(wins) / len(seg_trades) * 100, 1) if seg_trades else 0.0,
    }


def _overfit_verdict(is_m: dict, oos_m: dict) -> tuple[str, str]:
    """단순하지만 정직한 휴리스틱. 판정 근거를 사람이 읽을 수 있는 문장으로 함께 반환."""
    if is_m["num_trades"] + oos_m["num_trades"] < 5:
        return "medium", "거래 횟수가 너무 적어 통계적으로 신뢰하기 어렵습니다."
    if is_m["sharpe"] > 0.5 and oos_m["return_pct"] < 0:
        return "high", "학습 구간(IS)에서는 수익이지만 검증 구간(OOS)에서 손실입니다. 과거에 맞춰진(과적합) 전략일 가능성이 큽니다."
    if is_m["sharpe"] > 0.5 and oos_m["sharpe"] < is_m["sharpe"] * 0.3:
        return "medium", "검증 구간(OOS) 성과가 학습 구간(IS) 대비 크게 낮습니다. 파라미터가 과거에 과도하게 맞춰졌을 수 있습니다."
    if is_m["sharpe"] <= 0 and oos_m["sharpe"] <= 0:
        return "low", "두 구간 모두 성과가 저조합니다. 과적합보다는 전략 자체의 수익성이 문제입니다."
    return "low", "학습 구간과 검증 구간의 성과가 비교적 일관됩니다."


def periods_per_year(source: str, interval: str) -> float:
    """연환산 계수. 주식은 거래일 기준, 크립토는 연중무휴 기준."""
    if source == "crypto":
        return {"1d": 365, "1h": 24 * 365, "4h": 6 * 365, "1wk": 52}[interval]
    return {"1d": 252, "1h": 6.5 * 252, "4h": 2 * 252, "1wk": 52}[interval]
