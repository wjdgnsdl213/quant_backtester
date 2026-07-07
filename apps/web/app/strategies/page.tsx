"use client";

import { useEffect, useState } from "react";

import {
  deleteSavedStrategy,
  fetchSavedStrategies,
  runCompare,
  runMultiSymbol,
  type CompareResult,
  type MultiSymbolResult,
  type SavedStrategy,
} from "@/lib/api";
import CompareView from "@/components/CompareView";
import MultiSymbolView from "@/components/MultiSymbolView";

const inputCls =
  "w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#2a78d6] dark:focus:border-[#3987e5]";
const labelCls = "block text-xs font-medium text-neutral-500 mb-1";

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

type Conditions = {
  source: "stock" | "crypto";
  interval: string;
  start: string;
  end: string;
  fee: number;
  slippage: number;
  initial_capital: number;
};

const DEFAULT_COND: Conditions = {
  source: "stock",
  interval: "1d",
  start: "2022-01-01",
  end: "2024-12-31",
  fee: 0.001,
  slippage: 0.0005,
  initial_capital: 10_000_000,
};

function ConditionFields({
  cond,
  onChange,
}: {
  cond: Conditions;
  onChange: (c: Conditions) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div>
        <label className={labelCls}>시장</label>
        <select
          className={inputCls}
          value={cond.source}
          onChange={(e) =>
            onChange({ ...cond, source: e.target.value as Conditions["source"] })
          }
        >
          <option value="stock">주식</option>
          <option value="crypto">크립토</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>봉 주기</label>
        <select
          className={inputCls}
          value={cond.interval}
          onChange={(e) => onChange({ ...cond, interval: e.target.value })}
        >
          <option value="1d">일봉</option>
          <option value="4h">4시간봉</option>
          <option value="1h">1시간봉</option>
          <option value="1wk">주봉</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>시작일</label>
        <input
          type="date"
          className={inputCls}
          value={cond.start}
          onChange={(e) => onChange({ ...cond, start: e.target.value })}
        />
      </div>
      <div>
        <label className={labelCls}>종료일</label>
        <input
          type="date"
          className={inputCls}
          value={cond.end}
          onChange={(e) => onChange({ ...cond, end: e.target.value })}
        />
      </div>
    </div>
  );
}

