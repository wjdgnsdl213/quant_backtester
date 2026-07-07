"use client";

import { useEffect, useState } from "react";

import {
  fetchStrategies,
  runBacktest,
  runMonteCarlo,
  runOptimize,
  runWalkforward,
  type BacktestResult,
  type MonteCarloResult,
  type OptimizeResult,
  type StrategyMeta,
  type WalkforwardResult,
} from "@/lib/api";
import { useAdvancedMode } from "@/lib/advanced-context";
import { downloadJson, downloadText, tradesToCsv } from "@/lib/export";
import CandleChart from "@/components/CandleChart";
import DrawdownChart from "@/components/DrawdownChart";
import EquityChart from "@/components/EquityChart";
import MetricsCards from "@/components/MetricsCards";
import MonteCarloView from "@/components/MonteCarloView";
import OptimizeHeatmap from "@/components/OptimizeHeatmap";
import OptimizeTable from "@/components/OptimizeTable";
import OverfitCard from "@/components/OverfitCard";
import ResultTabs, { type ResultTabId } from "@/components/ResultTabs";
import StrategyForm, { type FormState, type OptimizeOpts } from "@/components/StrategyForm";
import TradesTable from "@/components/TradesTable";
import WalkforwardView from "@/components/WalkforwardView";

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
              지우기 ✕
            </button>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <Card>
      <p className="py-16 text-center text-sm text-neutral-500">{message}</p>
    </Card>
  );
}

export default function BacktestPage() {
  const { advanced } = useAdvancedMode();

  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineDown, setEngineDown] = useState(false);

  const [optResult, setOptResult] = useState<OptimizeResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [wfResult, setWfResult] = useState<WalkforwardResult | null>(null);
  const [walkforwarding, setWalkforwarding] = useState(false);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [montecarloing, setMontecarloing] = useState(false);

  const [activeTab, setActiveTab] = useState<ResultTabId>("backtest");

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
      setActiveTab("backtest");
    } catch (e) {
      setError(e instanceof Error ? e.message : "백테스트에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  const onRun = () => runWith(form);

  const onOptimize = async (opts: OptimizeOpts) => {
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
          grid: opts.grid,
          sort_by: opts.sortBy,
        }),
      );
      setActiveTab("optimize");
    } catch (e) {
      setError(e instanceof Error ? e.message : "최적화에 실패했습니다");
    } finally {
      setOptimizing(false);
    }
  };

  const onWalkforward = async (opts: {
    grid: Record<string, number[]> | null;
    nFolds: number;
  }) => {
    setWalkforwarding(true);
    setError(null);
    try {
      setWfResult(
        await runWalkforward({
          source: form.source,
          symbol: form.symbol,
          interval: form.interval,
          start: form.start,
          end: form.end,
          strategy: form.strategy,
          fee: form.fee,
          slippage: form.slippage,
          initial_capital: form.initial_capital,
          grid: opts.grid,
          n_folds: opts.nFolds,
        }),
      );
      setActiveTab("walkforward");
    } catch (e) {
      setError(e instanceof Error ? e.message : "워크포워드 분석에 실패했습니다");
    } finally {
      setWalkforwarding(false);
    }
  };

  const onApplyParams = (params: Record<string, number>) => {
    const next = { ...form, params: { ...form.params, ...params }, ai: null };
    setForm(next);
    runWith(next);
  };

  const onMonteCarlo = async () => {
    setMontecarloing(true);
    setError(null);
    try {
      const { ai, ...rest } = form;
      setMcResult(
        await runMonteCarlo(
          ai ? { ...rest, strategy: "custom", dsl: ai.dsl } : rest,
        ),
      );
      setActiveTab("montecarlo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "몬테카를로 시뮬레이션에 실패했습니다");
    } finally {
      setMontecarloing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4 lg:flex-row lg:p-6">
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
              advanced={advanced}
              onWalkforward={onWalkforward}
              walkforwarding={walkforwarding}
              onMonteCarlo={onMonteCarlo}
              montecarloing={montecarloing}
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

        <ResultTabs
          active={activeTab}
          onSelect={setActiveTab}
          hasData={{
            backtest: !!result,
            optimize: !!optResult,
            walkforward: !!wfResult,
            montecarlo: !!mcResult,
          }}
        />

        {activeTab === "backtest" &&
          (result ? (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                >
                  결과 지우기 ✕
                </button>
              </div>
              <MetricsCards metrics={result.metrics} />
              {advanced && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-neutral-500">내보내기:</span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadText(
                        `trades_${result.symbol.replace("/", "-")}.csv`,
                        tradesToCsv(result.trades),
                        "text/csv",
                      )
                    }
                    className="rounded border border-black/20 px-2 py-1 font-medium text-neutral-700 hover:opacity-80 dark:border-white/20 dark:text-neutral-200"
                  >
                    거래 내역 CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadJson(`backtest_${result.symbol.replace("/", "-")}.json`, result)
                    }
                    className="rounded border border-black/20 px-2 py-1 font-medium text-neutral-700 hover:opacity-80 dark:border-white/20 dark:text-neutral-200"
                  >
                    결과 전체 JSON
                  </button>
                </div>
              )}
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
          ) : (
            <EmptyTab message="왼쪽에서 종목과 전략을 선택하고 '백테스트 실행'을 눌러주세요." />
          ))}

        {activeTab === "optimize" &&
          (optResult ? (
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
              {optResult.all_results && (
                <OptimizeHeatmap
                  all={optResult.all_results}
                  paramLabels={Object.fromEntries(
                    optResult.strategy.params.map((p) => [p.key, p.label]),
                  )}
                />
              )}
            </Card>
          ) : (
            <EmptyTab message="왼쪽 '검증 도구'에서 파라미터 최적화를 실행하면 여기에 결과가 표시됩니다." />
          ))}

        {activeTab === "walkforward" &&
          (wfResult ? (
            <Card
              title={`워크포워드 분석 — ${wfResult.strategy.name}`}
              onClose={() => setWfResult(null)}
            >
              <WalkforwardView
                result={wfResult}
                paramLabels={Object.fromEntries(
                  wfResult.strategy.params.map((p) => [p.key, p.label]),
                )}
              />
            </Card>
          ) : (
            <EmptyTab message="고급 모드의 '검증 도구'에서 워크포워드 분석을 실행하면 여기에 결과가 표시됩니다." />
          ))}

        {activeTab === "montecarlo" &&
          (mcResult ? (
            <Card
              title={`몬테카를로 — ${mcResult.strategy.name} (${mcResult.n_sims.toLocaleString()}회 시뮬레이션)`}
              onClose={() => setMcResult(null)}
            >
              <MonteCarloView result={mcResult} />
            </Card>
          ) : (
            <EmptyTab message="왼쪽 '검증 도구'에서 몬테카를로 시뮬레이션을 실행하면 여기에 결과가 표시됩니다." />
          ))}
      </div>
    </div>
  );
}
