"""합성 OHLCV 픽스처 — 네트워크·캐시에 의존하지 않는 결정적 데이터."""

import numpy as np
import pandas as pd
import pytest


def make_df(closes, opens=None) -> pd.DataFrame:
    """종가 배열로 OHLCV 프레임 생성. 시가는 기본적으로 전일 종가(갭 없음)."""
    closes = np.asarray(closes, dtype=float)
    if opens is None:
        opens = np.concatenate([[closes[0]], closes[:-1]])
    else:
        opens = np.asarray(opens, dtype=float)
    highs = np.maximum(opens, closes) * 1.001
    lows = np.minimum(opens, closes) * 0.999
    idx = pd.date_range("2023-01-02", periods=len(closes), freq="D")
    df = pd.DataFrame(
        {
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": np.full(len(closes), 1_000.0),
        },
        index=idx,
    )
    df.index.name = "time"
    return df


@pytest.fixture
def flat_df() -> pd.DataFrame:
    """가격 변화 없음 — 비용 계산 검증용."""
    return make_df([100.0] * 30)


@pytest.fixture
def ramp_df() -> pd.DataFrame:
    """일정 상승 (100 → 159)."""
    return make_df(100 + np.arange(60, dtype=float))


@pytest.fixture
def sine_df() -> pd.DataFrame:
    """진동 시세 (주기 ~20봉, 400봉) — 교차가 여러 번 발생."""
    t = np.arange(400)
    closes = 100 + 10 * np.sin(2 * np.pi * t / 20) + t * 0.01
    return make_df(closes)


@pytest.fixture
def noise_df() -> pd.DataFrame:
    """시드 고정 랜덤워크 (120봉) — 지표 일반 검증용."""
    rng = np.random.default_rng(7)
    closes = 100 * np.cumprod(1 + rng.normal(0, 0.01, 120))
    return make_df(closes)
