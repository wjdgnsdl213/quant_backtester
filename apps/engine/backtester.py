"""벡터화 백테스터.

- 시그널은 봉 종가에서 계산되고, 포지션은 다음 봉부터 반영된다 (look-ahead 방지)
- 포지션이 바뀔 때마다 회전율만큼 수수료+슬리피지를 차감한다
"""

import pandas as pd


def run(df: pd.DataFrame, signal: pd.Series, fee: float, slippage: float,
        initial_capital: float) -> dict:
    signal = signal.reindex(df.index).fillna(0.0).clip(0, 1)
    pos = signal.shift(1).fillna(0.0)  # 다음 봉부터 체결

    ret = df["close"].pct_change().fillna(0.0)
    turnover = pos.diff().abs().fillna(pos.iloc[0])
    cost = turnover * (fee + slippage)

    strat_ret = pos * ret - cost
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
        "trades": _extract_trades(df, pos, fee, slippage),
    }


def _extract_trades(df: pd.DataFrame, pos: pd.Series, fee: float, slippage: float) -> list[dict]:
    """포지션 전환 지점에서 개별 거래(진입~청산)를 뽑아낸다. 체결가는 해당 봉 시가로 근사."""
    trades = []
    entry_time = None
    entry_price = None
    diff = pos.diff().fillna(pos.iloc[0])

    for t in df.index[diff != 0]:
        price = float(df.loc[t, "open"])
        if diff.loc[t] > 0:
            entry_time, entry_price = t, price * (1 + slippage)
        elif entry_time is not None:
            exit_price = price * (1 - slippage)
            pnl = exit_price / entry_price * (1 - fee) ** 2 - 1
            trades.append({
                "entry_time": entry_time.isoformat(),
                "exit_time": t.isoformat(),
                "entry_price": round(entry_price, 6),
                "exit_price": round(exit_price, 6),
                "return_pct": round(pnl * 100, 3),
                "holding_bars": int(df.index.get_loc(t) - df.index.get_loc(entry_time)),
            })
            entry_time = None

    if entry_time is not None:  # 아직 보유 중인 미청산 포지션
        last = df.index[-1]
        exit_price = float(df["close"].iloc[-1])
        trades.append({
            "entry_time": entry_time.isoformat(),
            "exit_time": None,
            "entry_price": round(entry_price, 6),
            "exit_price": round(exit_price, 6),
            "return_pct": round((exit_price / entry_price * (1 - fee) - 1) * 100, 3),
            "holding_bars": int(df.index.get_loc(last) - df.index.get_loc(entry_time)),
        })
    return trades
