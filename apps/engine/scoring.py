"""전략 신뢰 점수 — 검증 도구들을 하나의 A~F 등급으로 종합.

"수익률 300%"가 아니라 "이 전략을 얼마나 믿을 수 있는가"를 말하는 게 목적.
4개 컴포넌트를 각각 0~100점으로 환산해 가중 평균한다:

  is_oos       IS/OOS 과적합 판정 (metrics.compute_split 재사용)
  consistency  구간 일관성 — 전체 기간을 4등분해 사용자가 고른 파라미터
               그대로 각 구간 성과를 본다. 워크포워드와 달리 재최적화하지
               않으므로 "지금 이 전략"을 평가하고, 커스텀 DSL에도 동일 적용.
  montecarlo   거래 재배열 시뮬레이션의 손실 확률·최악 MDD (montecarlo 재사용)
  trades       거래 수 충분성 — 표본이 적으면 위 판정 전부가 흔들린다

거래가 MIN_TRADES(10건) 미만이면 다른 점수와 무관하게 등급 상한 C.
점수 공식은 단순·결정적으로 유지한다 — 근거를 사람이 읽고 검증할 수 있어야
신뢰 점수라는 이름값을 한다.
"""

import numpy as np
import pandas as pd

import montecarlo
from walkforward import _seg_metrics

N_SEGMENTS = 4
TRADES_FULL_SCORE = 30   # 청산 거래가 이 이상이면 거래 수 컴포넌트 만점
GRADE_STEPS = [(80, "A"), (65, "B"), (50, "C"), (35, "D")]
TRADE_CAP_GRADE = "C"    # 거래 부족 시 등급 상한

WEIGHTS = {"is_oos": 0.35, "consistency": 0.30, "montecarlo": 0.20, "trades": 0.15}

GRADE_LABEL = {
    "A": "여러 검증에서 일관되게 견고합니다",
    "B": "대체로 견고하나 일부 구간에서 흔들립니다",
    "C": "검증 결과가 엇갈립니다 — 실전 투입 전 보완이 필요합니다",
    "D": "과거 구간에 맞춰졌을 가능성이 큽니다",
    "F": "현재 형태로는 신뢰하기 어렵습니다",
}


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, v)))


def _grade(score: float) -> str:
    for cut, g in GRADE_STEPS:
        if score >= cut:
            return g
    return "F"


def _comp_is_oos(split: dict) -> dict:
    """IS/OOS 판정 → 점수. 판정 등급이 기본점, OOS 샤프가 가산점."""
    base = {"id": "is_oos", "label": "과적합 진단 (IS/OOS)", "weight": WEIGHTS["is_oos"]}
    if not split.get("available"):
        return {**base, "available": False, "score": None,
                "detail": "기간이 짧아 IS/OOS 분할 판정을 할 수 없습니다."}
    risk = split["overfit_risk"]
    oos_sharpe = split["out_of_sample"]["sharpe"]
    score = _clamp({"low": 70, "medium": 40, "high": 10}[risk]
                   + _clamp(oos_sharpe, 0, 1.5) / 1.5 * 30)
    return {**base, "available": True, "score": round(score, 1),
            "detail": f"판정 {risk} — {split['overfit_reason']} (OOS 샤프 {oos_sharpe})"}


def _comp_consistency(returns: pd.Series, ppy: float) -> dict:
    """전체 기간 4등분 — 수익 구간 비율이 기본점, 평균 샤프가 가산점."""
    base = {"id": "consistency", "label": "구간 일관성", "weight": WEIGHTS["consistency"]}
    n = len(returns)
    seg_len = n // N_SEGMENTS
    if seg_len < 20:
        return {**base, "available": False, "score": None,
                "detail": "기간이 짧아 구간 일관성을 평가할 수 없습니다."}
    segs = []
    for i in range(N_SEGMENTS):
        j = n if i == N_SEGMENTS - 1 else (i + 1) * seg_len
        segs.append(_seg_metrics(returns.iloc[i * seg_len:j], ppy))
    positive = sum(1 for s in segs if s["return_pct"] > 0)
    avg_sharpe = float(np.mean([s["sharpe"] for s in segs]))
    score = _clamp(positive / N_SEGMENTS * 70 + _clamp(avg_sharpe, 0, 1.5) / 1.5 * 30)
    return {**base, "available": True, "score": round(score, 1),
            "detail": f"{N_SEGMENTS}개 구간 중 {positive}개 수익 (구간 평균 샤프 {avg_sharpe:.2f})",
            "segments": segs}


