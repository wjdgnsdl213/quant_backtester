"""몬테카를로 시뮬레이션 — 거래 수익률 부트스트랩.

청산된 거래들의 수익률을 복원추출로 재배열해 수천 개의 가상 자산 경로를 만든다.
"백테스트 수익이 특정 거래 순서(운)에 기댄 것인지"를 신뢰구간으로 보여주는 게 목적.

한계: 거래 간 독립을 가정하므로 수익률의 자기상관(연속 손실 군집 등)은 반영하지 못한다.
전체 시뮬레이션은 (n_sims × n_trades) 행렬 한 번의 numpy 연산으로 처리한다.
"""

import numpy as np

MIN_TRADES = 10
_PCTS = [5, 25, 50, 75, 95]


def run(trades: list[dict], n_sims: int, capital: float) -> dict:
    returns = np.array([
        t["return_pct"] / 100 for t in trades if t["exit_time"] is not None
    ])
    n = len(returns)
    if n < MIN_TRADES:
        raise ValueError(
            f"청산된 거래가 {n}건뿐입니다 (최소 {MIN_TRADES}건). "
            "기간을 늘리거나 거래가 더 잦은 전략으로 시도해 주세요."
        )

    rng = np.random.default_rng(42)  # 결정적 — 같은 요청은 같은 결과
    samples = rng.choice(returns, size=(n_sims, n), replace=True)
    paths = np.cumprod(1 + samples, axis=1)
    paths = np.hstack([np.ones((n_sims, 1)), paths]) * capital  # 0번 스텝 = 초기 자본

    envelope = {"step": list(range(n + 1))}
    for p in _PCTS:
        envelope[f"p{p}"] = [round(float(v), 2) for v in np.percentile(paths, p, axis=0)]

    finals = paths[:, -1] / capital - 1
    peaks = np.maximum.accumulate(paths, axis=1)
    mdds = (paths / peaks - 1).min(axis=1)

    stats = {
        **{f"final_p{p}": round(float(np.percentile(finals, p)) * 100, 2) for p in _PCTS},
        "prob_loss": round(float((finals < 0).mean()) * 100, 1),
        "mdd_p95": round(float(np.percentile(mdds, 5)) * 100, 2),  # 최악 5% 경로의 MDD
    }

    return {
        "n_sims": n_sims,
        "n_trades": n,
        "envelope": envelope,
        "stats": stats,
        "note": (
            f"청산된 거래 {n}건의 수익률을 {n_sims}번 재배열한 분포입니다. "
            "거래 간 독립을 가정하므로 연속 손실 군집 같은 자기상관은 반영되지 않습니다."
        ),
    }
