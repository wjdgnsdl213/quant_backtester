"""optimizer — 그리드 생성/검증과 정렬."""

import pytest

import optimizer
import strategies

SMA = strategies.PRESETS["sma_cross"]


class TestCustomGrid:
    def test_unknown_key_rejected(self):
        with pytest.raises(ValueError, match="알 수 없는 파라미터"):
            optimizer.custom_grid(SMA, {"nope": [1, 2]})

    def test_too_many_values_rejected(self):
        with pytest.raises(ValueError, match="최대"):
            optimizer.custom_grid(SMA, {"fast": list(range(2, 13))})

    def test_combo_explosion_rejected(self):
        with pytest.raises(ValueError, match="조합"):
            optimizer.custom_grid(SMA, {
                "fast": list(range(2, 12)),
                "slow": list(range(20, 120, 10)),
                "stop_loss_pct": list(range(0, 10)),
            })

    def test_all_invalid_combos_rejected(self):
        with pytest.raises(ValueError, match="유효한 조합"):
            optimizer.custom_grid(SMA, {"fast": [100], "slow": [50]})

    def test_values_clamped_and_missing_filled_with_default(self):
        combos = optimizer.custom_grid(SMA, {"fast": [1, 10]})  # fast min=2 → 1은 2로 클램프
        fasts = {c["fast"] for c in combos}
        assert fasts == {2, 10}
        assert all(c["slow"] == 60 for c in combos)  # 기본값으로 채움


class TestAutoGrid:
    def test_respects_max_combos(self):
        for preset in strategies.PRESETS.values():
            assert len(optimizer.auto_grid(preset)) <= optimizer.MAX_COMBOS

    def test_fast_always_less_than_slow(self):
        for c in optimizer.auto_grid(SMA):
            assert c["fast"] < c["slow"]


class TestOptimize:
    def test_sorted_by_requested_key(self, sine_df):
        out = optimizer.optimize(
            "sma_cross", sine_df, 0.001, 0.0005, 1_000_000, 252,
            grid={"fast": [3, 5, 8], "slow": [15, 25]},
            sort_by="total_return_pct",
        )
        values = [r["total_return_pct"] for r in out["results"]]
        assert values == sorted(values, reverse=True)
        assert out["evaluated"] == 6

    def test_unknown_sort_key_rejected(self, sine_df):
        with pytest.raises(ValueError, match="정렬 기준"):
            optimizer.optimize("sma_cross", sine_df, 0.001, 0.0005, 1_000_000, 252,
                               sort_by="oos_sharpe")
