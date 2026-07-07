"use client";

import { useEffect, useState } from "react";

import {
  fetchIndicators,
  generateStrategy,
  saveStrategy,
  type GeneratedStrategy,
  type IndicatorSpec,
  type StrategyMeta,
} from "@/lib/api";
import BlockBuilder from "@/components/BlockBuilder";
import DslEditor from "@/components/DslEditor";
import { downloadJson } from "@/lib/export";

export type OptimizeOpts = {
  grid: Record<string, number[]> | null;
  sortBy: "is_sharpe" | "is_return_pct" | "total_return_pct" | "mdd_pct";
};

const SORT_OPTIONS: { v: OptimizeOpts["sortBy"]; label: string }[] = [
  { v: "is_sharpe", label: "학습(IS) 샤프" },
  { v: "is_return_pct", label: "학습(IS) 수익률" },
  { v: "total_return_pct", label: "전체 수익률" },
  { v: "mdd_pct", label: "MDD 얕은 순" },
];

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

const inputCls =
  "w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#2a78d6] dark:focus:border-[#3987e5]";
const labelCls = "block text-xs font-medium text-neutral-500 mb-1";
const sectionCls = "rounded-md border border-black/10 dark:border-white/10 p-3";
const sectionTitleCls = "cursor-pointer text-xs font-semibold text-neutral-700 dark:text-neutral-200";

