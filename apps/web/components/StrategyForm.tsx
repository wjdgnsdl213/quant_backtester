"use client";

import { useEffect, useState } from "react";

import {
  deleteSavedStrategy,
  fetchIndicators,
  fetchSavedStrategies,
  generateStrategy,
  saveStrategy,
  type GeneratedStrategy,
  type IndicatorSpec,
  type SavedStrategy,
  type StrategyMeta,
} from "@/lib/api";
import BlockBuilder from "@/components/BlockBuilder";

export type FormState = {
  source: "stock" | "crypto";
  symbol: string;
  interval: string;
  start: string;
  end: string;
  strategy: string;
  params: Record<string, number>;
  ai: GeneratedStrategy | null;
  fee: number;
  slippage: number;
  initial_capital: number;
};

const QUICK_SYMBOLS: Record<FormState["source"], string[]> = {
  stock: ["AAPL", "TSLA", "NVDA", "005930.KS", "SPY"],
  crypto: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT"],
};

const INTERVALS: Record<FormState["source"], { v: string; label: string }[]> = {
  stock: [
    { v: "1d", label: "일봉" },
    { v: "1h", label: "1시간봉" },
    { v: "1wk", label: "주봉" },
  ],
  crypto: [
    { v: "1d", label: "일봉" },
    { v: "4h", label: "4시간봉" },
    { v: "1h", label: "1시간봉" },
    { v: "1wk", label: "주봉" },
  ],
};

