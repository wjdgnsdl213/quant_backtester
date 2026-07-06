"""dsl.indicators — 값 정확성과 '미래 참조 없음' 성질 검증."""

import numpy as np
import pytest

from dsl import indicators
from tests.conftest import make_df


class TestValues:
    def test_sma_hand_computed(self):
        df = make_df([1, 2, 3, 4, 5])
        sma = indicators.compute("sma", df, {"period": 3})
        assert np.isnan(sma.iloc[0]) and np.isnan(sma.iloc[1])
        assert sma.iloc[2] == pytest.approx(2.0)
        assert sma.iloc[3] == pytest.approx(3.0)
        assert sma.iloc[4] == pytest.approx(4.0)

    def test_rsi_bounds(self, noise_df):
        rsi = indicators.compute("rsi", noise_df, {"period": 14}).dropna()
        assert len(rsi) > 0
        assert ((rsi >= 0) & (rsi <= 100)).all()

    def test_rsi_extremes(self):
        up = make_df(list(range(100, 140)))  # 하락이 전혀 없으면 RSI=100
        rsi = indicators.compute("rsi", up, {"period": 14}).dropna()
        assert rsi.iloc[-1] == pytest.approx(100.0)

    def test_highest_lowest_channels(self, noise_df):
        hi = indicators.compute("highest", noise_df, {"period": 10}).dropna()
        lo = indicators.compute("lowest", noise_df, {"period": 10}).dropna()
        assert (hi.to_numpy() >= lo.reindex(hi.index).to_numpy()).all()

    def test_default_params_filled(self, noise_df):
        # params 비워도 스키마 기본값으로 계산되어야 한다
        sma = indicators.compute("sma", noise_df, {})
        assert not np.isnan(sma.iloc[-1])


class TestNoLookahead:
    """모든 등록 지표: 데이터를 뒤에서 잘라내도 앞부분 값이 변하면 안 된다.

    미래 봉이 계산에 섞이는 지표(center rolling, 음수 shift 등)는
    잘린 시점 근처의 값이 달라지므로 이 테스트가 잡아낸다.
    """

    @pytest.mark.parametrize("ind_id", list(indicators.SPECS.keys()))
    def test_truncation_consistency(self, ind_id, noise_df):
        k = 80
        full = indicators.compute(ind_id, noise_df, {})
        part = indicators.compute(ind_id, noise_df.iloc[:k], {})
        np.testing.assert_allclose(
            full.iloc[:k].to_numpy(),
            part.to_numpy(),
            rtol=1e-9,
            atol=1e-12,
            equal_nan=True,
            err_msg=f"지표 '{ind_id}'가 미래 데이터를 참조합니다",
        )
