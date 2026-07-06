"""data.loader — 증분 캐시 로직 (네트워크 없이 monkeypatch로 검증).

핵심 주장: 요청 구간이 캐시 범위 안이면 재요청 없음, 범위를 벗어나면
벗어난 만큼(gap)만 요청한다 — 항상 전체 재다운로드하지 않는다.
"""

import pandas as pd
import pytest

from data import loader


@pytest.fixture(autouse=True)
def temp_cache_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(loader, "CACHE_DIR", tmp_path)


def _range_df(start: str, end: str) -> pd.DataFrame:
    idx = pd.date_range(start, end, freq="D")
    return pd.DataFrame(
        {"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0, "volume": 1000.0},
        index=idx,
    )


def _fake_fetch(calls: list):
    def fetch(source, symbol, interval, start, end):
        calls.append((start, end))
        return _range_df(start, end)

    return fetch


def test_first_fetch_downloads_full_range(monkeypatch):
    calls = []
    monkeypatch.setattr(loader, "_fetch", _fake_fetch(calls))

    df = loader.load_ohlcv("stock", "TEST", "1d", "2023-01-01", "2023-01-10")
    assert len(calls) == 1
    assert not df.empty


def test_subrange_within_cache_skips_fetch(monkeypatch):
    calls = []
    monkeypatch.setattr(loader, "_fetch", _fake_fetch(calls))

    loader.load_ohlcv("stock", "TEST", "1d", "2023-01-01", "2023-01-31")
    calls.clear()

    df = loader.load_ohlcv("stock", "TEST", "1d", "2023-01-10", "2023-01-20")
    assert len(calls) == 0  # 캐시 범위 안 → 재요청 없음
    assert df.index.min() >= pd.Timestamp("2023-01-10")
    assert df.index.max() <= pd.Timestamp("2023-01-20")


def test_extending_end_fetches_only_gap(monkeypatch):
    calls = []
    monkeypatch.setattr(loader, "_fetch", _fake_fetch(calls))

    loader.load_ohlcv("stock", "TEST", "1d", "2023-01-01", "2023-01-10")
    calls.clear()

    df = loader.load_ohlcv("stock", "TEST", "1d", "2023-01-01", "2023-01-20")
    assert len(calls) == 1
    fetched_start = pd.Timestamp(calls[0][0])
    assert fetched_start > pd.Timestamp("2023-01-10")  # 기존 캐시 이후만 요청
    assert df.index.max() >= pd.Timestamp("2023-01-20")


def test_extending_start_fetches_only_gap(monkeypatch):
    calls = []
    monkeypatch.setattr(loader, "_fetch", _fake_fetch(calls))

    loader.load_ohlcv("stock", "TEST", "1d", "2023-01-10", "2023-01-20")
    calls.clear()

    df = loader.load_ohlcv("stock", "TEST", "1d", "2023-01-01", "2023-01-20")
    assert len(calls) == 1
    fetched_end = pd.Timestamp(calls[0][1])
    assert fetched_end < pd.Timestamp("2023-01-10")  # 기존 캐시 이전만 요청
    assert df.index.min() <= pd.Timestamp("2023-01-01")


def test_extending_both_directions_fetches_two_gaps(monkeypatch):
    calls = []
    monkeypatch.setattr(loader, "_fetch", _fake_fetch(calls))

    loader.load_ohlcv("stock", "TEST", "1d", "2023-01-10", "2023-01-15")
    calls.clear()

    df = loader.load_ohlcv("stock", "TEST", "1d", "2023-01-01", "2023-01-25")
    assert len(calls) == 2
    assert df.index.min() <= pd.Timestamp("2023-01-01")
    assert df.index.max() >= pd.Timestamp("2023-01-25")


def test_unsupported_interval_raises():
    with pytest.raises(ValueError):
        loader.load_ohlcv("stock", "TEST", "5m", "2023-01-01", "2023-01-10")


def test_no_data_raises(monkeypatch):
    monkeypatch.setattr(
        loader, "_fetch",
        lambda source, symbol, interval, start, end: pd.DataFrame(columns=loader.COLUMNS),
    )
    with pytest.raises(ValueError, match="데이터가 없습니다"):
        loader.load_ohlcv("stock", "NODATA", "1d", "2023-01-01", "2023-01-10")