export default function StrategiesPage() {
  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    fetchSavedStrategies()
      .then(setSaved)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "불러오기 실패"));
  };
  useEffect(load, []);

  const onDelete = async (id: number) => {
    try {
      await deleteSavedStrategy(id);
      setSaved((list) => list.filter((s) => s.id !== id));
      setCompareIds((ids) => ids.filter((i) => i !== id));
    } catch {
      load();
    }
  };

  // 전략 비교
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [cmpCond, setCmpCond] = useState<Conditions>(DEFAULT_COND);
  const [cmpSymbol, setCmpSymbol] = useState("AAPL");
  const [cmpResult, setCmpResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [cmpError, setCmpError] = useState<string | null>(null);

  const toggleCompare = (id: number) =>
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const onCompare = async () => {
    setComparing(true);
    setCmpError(null);
    try {
      setCmpResult(
        await runCompare({
          source: cmpCond.source,
          symbol: cmpSymbol,
          interval: cmpCond.interval,
          start: cmpCond.start,
          end: cmpCond.end,
          ids: compareIds,
          fee: cmpCond.fee,
          slippage: cmpCond.slippage,
          initial_capital: cmpCond.initial_capital,
        }),
      );
    } catch (e) {
      setCmpError(e instanceof Error ? e.message : "전략 비교에 실패했습니다");
    } finally {
      setComparing(false);
    }
  };

  // 멀티 심볼 검증
  const [msStrategyId, setMsStrategyId] = useState<number | null>(null);
  const [msCond, setMsCond] = useState<Conditions>(DEFAULT_COND);
  const [msSymbols, setMsSymbols] = useState("");
  const [msResult, setMsResult] = useState<MultiSymbolResult | null>(null);
  const [multiSymboling, setMultiSymboling] = useState(false);
  const [msError, setMsError] = useState<string | null>(null);

  const parsedMsSymbols = msSymbols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const onMultiSymbol = async () => {
    const strat = saved.find((s) => s.id === msStrategyId);
    if (!strat) return;
    setMultiSymboling(true);
    setMsError(null);
    try {
      setMsResult(
        await runMultiSymbol({
          source: msCond.source,
          symbols: parsedMsSymbols,
          interval: msCond.interval,
          start: msCond.start,
          end: msCond.end,
          strategy: "custom",
          params: {},
          dsl: strat.dsl,
          fee: msCond.fee,
          slippage: msCond.slippage,
          initial_capital: msCond.initial_capital,
        }),
      );
    } catch (e) {
      setMsError(e instanceof Error ? e.message : "멀티 심볼 검증에 실패했습니다");
    } finally {
      setMultiSymboling(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-bold">저장된 전략</h1>
        <p className="text-xs text-neutral-500">
          백테스트 페이지에서 만든 전략을 저장하면 여기서 관리·비교·멀티 심볼 검증할 수 있습니다.
        </p>
      </div>

      <Card title={`전략 목록 (${saved.length})`}>
        {loadError && <p className="text-sm text-[#d03b3b]">{loadError}</p>}
        {saved.length === 0 && !loadError ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            아직 저장된 전략이 없습니다. 백테스트 페이지에서 AI·블록·JSON으로 전략을 만들고 저장해 보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {saved.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
              >
                <input
                  type="checkbox"
                  aria-label={`${s.name} 비교 선택`}
                  checked={compareIds.includes(s.id)}
                  onChange={() => toggleCompare(s.id)}
                  className="shrink-0 accent-[#2a78d6]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="truncate text-xs text-neutral-500">{s.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={`${s.name} 삭제`}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:text-[#d03b3b]"
                >
                  삭제 ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {saved.length >= 2 && (
        <Card title="전략 비교">
          <div className="flex flex-col gap-3">
            <ConditionFields cond={cmpCond} onChange={setCmpCond} />
            <div>
              <label className={labelCls}>종목</label>
              <input
                className={`${inputCls} max-w-xs`}
                value={cmpSymbol}
                onChange={(e) => setCmpSymbol(e.target.value)}
                spellCheck={false}
              />
            </div>
            {cmpError && <p className="text-xs text-[#d03b3b]">{cmpError}</p>}
            <button
              type="button"
              onClick={onCompare}
              disabled={comparing || compareIds.length < 2 || compareIds.length > 8 || !cmpSymbol.trim()}
              className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              {comparing
                ? "비교 중…"
                : `선택한 ${compareIds.length}개 전략 비교 (2~8개 선택)`}
            </button>
          </div>
          {cmpResult && (
            <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
              <CompareView result={cmpResult} />
            </div>
          )}
        </Card>
      )}

      {saved.length > 0 && (
        <Card title="멀티 심볼 검증">
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>검증할 전략</label>
              <select
                className={`${inputCls} max-w-xs`}
                value={msStrategyId ?? ""}
                onChange={(e) => setMsStrategyId(Number(e.target.value) || null)}
              >
                <option value="">전략을 선택하세요</option>
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <ConditionFields cond={msCond} onChange={setMsCond} />
            <div>
              <label className={labelCls}>종목 (쉼표 구분, 2~8개)</label>
              <input
                className={inputCls}
                placeholder="AAPL, TSLA, NVDA"
                value={msSymbols}
                onChange={(e) => setMsSymbols(e.target.value)}
                spellCheck={false}
              />
            </div>
            {msError && <p className="text-xs text-[#d03b3b]">{msError}</p>}
            <button
              type="button"
              onClick={onMultiSymbol}
              disabled={
                multiSymboling ||
                !msStrategyId ||
                parsedMsSymbols.length < 2 ||
                parsedMsSymbols.length > 8
              }
              className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              {multiSymboling
                ? "여러 종목 백테스트 중… (첫 실행은 느릴 수 있음)"
                : `${parsedMsSymbols.length || "여러"}개 종목에서 검증`}
            </button>
          </div>
          {msResult && (
            <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
              <MultiSymbolView result={msResult} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
