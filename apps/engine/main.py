"""백테스트 엔진 API 서버.

실행: .venv\\Scripts\\uvicorn main:app --reload --port 8000

- GET  /strategies  프리셋 전략 목록 (UI 폼 자동 생성용)
- GET  /indicators  DSL이 참조 가능한 지표 스키마 (블록 팔레트 / AI 프롬프트용)
- POST /backtest    프리셋(strategy+params) 또는 커스텀 DSL(dsl)로 백테스트 실행
- POST /ai/generate 자연어 → 전략 DSL 생성 (ANTHROPIC_API_KEY 필요)
- GET/POST/DELETE /strategies/saved  전략 저장소 (SQLite)
- POST /optimize    프리셋 파라미터 그리드 서치 (IS 순위 + OOS 검증, 커스텀 그리드/정렬 지원)
- POST /walkforward 워크포워드 분석 (폴드별 재최적화 → 미래 구간 검증)
- POST /compare     저장된 전략들을 같은 조건에서 일괄 백테스트
- POST /dsl/validate 블록 빌더용 DSL 검증·요약
"""

from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError

import ai
import backtester
import metrics
import optimizer
import store
import strategies
import walkforward
from data import loader
from dsl import compiler, indicators
from dsl.describe import describe
from dsl.schema import StrategyDSL