def _comp_montecarlo(trades: list[dict], n_sims: int, capital: float) -> dict:
    """손실 확률(prob_loss)과 최악 5% 경로 MDD(mdd_p95)의 평균."""
    base = {"id": "montecarlo", "label": "몬테카를로", "weight": WEIGHTS["montecarlo"]}
    try:
        mc = montecarlo.run(trades, n_sims, capital)
    except ValueError as e:
        return {**base, "available": False, "score": None, "detail": str(e)}
    prob_loss = mc["stats"]["prob_loss"]        # 0~100 (%)
    mdd_p95 = mc["stats"]["mdd_p95"]            # 음수 %
    score = _clamp((_clamp(100 - 2.5 * prob_loss) + _clamp(100 + 2 * mdd_p95)) / 2)
    return {**base, "available": True, "score": round(score, 1),
            "detail": f"손실 확률 {prob_loss}%, 최악 5% 경로 MDD {mdd_p95}%"}


def _comp_trades(n_closed: int) -> dict:
    score = _clamp(n_closed / TRADES_FULL_SCORE * 100)
    detail = f"청산된 거래 {n_closed}건"
    if n_closed < montecarlo.MIN_TRADES:
        detail += f" — {montecarlo.MIN_TRADES}건 미만이라 통계적 신뢰가 부족합니다 (등급 상한 {TRADE_CAP_GRADE})"
    elif n_closed < TRADES_FULL_SCORE:
        detail += f" ({TRADES_FULL_SCORE}건 이상이면 만점)"
    return {"id": "trades", "label": "거래 표본", "weight": WEIGHTS["trades"],
            "available": True, "score": round(score, 1), "detail": detail}


def compute(result: dict, split: dict, ppy: float, capital: float,
            n_sims: int = 1000) -> dict:
    """백테스트 결과 → 신뢰 점수. result는 backtester.run 반환값."""
    n_closed = sum(1 for t in result["trades"] if t["exit_time"] is not None)

    components = [
        _comp_is_oos(split),
        _comp_consistency(result["returns"], ppy),
        _comp_montecarlo(result["trades"], n_sims, capital),
        _comp_trades(n_closed),
    ]

    available = [c for c in components if c["available"]]
    warnings = [c["detail"] for c in components if not c["available"]]

    total_w = sum(c["weight"] for c in available)
    score = sum(c["score"] * c["weight"] for c in available) / total_w if total_w else 0.0
    grade = _grade(score)

    # 거래 표본 부족 → 등급 상한 (좋은 등급일수록 표본이 뒷받침해야 한다)
    grades_order = ["F", "D", "C", "B", "A"]
    if n_closed < montecarlo.MIN_TRADES and grades_order.index(grade) > grades_order.index(TRADE_CAP_GRADE):
        warnings.append(
            f"청산 거래가 {n_closed}건뿐이라 등급을 {TRADE_CAP_GRADE}로 제한했습니다. "
            "기간을 늘리거나 거래가 더 잦은 전략으로 표본을 확보하세요."
        )
        grade = TRADE_CAP_GRADE

    return {
        "grade": grade,
        "grade_label": GRADE_LABEL[grade],
        "score": round(score, 1),
        "components": components,
        "warnings": warnings,
        "note": (
            "IS/OOS 과적합 진단 35% + 구간 일관성 30% + 몬테카를로 20% + 거래 표본 15%의 "
            "가중 평균입니다. 구간 일관성은 파라미터 재최적화 없이 현재 전략 그대로 "
            f"{N_SEGMENTS}개 구간 성과를 본 것으로, 높은 등급이 미래 수익을 보장하지 않습니다."
        ),
    }
