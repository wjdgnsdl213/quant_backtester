"""시세 데이터 로더.

source="crypto" → ccxt 바이낸스 현물 (BTC/USDT 형식) — 기본
source="stock"  → yfinance (미국: AAPL, 한국: 005930.KS 형식)

캐시는 종목당 파일 하나(source_symbol_interval.csv)로 그 종목이 지금까지 받아온
최대 범위를 유지한다. 요청 구간이 캐시 범위 안에 완전히 들어오면 파일을 그대로
슬라이스해 반환하고, 벗어난 부분(과거 확장/최신 확장)만 증분으로 받아 병합한다 —
"어제까지 캐시해둔 종목의 오늘 하루치"를 요청해도 전체를 재다운로드하지 않는다.

구 버전(파일명에 start_end가 들어가던 방식)의 캐시 파일은 더 이상 사용되지 않으며
그대로 두어도 무해하다 (안 쓰일 뿐 삭제할 필요는 없음).
"""

import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)

COLUMNS = ["open", "high", "low", "close", "volume"]

# 인터벌 표기 통일: API 입력 → (yfinance, ccxt)
INTERVALS = {
    "1d": ("1d", "1d"),
    "1h": ("1h", "1h"),
    "4h": (None, "4h"),  # yfinance는 4h 미지원
    "1wk": ("1wk", "1w"),
}


def _cache_path(source: str, symbol: str, interval: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", f"{source}_{symbol}_{interval}")
    return CACHE_DIR / f"{safe}.csv"


def _read_cache(path: Path) -> pd.DataFrame | None:
    if not path.exists():
        return None
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    return df if not df.empty else None


def _write_cache(path: Path, df: pd.DataFrame) -> None:
    df.sort_index().to_csv(path)


def _fetch(source: str, symbol: str, interval: str, start: str, end: str) -> pd.DataFrame:
    if source == "stock":
        return _load_stock(symbol, interval, start, end)
    if source == "crypto":
        return _load_crypto(symbol, interval, start, end)
    raise ValueError(f"지원하지 않는 소스: {source}")


def load_ohlcv(source: str, symbol: str, interval: str, start: str, end: str) -> pd.DataFrame:
    if interval not in INTERVALS:
        raise ValueError(f"지원하지 않는 인터벌: {interval}")

    req_start, req_end = pd.Timestamp(start), pd.Timestamp(end)
    path = _cache_path(source, symbol, interval)
    cached = _read_cache(path)

    if cached is None:
        df = _fetch(source, symbol, interval, start, end)
        if df.empty:
            raise ValueError(f"데이터가 없습니다: {source}/{symbol} ({start}~{end})")
        _write_cache(path, df)
        return df.loc[req_start:req_end]

    cache_min, cache_max = cached.index.min(), cached.index.max()

    if req_start >= cache_min and req_end <= cache_max:
        sliced = cached.loc[req_start:req_end]
        if not sliced.empty:
            return sliced
        # 캐시 범위 안이지만 비어있으면(휴장일 등) 아래 병합 경로로 폴백

    new_parts = [cached]
    if req_start < cache_min:
        gap_end = (cache_min - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        fetched = _fetch(source, symbol, interval, start, gap_end)
        if not fetched.empty:
            new_parts.append(fetched)
    if req_end > cache_max:
        gap_start = (cache_max + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        fetched = _fetch(source, symbol, interval, gap_start, end)
        if not fetched.empty:
            new_parts.append(fetched)

    merged = pd.concat(new_parts)
    merged = merged[~merged.index.duplicated(keep="last")].sort_index()
    _write_cache(path, merged)

    sliced = merged.loc[req_start:req_end]
    if sliced.empty:
        raise ValueError(f"데이터가 없습니다: {source}/{symbol} ({start}~{end})")
    return sliced


def _load_stock(symbol: str, interval: str, start: str, end: str) -> pd.DataFrame:
    import yfinance as yf

    yf_interval = INTERVALS[interval][0]
    if yf_interval is None:
        raise ValueError(f"주식은 {interval} 인터벌을 지원하지 않습니다")

    df = yf.download(symbol, start=start, end=end, interval=yf_interval,
                     auto_adjust=True, progress=False)
    if df is None or df.empty:
        return pd.DataFrame(columns=COLUMNS)

    # yfinance는 멀티인덱스 컬럼(가격, 티커)을 반환할 수 있다
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.rename(columns=str.lower)[COLUMNS]
    df.index = pd.to_datetime(df.index).tz_localize(None)
    df.index.name = "time"
    return df.dropna()


def _load_crypto(symbol: str, interval: str, start: str, end: str) -> pd.DataFrame:
    import ccxt

    exchange = ccxt.binance({"enableRateLimit": True})
    timeframe = INTERVALS[interval][1]
    since = int(datetime.fromisoformat(start).replace(tzinfo=timezone.utc).timestamp() * 1000)
    end_ms = int((datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
                  + timedelta(days=1)).timestamp() * 1000)

    rows = []
    while since < end_ms:
        batch = exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=since, limit=1000)
        if not batch:
            break
        rows.extend(batch)
        since = batch[-1][0] + 1
        if len(batch) < 1000:
            break
        time.sleep(exchange.rateLimit / 1000)

    if not rows:
        return pd.DataFrame(columns=COLUMNS)

    df = pd.DataFrame(rows, columns=["time", *COLUMNS])
    df["time"] = pd.to_datetime(df["time"], unit="ms")
    df = df.set_index("time")
    df = df[df.index < pd.to_datetime(end) + pd.Timedelta(days=1)]
    return df[~df.index.duplicated(keep="first")].dropna()
