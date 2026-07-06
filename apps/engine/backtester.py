"""벡터화 백테스터.

- 시그널은 봉 종가에서 계산되고, 포지션은 다음 봉부터 반영된다 (look-ahead 방지)
- 포지션이 바뀔 때마다 회전율만큼 수수료+슬리피지를 차감한다
- 포지션 값은 -1(숏)~1(롱) 범위. pos*ret 계산은 부호에 관계없이 그대로 성립하므로
  손익 계산 자체는 롱/숏을 구분할 필요가 없다 — 방향 처리는 dsl.compiler가 담당한다
"""

import pandas as pd


def run(df: pd.DataFrame, signal: pd.Series, fee: float, slippage: float,
        initial_capital: float) -> dict:
    signal = signal.reindex(df.index).fillna(0.0).clip(-1, 1)
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
    """포지션 전환 지점에서 개별 거래(진입~청산)를 뽑아낸다. 체결가는 해당 봉 시가로 근사.

    direction은 pos의 부호로 판정한다 (+1=롱 진입, -1=숏 진입). 숏은 매도로 진입해
    매수로 청산하므로 슬리피지 부호와 손익 계산이 롱과 반대가 된다.
    """
    trades = []
    entry_time = None
    entry_price = None
    entry_dir = 0
    diff = pos.diff().fillna(pos.iloc[0])

    for t in df.index[diff != 0]:
        price = float(df.loc[t, "open"])
        new_val = pos.loc[t]
        if entry_time is None and new_val != 0:
            entry_dir = 1 if new_val > 0 else -1
            entry_time = t
            entry_price = price * (1 + slippage) if entry_dir > 0 else price * (1 - slippage)
        elif entry_time is not None and new_val == 0:
            exit_price = price * (1 - slippage) if entry_dir > 0 else price * (1 + slippage)
            if entry_dir > 0:
                pnl = exit_price / entry_price * (1 - fee) ** 2 - 1
            else:
                pnl = entry_price / exit_price * (1 - fee) ** 2 - 1
            trades.append({
                "entry_time": entry_time.isoformat(),
                "exit_time": t.isoformat(),
                "entry_price": round(entry_price, 6),
                "exit_price": round(exit_price, 6),
                "return_pct": round(pnl * 100, 3),
                "holding_bars": int(df.index.get_loc(t) - df.index.get_loc(entry_time)),
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