export default function StrategyForm({
  strategies,
  form,
  onChange,
  onRun,
  loading,
  onOptimize,
  optimizing,
  onCompare,
  comparing,
}: {
  strategies: StrategyMeta[];
  form: FormState;
  onChange: (f: FormState) => void;
  onRun: () => void;
  loading: boolean;
  onOptimize: () => void;
  optimizing: boolean;
  onCompare: (ids: number[]) => void;
  comparing: boolean;
}) {
  const selected = strategies.find((s) => s.id === form.strategy);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  const [indicators, setIndicators] = useState<IndicatorSpec[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);

  useEffect(() => {
    fetchSavedStrategies().then(setSaved).catch(() => {});
    fetchIndicators().then(setIndicators).catch(() => {});
  }, []);

  const toggleCompare = (id: number) =>
    setCompareIds((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    );

  const onSave = async () => {
    if (!form.ai) return;
    setSaveBusy(true);
    setAiError(null);
    try {
      await saveStrategy(form.ai.dsl);
      setSaved(await fetchSavedStrategies());
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "전략 저장에 실패했습니다");
    } finally {
      setSaveBusy(false);
    }
  };

  const onDeleteSaved = async (id: number) => {
    try {
      await deleteSavedStrategy(id);
      setSaved((list) => list.filter((s) => s.id !== id));
      setCompareIds((ids) => ids.filter((i) => i !== id));
    } catch {
      // 삭제 실패는 목록 새로고침으로 복구
      fetchSavedStrategies().then(setSaved).catch(() => {});
    }
  };

  const onGenerate = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const generated = await generateStrategy(aiPrompt);
      onChange({ ...form, ai: generated });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "전략 생성에 실패했습니다");
    } finally {
      setAiLoading(false);
    }
  };

  const setSource = (source: FormState["source"]) => {
    onChange({
      ...form,
      source,
      symbol: QUICK_SYMBOLS[source][0],
      interval: "1d",
    });
  };

  const setStrategy = (id: string) => {
    const meta = strategies.find((s) => s.id === id);
    const params = Object.fromEntries(
      (meta?.params ?? []).map((p) => [p.key, p.default]),
    );
    onChange({ ...form, strategy: id, params });
  };

  const inputCls =
    "w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#2a78d6] dark:focus:border-[#3987e5]";
  const labelCls = "block text-xs font-medium text-neutral-500 mb-1";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      <div>
        <span className={labelCls}>시장</span>
        <div className="grid grid-cols-2 gap-1 rounded-md border border-black/10 dark:border-white/10 p-1">
          {(["stock", "crypto"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                form.source === s
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              {s === "stock" ? "주식" : "크립토"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="symbol">
          종목 {form.source === "stock" ? "(예: AAPL, 005930.KS)" : "(예: BTC/USDT)"}
        </label>
        <input
          id="symbol"
          className={inputCls}
          value={form.symbol}
          onChange={(e) => onChange({ ...form, symbol: e.target.value })}
          spellCheck={false}
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {QUICK_SYMBOLS[form.source].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...form, symbol: s })}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                form.symbol === s
                  ? "border-[#2a78d6] text-[#2a78d6] dark:border-[#3987e5] dark:text-[#3987e5]"
                  : "border-black/10 text-neutral-500 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} htmlFor="start">시작일</label>
          <input
            id="start"
            type="date"
            className={inputCls}
            value={form.start}
            onChange={(e) => onChange({ ...form, start: e.target.value })}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="end">종료일</label>
          <input
            id="end"
            type="date"
            className={inputCls}
            value={form.end}
            onChange={(e) => onChange({ ...form, end: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="interval">봉 주기</label>
        <select
          id="interval"
          className={inputCls}
          value={form.interval}
          onChange={(e) => onChange({ ...form, interval: e.target.value })}
        >
          {INTERVALS[form.source].map((i) => (
            <option key={i.v} value={i.v}>{i.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor="strategy">전략</label>
        <select
          id="strategy"
          className={inputCls}
          value={form.strategy}
          onChange={(e) => setStrategy(e.target.value)}
        >
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {selected && (
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">
            {selected.description}
          </p>
        )}
      </div>

      {selected && selected.params.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-black/10 dark:border-white/10 p-3">
          {selected.params.map((p) => (
            <div key={p.key}>
              <label className={labelCls} htmlFor={`param-${p.key}`}>{p.label}</label>
              <input
                id={`param-${p.key}`}
                type="number"
                className={inputCls}
                value={form.params[p.key] ?? p.default}
                min={p.min}
                max={p.max}
                step={p.step}
                onChange={(e) =>
                  onChange({
                    ...form,
                    params: { ...form.params, [p.key]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-black/10 dark:border-white/10 p-3">
        <span className={labelCls}>AI 전략 생성</span>
        <textarea
          className={`${inputCls} min-h-16 resize-y`}
          placeholder="예: 20일선이 60일선을 넘으면 사고, RSI가 75를 넘으면 팔아줘. 손절 7%"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={aiLoading}
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onGenerate}
            disabled={aiLoading || aiPrompt.trim().length < 2}
            className="rounded-md border border-[#2a78d6] px-2 py-1.5 text-sm font-medium text-[#2a78d6] transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-[#3987e5] dark:text-[#3987e5]"
          >
            {aiLoading ? "생성 중…" : "AI로 만들기"}
          </button>
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            disabled={indicators.length === 0}
            className="rounded-md border border-black/20 px-2 py-1.5 text-sm font-medium text-neutral-700 transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-white/20 dark:text-neutral-200"
          >
            블록으로 조립
          </button>
        </div>
        {aiError && (
          <p className="mt-1.5 text-xs leading-relaxed text-[#d03b3b]">{aiError}</p>
        )}
        {form.ai && (
          <div className="mt-2 rounded-md bg-[#2a78d6]/8 p-2.5 dark:bg-[#3987e5]/10">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold">{form.ai.name}</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saveBusy}
                  className="text-xs text-[#2a78d6] hover:opacity-80 disabled:opacity-40 dark:text-[#3987e5]"
                >
                  {saveBusy ? "저장 중…" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...form, ai: null })}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                >
                  해제 ✕
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              {form.ai.summary}
            </p>
            <p className="mt-1.5 text-[11px] text-[#2a78d6] dark:text-[#3987e5]">
              백테스트 실행 시 위 프리셋 대신 이 전략이 사용됩니다
            </p>
          </div>
        )}
      </div>

      {saved.length > 0 && (
        <div className="rounded-md border border-black/10 dark:border-white/10 p-3">
          <span className={labelCls}>저장된 전략 ({saved.length})</span>
          <ul className="flex flex-col gap-1">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  aria-label={`${s.name} 비교 선택`}
                  checked={compareIds.includes(s.id)}
                  onChange={() => toggleCompare(s.id)}
                  className="shrink-0 accent-[#2a78d6]"
                />
                <button
                  type="button"
                  title={s.summary}
                  onClick={() =>
                    onChange({
                      ...form,
                      ai: { dsl: s.dsl, name: s.name, summary: s.summary },
                    })
                  }
                  className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSaved(s.id)}
                  aria-label={`${s.name} 삭제`}
                  className="shrink-0 rounded px-1 text-xs text-neutral-400 hover:text-[#d03b3b]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={comparing || compareIds.length < 2 || compareIds.length > 8}
            onClick={() => onCompare(compareIds)}
            className="mt-2 w-full rounded-md border border-black/20 px-2 py-1.5 text-xs font-medium text-neutral-700 transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-white/20 dark:text-neutral-200"
          >
            {comparing
              ? "비교 중…"
              : `선택 전략 비교 (${compareIds.length}개 선택, 2~8개)`}
          </button>
        </div>
      )}

      <details className="rounded-md border border-black/10 dark:border-white/10 p-3">
        <summary className="cursor-pointer text-xs font-medium text-neutral-500">
          거래 비용 · 초기 자본
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <div>
            <label className={labelCls} htmlFor="fee">편도 수수료 (%)</label>
            <input
              id="fee"
              type="number"
              className={inputCls}
              value={form.fee * 100}
              min={0}
              max={2}
              step={0.01}
              onChange={(e) => onChange({ ...form, fee: Number(e.target.value) / 100 })}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="slippage">슬리피지 (%)</label>
            <input
              id="slippage"
              type="number"
              className={inputCls}
              value={form.slippage * 100}
              min={0}
              max={2}
              step={0.01}
              onChange={(e) =>
                onChange({ ...form, slippage: Number(e.target.value) / 100 })
              }
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="capital">초기 자본</label>
            <input
              id="capital"
              type="number"
              className={inputCls}
              value={form.initial_capital}
              min={1}
              step="any"
              onChange={(e) =>
                onChange({ ...form, initial_capital: Number(e.target.value) })
              }
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[
                { v: 1_000_000, label: "100만" },
                { v: 10_000_000, label: "1000만" },
                { v: 100_000_000, label: "1억" },
              ].map((c) => (
                <button
                  key={c.v}
                  type="button"
                  onClick={() => onChange({ ...form, initial_capital: c.v })}
                  className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    form.initial_capital === c.v
                      ? "border-[#2a78d6] text-[#2a78d6] dark:border-[#3987e5] dark:text-[#3987e5]"
                      : "border-black/10 text-neutral-500 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      <button
        type="submit"
        disabled={loading || !form.symbol.trim()}
        className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {loading ? "백테스트 실행 중…" : "백테스트 실행"}
      </button>

      <button
        type="button"
        onClick={onOptimize}
        disabled={optimizing || !!form.ai || !form.symbol.trim()}
        title={form.ai ? "최적화는 프리셋 전략에서만 가능합니다 (AI/커스텀 전략 해제 후 사용)" : undefined}
        className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium text-neutral-700 transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-white/20 dark:text-neutral-200"
      >
        {optimizing ? "파라미터 최적화 중…" : "파라미터 최적화 (그리드 서치)"}
      </button>

      {builderOpen && (
        <BlockBuilder
          indicators={indicators}
          initial={form.ai}
          onApply={(g) => onChange({ ...form, ai: g })}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </form>
  );
}
