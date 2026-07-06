"""시세 데이터 로더.

source="crypto" → ccxt 바이낸스 현물 (BTC/USDT 형식) — 기본
source="stock"  → yfinance (미국: AAPL, 한국: 005930.KS 형식)

한 번 받은 데이터는 data/cache/*.csv 로 캐시해서 재요청 시 즉시 반환한다.
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


def _cache_path(source: str, symbol: str, interval: str, start: str, end: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", f"{source}_{symbol}_{interval}_{start}_{end}")
    return CACHE_DIR / f"{safe}.csv"


def load_ohlcv(source: str, symbol: str, interval: str, start: str, end: str) -> pd.DataFrame:
    if interval not in INTERVALS:
        raise ValueError(f"지원하지 않는 인터벌: {interval}")

    cache = _cache_path(source, symbol, interval, start, end)
    if cache.exists():
        df = pd.read_csv(cache, index_col=0, parse_dates=True)
        if not df.empty:
            return df

    if source == "stock":
        df = _load_stock(symbol, interval, start, end)
    elif source == "crypto":
        df = _load_crypto(symbol, interval, start, end)
    else:
        raise ValueError(f"지원하지 않는 소스: {source}")

    if df.empty:
        raise ValueError(f"데이터가 없습니다: {source}/{symbol} ({start}~{end})")

    df.to_csv(cache)
    return df


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
