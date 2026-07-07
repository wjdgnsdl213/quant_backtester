"""벡터화 백테스터.

- 시그널은 봉 종가에서 계산되고, 포지션은 다음 봉부터 반영된다 (look-ahead 방지)
- 포지션이 바뀔 때마다 회전율만큼 수수료+슬리피지를 차감한다
- 포지션 값은 -1(숏 전액)~1(롱 전액) 범위의 비중. pos*ret 계산은 부호·크기에
  관계없이 그대로 성립하므로 손익 계산은 방향/사이징을 구분할 필요가 없다
- exit_fills: 장중 손절/익절 체결가 {트리거 봉 위치 → 체결가}. 해당 봉의
  수익률을 종가 대신 체결가 기준으로 교체한다 (dsl.compiler가 생성)
"""

import pandas as pd


def run(df: pd.DataFrame, signal: pd.Series, fee: float, slippage: float,
        initial_capital: float, exit_fills: dict[int, float] | None = None) -> dict:
    signal = signal.reindex(df.index).fillna(0.0).clip(-1, 1)
    pos = signal.shift(1).fillna(0.0)  # 다음 봉부터 체결

    ret = df["close"].pct_change().fillna(0.0)
    turnover = pos.diff().abs().fillna(pos.iloc[0])
    cost = turnover * (fee + slippage)

    strat_ret = pos * ret - cost
    if exit_fills:
        # 장중 청산 봉: 종가 수익률 대신 체결가 기준 수익률로 교체
        close = df["close"].to_numpy(dtype=float)
        for i, fill in exit_fills.items():
            if i <= 0 or i >= len(df):
                continue
            fill_ret = fill / close[i - 1] - 1
            strat_ret.iloc[i] = pos.iloc[i] * fill_ret - cost.iloc[i]

    equity = (1 + strat_ret).cumprod() * initial_capital
    bench = (1 + ret).cumprod() * initial_capital

    peak = equity.cummax()
    drawdown = equity / peak - 1

    return {
        "position": pos,
        "returns": strat_ret,
        "bench_returns": ret,
        "equity": equity,
        "benchmark": bench,
        "drawdown": drawdown,
        "trades": _extract_trades(df, pos, fee, slippage, exit_fills or {}),
    }


def _extract_trades(df: pd.DataFrame, pos: pd.Series, fee: float, slippage: float,
                    exit_fills: dict[int, float]) -> list[dict]:
    """포지션 전환 지점에서 개별 거래(진입~청산)를 뽑아낸다. 체결가는 해당 봉 시가로 근사.

    direction은 pos의 부호로 판정한다 (+=롱, -=숏). 숏은 매도로 진입해 매수로
    청산하므로 슬리피지 부호와 손익 계산이 롱과 반대가 된다.
    장중 청산(exit_fills)이 있으면 청산 시점·가격을 트리거 봉의 체결가로 기록한다.
    """
    trades = []
    entry_time = None
    entry_price = None
    entry_dir = 0
    diff = pos.diff().fillna(pos.iloc[0])

    for t in df.index[diff != 0]:
        t_loc = df.index.get_loc(t)
        price = float(df.loc[t, "open"])
        new_val = pos.loc[t]
        if entry_time is None and new_val != 0:
            entry_dir = 1 if new_val > 0 else -1
            entry_time = t
            entry_price = price * (1 + slippage) if entry_dir > 0 else price * (1 - slippage)
        elif entry_time is not None and new_val == 0:
            # 장중 청산이면 트리거 봉(포지션 마지막 봉)의 체결가로 기록
            fill = exit_fills.get(t_loc - 1)
            if fill is not None:
                exit_t = df.index[t_loc - 1]
                raw_exit = fill
            else:
                exit_t = t
                raw_exit = price
            exit_price = raw_exit * (1 - slippage) if entry_dir > 0 else raw_exit * (1 + slippage)
            if entry_dir > 0:
                pnl = exit_price / entry_price * (1 - fee) ** 2 - 1
            else:
                pnl = entry_price / exit_price * (1 - fee) ** 2 - 1
            trades.append({
                "entry_time": entry_time.isoformat(),
                "exit_time": exit_t.isoformat(),
                "entry_price": round(entry_price, 6),
                "exit_price": round(exit_price, 6),
                "return_pct": round(pnl * 100, 3),
                "holding_bars": int(df.index.get_loc(exit_t) - df.index.get_loc(entry_time)),
                "direction": "long" if entry_dir > 0 else "short",
            })
            entry_time = None

    if entry_time is not None:  # 아직 보유 중인 미청산 포지션
        last = df.index[-1]
        exit_price = float(df["close"].iloc[-1])
        if entry_dir > 0:
            pnl = exit_price / entry_price * (1 - fee) - 1
        else:
            pnl = entry_price / exit_price * (1 - fee) - 1
        trades.append({
            "entry_time": entry_time.isoformat(),
            "exit_time": None,
            "entry_price": round(entry_price, 6),
            "exit_price": round(exit_price, 6),
            "return_pct": round(pnl * 100, 3),
            "holding_bars": int(df.index.get_loc(last) - df.index.get_loc(entry_time)),
            "direction": "long" if entry_dir > 0 else "short",
        })
    return trades