app = FastAPI(title="fable engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BacktestRequest(BaseModel):
    source: Literal["stock", "crypto"]
    symbol: str = Field(min_length=1, max_length=30)
    interval: Literal["1d", "1h", "4h", "1wk"] = "1d"
    start: str
    end: str
    strategy: str = "custom"
    params: dict[str, float] = {}
    dsl: dict | None = None  # 있으면 프리셋 대신 이 DSL을 실행 (AI 생성 전략)
    fee: float = Field(0.001, ge=0, le=0.02)
    slippage: float = Field(0.0005, ge=0, le=0.02)
    initial_capital: float = Field(10_000_000, gt=0)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/strategies")
def list_strategies():
    return strategies.list_meta()


@app.get("/indicators")
def list_indicators():
    return indicators.schema()


def _load_df(source: str, symbol: str, interval: str, start: str, end: str) -> pd.DataFrame:
    """날짜 검증 + 시세 로드. 실패는 HTTPException으로 변환."""
    try:
        pd.Timestamp(start), pd.Timestamp(end)
    except ValueError:
        raise HTTPException(400, "날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)")
    if start >= end:
        raise HTTPException(400, "시작일이 종료일보다 앞서야 합니다")
    try:
        df = loader.load_ohlcv(source, symbol.strip(), interval, start, end)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(502, "시세 데이터를 가져오지 못했습니다. 종목 코드와 기간을 확인해 주세요.")
    if len(df) < 30:
        raise HTTPException(400, f"데이터가 {len(df)}봉뿐입니다. 기간을 늘리거나 봉 주기를 바꿔 주세요.")
    return df


@app.post("/backtest")
def run_backtest(req: BacktestRequest):
    if req.dsl is not None:
        dsl_dict = req.dsl
    else:
        try:
            dsl_dict = strategies.build_dsl(req.strategy, req.params)
        except KeyError:
            raise HTTPException(400, f"알 수 없는 전략: {req.strategy}")
    try:
        dsl = StrategyDSL.model_validate(dsl_dict)
    except ValidationError as e:
        raise HTTPException(400, f"전략 검증 실패: {e.errors()[0].get('msg', str(e))}")

    df = _load_df(req.source, req.symbol, req.interval, req.start, req.end)

    signal = compiler.build_position(dsl, df)
    result = backtester.run(df, signal, req.fee, req.slippage, req.initial_capital)

    ppy = metrics.periods_per_year(req.source, req.interval)
    if req.dsl is not None:
        strategy_info = {"id": "custom", "name": dsl.name, "params": {}}
    else:
        preset = strategies.PRESETS[req.strategy]
        strategy_info = {"id": preset.id, "name": preset.name, "params": req.params}

    return {
        "symbol": req.symbol.strip(),
        "source": req.source,
        "interval": req.interval,
        "strategy": strategy_info,
        "metrics": metrics.compute(result, ppy),
        "split": metrics.compute_split(result, ppy),
        "series": {
            "time": [t.isoformat() for t in df.index],
            "equity": _round_list(result["equity"]),
            "benchmark": _round_list(result["benchmark"]),
            "drawdown": _round_list(result["drawdown"], 4),
        },
        "ohlcv": {
            "time": [t.isoformat() for t in df.index],
            "open": _round_list(df["open"]),
            "high": _round_list(df["high"]),
            "low": _round_list(df["low"]),
            "close": _round_list(df["close"]),
            "volume": _round_list(df["volume"]),
        },
        "trades": result["trades"],
        "notes": "시그널은 종가 기준 평가, 체결은 다음 봉 시가 근사. 손절/익절은 종가 기준 판정(장중 터치 미반영).",
    }


class OptimizeRequest(BaseModel):
    source: Literal["stock", "crypto"]
    symbol: str = Field(min_length=1, max_length=30)
    interval: Literal["1d", "1h", "4h", "1wk"] = "1d"
    start: str
    end: str
    strategy: str
    fee: float = Field(0.001, ge=0, le=0.02)
    slippage: float = Field(0.0005, ge=0, le=0.02)
    initial_capital: float = Field(10_000_000, gt=0)
    grid: dict[str, list[float]] | None = None  # 고급 모드: 파라미터별 값 목록 직접 지정
    sort_by: str = "is_sharpe"


@app.post("/optimize")
def run_optimize(req: OptimizeRequest):
    if req.strategy not in strategies.PRESETS:
        raise HTTPException(400, f"알 수 없는 전략: {req.strategy} (최적화는 프리셋 전략만 지원)")
    df = _load_df(req.source, req.symbol, req.interval, req.start, req.end)
    ppy = metrics.periods_per_year(req.source, req.interval)
    try:
        return optimizer.optimize(req.strategy, df, req.fee, req.slippage,
                                  req.initial_capital, ppy, req.grid, req.sort_by)
    except ValueError as e:
        raise HTTPException(400, str(e))


class WalkforwardRequest(OptimizeRequest):
    n_folds: int = Field(4, ge=2, le=8)


@app.post("/walkforward")
def run_walkforward(req: WalkforwardRequest):
    if req.strategy not in strategies.PRESETS:
        raise HTTPException(400, f"알 수 없는 전략: {req.strategy} (워크포워드는 프리셋 전략만 지원)")
    df = _load_df(req.source, req.symbol, req.interval, req.start, req.end)
    ppy = metrics.periods_per_year(req.source, req.interval)
    try:
        return walkforward.run(req.strategy, df, req.fee, req.slippage,
                               req.initial_capital, ppy, req.n_folds, req.grid)
    except ValueError as e:
        raise HTTPException(400, str(e))


class CompareRequest(BaseModel):
    source: Literal["stock", "crypto"]
    symbol: str = Field(min_length=1, max_length=30)
    interval: Literal["1d", "1h", "4h", "1wk"] = "1d"
    start: str
    end: str
    ids: list[int] = Field(min_length=2, max_length=8)
    fee: float = Field(0.001, ge=0, le=0.02)
    slippage: float = Field(0.0005, ge=0, le=0.02)
    initial_capital: float = Field(10_000_000, gt=0)


@app.post("/compare")
def run_compare(req: CompareRequest):
    saved = {row["id"]: row for row in store.list_all()}
    missing = [i for i in req.ids if i not in saved]
    if missing:
        raise HTTPException(404, f"저장된 전략을 찾을 수 없습니다: {missing}")

    df = _load_df(req.source, req.symbol, req.interval, req.start, req.end)
    ppy = metrics.periods_per_year(req.source, req.interval)

    items = []
    benchmark = None
    for sid in req.ids:
        try:
            dsl = StrategyDSL.model_validate(saved[sid]["dsl"])
        except ValidationError:
            raise HTTPException(400, f"저장된 전략(id={sid})이 손상되었습니다")
        signal = compiler.build_position(dsl, df)
        result = backtester.run(df, signal, req.fee, req.slippage, req.initial_capital)
        if benchmark is None:
            benchmark = _round_list(result["benchmark"])
        items.append({
            "id": sid,
            "name": dsl.name,
            "summary": describe(dsl),
            "equity": _round_list(result["equity"]),
            "metrics": metrics.compute(result, ppy),
        })

    return {
        "symbol": req.symbol.strip(),
        "interval": req.interval,
        "time": [t.isoformat() for t in df.index],
        "benchmark": benchmark,
        "items": items,
    }


class ValidateDslRequest(BaseModel):
    dsl: dict


@app.post("/dsl/validate")
def validate_dsl(req: ValidateDslRequest):
    """블록 빌더용: DSL을 검증·정규화하고 요약을 돌려준다."""
    try:
        dsl = StrategyDSL.model_validate(req.dsl)
    except ValidationError as e:
        raise HTTPException(400, f"전략 검증 실패: {e.errors()[0].get('msg', str(e))}")
    return {"dsl": dsl.model_dump(), "name": dsl.name, "summary": describe(dsl)}


class SaveStrategyRequest(BaseModel):
    dsl: dict


@app.get("/strategies/saved")
def list_saved_strategies():
    out = []
    for row in store.list_all():
        try:
            dsl = StrategyDSL.model_validate(row["dsl"])
            summary = describe(dsl)
        except ValidationError:
            summary = "(요약 생성 실패)"
        out.append({**row, "summary": summary})
    return out


@app.post("/strategies/saved")
def save_strategy(req: SaveStrategyRequest):
    try:
        dsl = StrategyDSL.model_validate(req.dsl)
    except ValidationError as e:
        raise HTTPException(400, f"전략 검증 실패: {e.errors()[0].get('msg', str(e))}")
    try:
        sid = store.save(dsl.name, dsl.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"id": sid, "name": dsl.name, "summary": describe(dsl)}


@app.delete("/strategies/saved/{strategy_id}")
def delete_strategy(strategy_id: int):
    if not store.delete(strategy_id):
        raise HTTPException(404, "해당 전략이 없습니다")
    return {"ok": True}


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=2000)


@app.post("/ai/generate")
def ai_generate(req: GenerateRequest):
    try:
        dsl = ai.generate(req.prompt)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except ai.GenerationFailed as e:
        raise HTTPException(502, str(e))
    return {
        "dsl": dsl.model_dump(),
        "name": dsl.name,
        "summary": describe(dsl),
    }


def _round_list(s: pd.Series, digits: int = 2) -> list[float]:
    return [round(float(v), digits) for v in s.to_numpy()]
