"""실전 시그널 체크.

등록된 감시(전략×종목×주기)마다 최신 시세를 받아 현재 상태를 판정한다.
증분 캐시(loader) 덕분에 매 확인마다 새로 받는 데이터는 마지막 캐시 이후 구간뿐이다.

상태 의미 (시그널은 마지막 봉 종가 기준 → 실제 진입/청산은 다음 봉):
- entry_signal: 마지막 봉에서 진입 시그널 발생 (다음 봉 시가 진입 예정)
- exit_signal:  마지막 봉에서 청산 시그널 발생 (다음 봉 시가 청산 예정)
- holding:      포지션 보유 중
- idle:         관망 중
"""

from datetime import date, timedelta

import pandas as pd

from data import loader
from dsl import compiler
from dsl.schema import StrategyDSL

# 지표 웜업(최대 기간 400봉)을 확보할 수 있는 조회 범위
LOOKBACK_DAYS = {"1d": 1095, "1wk": 1825, "4h": 365, "1h": 90}
MIN_BARS = 30


def check_watch(watch: dict) -> dict:
    """감시 항목 하나의 현재 시그널 상태를 계산한다. 실패 시 status="error"."""
    base = {
        "id": watch["id"],
        "strategy_id": watch["strategy_id"],
        "strategy_name": watch["strategy_name"],
        "source": watch["source"],
        "symbol": watch["symbol"],
        "interval": watch["interval"],
    }
    try:
        dsl = StrategyDSL.model_validate(watch["dsl"])
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=LOOKBACK_DAYS[watch["interval"]])).isoformat()
        df = loader.load_ohlcv(watch["source"], watch["symbol"], watch["interval"], start, end)
        if len(df) < MIN_BARS:
            raise ValueError(f"데이터가 {len(df)}봉뿐입니다")

        signal, _ = compiler.compile_strategy(dsl, df)
        last = float(signal.iloc[-1])
        prev = float(signal.iloc[-2]) if len(signal) > 1 else 0.0

        if last != 0 and prev == 0:
            status = "entry_signal"
        elif last == 0 and prev != 0:
            status = "exit_signal"
        elif last != 0:
            status = "holding"
        else:
            status = "idle"

        holding_bars = 0
        if last != 0:
            arr = signal.to_numpy()
            i = len(arr) - 1
            while i >= 0 and arr[i] != 0:
                holding_bars += 1
                i -= 1

        return {
            **base,
            "status": status,
            "direction": dsl.direction,
            "holding_bars": holding_bars,
            "last_bar": df.index[-1].isoformat(),
            "last_close": round(float(df["close"].iloc[-1]), 4),
        }
    except Exception as e:
        return {**base, "status": "error", "detail": str(e)}
