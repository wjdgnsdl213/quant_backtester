"use client";

import { useEffect, useState } from "react";

import {
  fetchStrategies,
  runBacktest,
  runCompare,
  runOptimize,
  type BacktestResult,
  type CompareResult,
  type OptimizeResult,
  type StrategyMeta,
} from "@/lib/api";
import CompareView from "@/components/CompareView";
import OptimizeTable from "@/components/OptimizeTable";
import CandleChart from "@/components/CandleChart";
import DrawdownChart from "@/components/DrawdownChart";
import EquityChart from "@/components/EquityChart";
import MetricsCards from "@/components/MetricsCards";
import OverfitCard from "@/components/OverfitCard";
import StrategyForm, { type FormState } from "@/components/StrategyForm";
import TradesTable from "@/components/TradesTable";

const DEFAULT_FORM: FormState = {
  source: "stock",
  symbol: "AAPL",
  interval: "1d",
  start: "2022-01-01",
  end: "2024-12-31",
  strategy: "",
  params: {},
  ai: null,
  fee: 0.001,
  slippage: 0.0005,
  initial_capital: 10_000_000,
};

function Card({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a19]">
      {(title || onClose) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              닫기 ✕
            </button>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export default function Home() {
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineDown, setEngineDown] = useState(false);

  const [optResult, setOptResult] = useState<OptimizeResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [cmpResult, setCmpResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    fetchStrategies()
      .then((list) => {
        setStrategies(list);
        if (list.length > 0) {
          setForm((f) => ({
            ...f,
            strategy: list[0].id,
            params: Object.fromEntries(list[0].params.map((p) => [p.key, p.default])),
          }));
        }
      })
      .catch(() => setEngineDown(true));
  }, []);

  const runWith = async (f: FormState) => {
    setLoading(true);
    setError(null);
    try {
      const { ai, ...rest } = f;
      setResult(
        await runBacktest(
          ai ? { ...rest, strategy: "custom", dsl: ai.dsl } : rest,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "백테스트에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  const onRun = () => runWith(form);

  const onOptimize = async () => {
    setOptimizing(true);
    setError(null);
    try {
      setOptResult(
        await runOptimize({
          source: form.source,
          symbol: form.symbol,
          interval: form.interval,
          start: form.start,
          end: form.end,
          strategy: form.strategy,
          fee: form.fee,
          slippage: form.slippage,
          initial_capital: form.initial_capital,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "최적화에 실패했습니다");
    } finally {
      setOptimizing(false);
    }
  };

  const onApplyParams = (params: Record<string, number>) => {
    const next = { ...form, params: { ...form.params, ...params }, ai: null };
    setForm(next);
    runWith(next);
  };

  const onCompare = async (ids: number[]) => {
    setComparing(true);
    setError(null);
    try {
      setCmpResult(
        await runCompare({
          source: form.source,
          symbol: form.symbol,
          interval: form.interval,
          start: form.start,
          end: form.end,
          ids,
          fee: form.fee,
          slippage: form.slippage,
          initial_capital: form.initial_capital,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "전략 비교에 실패했습니다");
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f9f9f7] text-[#0b0b0b] dark:bg-[#0d0d0d] dark:text-white">
      <header className="border-b border-black/10 px-6 py-4 dark:border-white/10">
        <h1 className="text-lg font-bold">퀀트 백테스트 대시보드</h1>
        <p className="text-xs text-neutral-500">
          주식·크립토 시세에 전략을 적용해 성과를 검증합니다
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 lg:flex-row lg:p-6">
        <aside className="w-full shrink-0 lg:w-72">
          <Card title="백테스트 설정">
            {engineDown ? (
              <p className="text-sm leading-relaxed text-neutral-500">
                엔진 서버에 연결할 수 없습니다.
                <code className="mt-2 block rounded bg-black/5 p-2 text-xs dark:bg-white/10">
                  cd apps/engine
                  <br />
                  .venv\Scripts\uvicorn main:app --reload --port 8000
                </code>
              </p>
            ) : (
              <StrategyForm
                strategies={strategies}
                form={form}
                onChange={setForm}
                onRun={onRun}
                loading={loading}
                onOptimize={onOptimize}
                optimizing={optimizing}
                onCompare={onCompare}
                comparing={comparing}
              />
            )}
          </Card>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {error && (
            <div className="rounded-lg border border-[#d03b3b]/40 bg-[#d03b3b]/5 px-4 py-3 text-sm text-[#d03b3b]">
              {error}
            </div>
          )}

          {cmpResult && (
            <Card
              title={`전략 비교 — ${cmpResult.symbol} (${cmpResult.interval})`}
              onClose={() => setCmpResult(null)}
            >
              <CompareView result={cmpResult} />
            </Card>
          )}

          {optResult && (
            <Card
              title={`파라미터 최적화 — ${optResult.strategy.name}`}
              onClose={() => setOptResult(null)}
            >
              <OptimizeTable
                result={optResult}
                paramLabels={Object.fromEntries(
                  optResult.strategy.params.map((p) => [p.key, p.label]),
                )}
                onApply={onApplyParams}
                applying={loading}
              />
            </Card>
          )}

          {!result && !error && !optResult && !cmpResult && (
            <Card>
              <p className="py-16 text-center text-sm text-neutral-500">
                왼쪽에서 종목과 전략을 선택하고 백테스트를 실행하세요.
              </p>
            </Card>
          )}

          {result && (
            <>
              <MetricsCards metrics={result.metrics} />
              <Card title="과적합 진단 (In-Sample / Out-of-Sample)">
                <OverfitCard split={result.split} />
              </Card>
              <Card title={`자산 곡선 — ${result.symbol} (${result.interval})`}>
                <EquityChart result={result} />
              </Card>
              <Card title="낙폭 (Drawdown)">
                <DrawdownChart result={result} />
              </Card>
              <Card title="가격 차트 · 매매 시점">
                <CandleChart result={result} />
              </Card>
              <Card title={`거래 내역 (${result.trades.length}건)`}>
                <TradesTable trades={result.trades} />
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