export default function StrategyForm({
  strategies,
  form,
  onChange,
  onRun,
  loading,
  onOptimize,
  optimizing,
  advanced,
  onWalkforward,
  walkforwarding,
  onMonteCarlo,
  montecarloing,
}: {
  strategies: StrategyMeta[];
  form: FormState;
  onChange: (f: FormState) => void;
  onRun: () => void;
  loading: boolean;
  onOptimize: (opts: OptimizeOpts) => void;
  optimizing: boolean;
  advanced: boolean;
  onWalkforward: (opts: { grid: Record<string, number[]> | null; nFolds: number }) => void;
  walkforwarding: boolean;
  onMonteCarlo: () => void;
  montecarloing: boolean;
}) {
  const selected = strategies.find((s) => s.id === form.strategy);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [indicators, setIndicators] = useState<IndicatorSpec[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [dslEditorOpen, setDslEditorOpen] = useState(false);

  // 고급 모드: 커스텀 그리드 (파라미터별 쉼표 구분 값), 정렬, 워크포워드 폴드 수
  const [gridText, setGridText] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<OptimizeOpts["sortBy"]>("is_sharpe");
  const [nFolds, setNFolds] = useState(4);

  const parseGrid = (): Record<string, number[]> | null => {
    if (!advanced || !selected) return null;
    const grid: Record<string, number[]> = {};
    for (const p of selected.params) {
      const text = gridText[p.key]?.trim();
      if (!text) continue;
      const values = text
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v));
      if (values.length > 0) grid[p.key] = values;
    }
    return Object.keys(grid).length > 0 ? grid : null;
  };

  useEffect(() => {
    fetchIndicators().then(setIndicators).catch(() => {});
  }, []);

  const onSave = async () => {
    if (!form.ai) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      await saveStrategy(form.ai.dsl);
      setSaveMsg("저장했습니다 — '저장된 전략' 페이지에서 확인하세요.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "전략 저장에 실패했습니다");
    } finally {
      setSaveBusy(false);
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

  const aiDirection = (form.ai?.dsl as Record<string, unknown> | undefined)?.direction;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      {/* 기본 설정 — 항상 펼쳐짐 */}
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

      {/* 전략 생성 도구 */}
      <details className={sectionCls} open>
        <summary className={sectionTitleCls}>전략 생성 도구 (AI · 블록 · JSON)</summary>
        <div className="mt-2">
          <textarea
            className={`${inputCls} min-h-16 resize-y`}
            placeholder="예: 20일선이 60일선을 넘으면 사고, RSI가 75를 넘으면 팔아줘. 손절 7%"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={aiLoading}
          />
          <div className={`mt-1.5 grid gap-1.5 ${advanced ? "grid-cols-3" : "grid-cols-2"}`}>
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
              블록 조립
            </button>
            {advanced && (
              <button
                type="button"
                onClick={() => setDslEditorOpen(true)}
                className="rounded-md border border-black/20 px-2 py-1.5 text-sm font-medium text-neutral-700 transition-opacity hover:opacity-80 dark:border-white/20 dark:text-neutral-200"
              >
                JSON 편집
              </button>
            )}
          </div>
          {aiError && (
            <p className="mt-1.5 text-xs leading-relaxed text-[#d03b3b]">{aiError}</p>
          )}
          {form.ai && (
            <div className="mt-2 rounded-md bg-[#2a78d6]/8 p-2.5 dark:bg-[#3987e5]/10">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold">
                  {form.ai.name}
                  {aiDirection === "short" && (
                    <span className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-normal dark:bg-white/15">
                      숏
                    </span>
                  )}
                </p>
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
              {saveMsg && (
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{saveMsg}</p>
              )}
              <p className="mt-1.5 text-[11px] text-[#2a78d6] dark:text-[#3987e5]">
                백테스트 실행 시 위 프리셋 대신 이 전략이 사용됩니다
              </p>
              {advanced && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11px] text-neutral-500">
                    DSL JSON 보기
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/5 p-2 text-[10px] leading-relaxed dark:bg-white/10">
                    {JSON.stringify(form.ai.dsl, null, 2)}
                  </pre>
                  <button
                    type="button"
                    onClick={() =>
                      downloadJson(`strategy_${form.ai!.name.replace(/\s+/g, "_")}.json`, form.ai!.dsl)
                    }
                    className="mt-1 text-[11px] text-[#2a78d6] hover:opacity-80 dark:text-[#3987e5]"
                  >
                    전략 JSON 다운로드
                  </button>
                </details>
              )}
            </div>
          )}
        </div>
      </details>

      {/* 거래 비용 · 초기 자본 */}
      <details className={sectionCls}>
        <summary className={sectionTitleCls}>거래 비용 · 초기 자본</summary>
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

      {/* 검증 도구 — 최적화 · 워크포워드(고급) · 몬테카를로 */}
      <details className={sectionCls}>
        <summary className={sectionTitleCls}>검증 도구</summary>
        <div className="mt-2 flex flex-col gap-2">
          {advanced && selected && !form.ai && (
            <div className="rounded-md border border-black/10 p-2.5 dark:border-white/10">
              <p className="text-[11px] leading-relaxed text-neutral-500">
                파라미터별 시험할 값을 쉼표로 입력하세요 (비우면 자동 생성, 최대 10개 · 총 300조합)
              </p>
              <div className="mt-1.5 flex flex-col gap-2">
                {selected.params.map((p) => (
                  <div key={p.key}>
                    <label className={labelCls} htmlFor={`grid-${p.key}`}>
                      {p.label} <span className="font-normal">({p.min}~{p.max})</span>
                    </label>
                    <input
                      id={`grid-${p.key}`}
                      className={inputCls}
                      placeholder="자동"
                      spellCheck={false}
                      value={gridText[p.key] ?? ""}
                      onChange={(e) =>
                        setGridText({ ...gridText, [p.key]: e.target.value })
                      }
                    />
                  </div>
                ))}
                <div>
                  <label className={labelCls} htmlFor="opt-sort">최적화 정렬 기준</label>
                  <select
                    id="opt-sort"
                    className={inputCls}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as OptimizeOpts["sortBy"])}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.v} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="wf-folds">워크포워드 폴드 수 (2~8)</label>
                  <input
                    id="wf-folds"
                    type="number"
                    min={2}
                    max={8}
                    step={1}
                    className={inputCls}
                    value={nFolds}
                    onChange={(e) =>
                      setNFolds(Math.max(2, Math.min(8, Number(e.target.value) || 4)))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onWalkforward({ grid: parseGrid(), nFolds })}
                  disabled={walkforwarding || !form.symbol.trim()}
                  className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-white/20 dark:text-neutral-200"
                >
                  {walkforwarding ? "워크포워드 분석 중…" : "워크포워드 분석 (폴드별 재최적화)"}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onOptimize({ grid: parseGrid(), sortBy })}
            disabled={optimizing || !!form.ai || !form.symbol.trim()}
            title={form.ai ? "최적화는 프리셋 전략에서만 가능합니다 (AI/커스텀 전략 해제 후 사용)" : undefined}
            className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-white/20 dark:text-neutral-200"
          >
            {optimizing ? "파라미터 최적화 중…" : "파라미터 최적화 (그리드 서치)"}
          </button>

          <button
            type="button"
            onClick={onMonteCarlo}
            disabled={montecarloing || !form.symbol.trim()}
            title="거래 순서를 수천 번 재배열해 수익률 신뢰구간을 봅니다"
            className="rounded-md border border-black/20 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-opacity hover:opacity-80 disabled:opacity-40 dark:border-white/20 dark:text-neutral-200"
          >
            {montecarloing ? "몬테카를로 시뮬레이션 중…" : "몬테카를로 (수익 신뢰구간)"}
          </button>
        </div>
      </details>

      {dslEditorOpen && (
        <DslEditor
          initial={form.ai}
          onApply={(g) => onChange({ ...form, ai: g })}
          onClose={() => setDslEditorOpen(false)}
        />
      )}

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
