"use client";

import { useState } from "react";

import {
  validateDsl,
  type GeneratedStrategy,
  type IndicatorSpec,
  type StrategyDSL,
} from "@/lib/api";

type Operand =
  | { kind: "ind"; ind: string; params: Record<string, number> }
  | { kind: "const"; value: number };

type Row = { left: Operand; op: string; right: Operand };

type Group = { rows: Row[]; join: "and" | "or" };

const OPS = [
  { v: "cross_above", label: "상향 돌파" },
  { v: "cross_below", label: "하향 돌파" },
  { v: "gt", label: "＞ (보다 큼)" },
  { v: "lt", label: "＜ (보다 작음)" },
];

const inputCls =
  "rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs outline-none focus:border-[#2a78d6] dark:focus:border-[#3987e5]";
const labelCls = "block text-xs font-medium text-neutral-500 mb-1";

function defaultParams(spec: IndicatorSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.key, p.default]));
}

function toRef(o: Operand) {
  return o.kind === "const" ? { const: o.value } : { ind: o.ind, params: o.params };
}

function groupToCondition(g: Group) {
  const cmps = g.rows.map((r) => ({ op: r.op, left: toRef(r.left), right: toRef(r.right) }));
  return cmps.length === 1 ? cmps[0] : { op: g.join, args: cmps };
}

// 저장/AI 전략을 빌더로 불러오기: 평탄한 구조(비교 또는 and/or 한 단계)만 지원
function importOperand(x: unknown): Operand | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.const === "number") return { kind: "const", value: o.const };
  if (typeof o.ind === "string") {
    return { kind: "ind", ind: o.ind, params: (o.params as Record<string, number>) ?? {} };
  }
  return null;
}

function importGroup(cond: unknown): Group | null {
  if (typeof cond !== "object" || cond === null) return null;
  const c = cond as Record<string, unknown>;
  const asRow = (x: Record<string, unknown>): Row | null => {
    if (!OPS.some((op) => op.v === x.op)) return null;
    const left = importOperand(x.left);
    const right = importOperand(x.right);
    return left && right ? { left, op: x.op as string, right } : null;
  };
  if (c.op === "and" || c.op === "or") {
    if (!Array.isArray(c.args)) return null;
    const rows = c.args.map((a) => asRow(a as Record<string, unknown>));
    if (rows.some((r) => r === null)) return null;
    return { rows: rows as Row[], join: c.op };
  }
  const row = asRow(c);
  return row ? { rows: [row], join: "and" } : null;
}

export default function BlockBuilder({
  indicators,
  initial,
  onApply,
  onClose,
}: {
  indicators: IndicatorSpec[];
  initial: GeneratedStrategy | null;
  onApply: (g: GeneratedStrategy) => void;
  onClose: () => void;
}) {
  const specById = Object.fromEntries(indicators.map((s) => [s.id, s]));
  const sma = specById["sma"] ?? indicators[0];

  const defaultRow = (): Row => ({
    left: { kind: "ind", ind: "close", params: {} },
    op: "cross_above",
    right: { kind: "ind", ind: sma.id, params: defaultParams(sma) },
  });

  const init = (() => {
    if (initial) {
      const dsl = initial.dsl as Record<string, unknown>;
      const entry = importGroup(dsl.entry);
      const exit = importGroup(dsl.exit);
      if (entry && exit) {
        const risk = (dsl.risk as Record<string, number | boolean | null>) ?? {};
        const direction = dsl.direction === "short" ? "short" : "long";
        return {
          name: initial.name,
          entry,
          exit,
          stopLoss: (risk.stop_loss_pct as number | null) ?? 0,
          takeProfit: (risk.take_profit_pct as number | null) ?? 0,
          sizePct: (risk.size_pct as number | undefined) ?? 100,
          intrabar: risk.intrabar === true,
          direction: direction as "long" | "short",
          imported: true,
        };
      }
    }
    return {
      name: "",
      entry: { rows: [defaultRow()], join: "and" as const },
      exit: {
        rows: [{ ...defaultRow(), op: "cross_below" }],
        join: "and" as const,
      },
      stopLoss: 0,
      takeProfit: 0,
      sizePct: 100,
      intrabar: false,
      direction: "long" as const,
      imported: false,
    };
  })();

  const [name, setName] = useState(init.name);
  const [entry, setEntry] = useState<Group>(init.entry);
  const [exit, setExit] = useState<Group>(init.exit);
  const [stopLoss, setStopLoss] = useState<number>(init.stopLoss || 0);
  const [takeProfit, setTakeProfit] = useState<number>(init.takeProfit || 0);
  const [sizePct, setSizePct] = useState<number>(init.sizePct);
  const [intrabar, setIntrabar] = useState<boolean>(init.intrabar);
  const [direction, setDirection] = useState<"long" | "short">(init.direction);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    const dsl: StrategyDSL = {
      version: 1,
      name: name.trim() || "블록 전략",
      direction,
      entry: groupToCondition(entry),
      exit: groupToCondition(exit),
      risk: {
        stop_loss_pct: stopLoss > 0 ? stopLoss : null,
        take_profit_pct: takeProfit > 0 ? takeProfit : null,
        size_pct: sizePct,
        intrabar,
      },
    };
    try {
      onApply(await validateDsl(dsl));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전략 검증에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const OperandEditor = ({
    value,
    onChange,
  }: {
    value: Operand;
    onChange: (o: Operand) => void;
  }) => {
    const spec = value.kind === "ind" ? specById[value.ind] : null;
    return (
      <div className="flex flex-wrap items-center gap-1">
        <select
          className={inputCls}
          value={value.kind === "const" ? "__const" : value.ind}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__const") onChange({ kind: "const", value: 0 });
            else onChange({ kind: "ind", ind: v, params: defaultParams(specById[v]) });
          }}
        >
          <option value="__const">상수 (숫자)</option>
          {indicators.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {value.kind === "const" && (
          <input
            type="number"
            step="any"
            className={`${inputCls} w-20`}
            value={value.value}
            onChange={(e) => onChange({ kind: "const", value: Number(e.target.value) })}
          />
        )}
        {value.kind === "ind" &&
          spec?.params.map((p) => (
            <label key={p.key} className="flex items-center gap-1 text-[11px] text-neutral-500">
              {p.label}
              <input
                type="number"
                step={p.step}
                min={p.min}
                max={p.max}
                className={`${inputCls} w-16`}
                value={value.params[p.key] ?? p.default}
                onChange={(e) =>
                  onChange({
                    ...value,
                    params: { ...value.params, [p.key]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
      </div>
    );
  };

  const GroupEditor = ({
    title,
    group,
    setGroup,
  }: {
    title: string;
    group: Group;
    setGroup: (g: Group) => void;
  }) => (
    <div className="rounded-md border border-black/10 p-3 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        {group.rows.length > 1 && (
          <div className="flex items-center gap-1 text-[11px] text-neutral-500">
            조건 결합:
            <select
              className={inputCls}
              value={group.join}
              onChange={(e) => setGroup({ ...group, join: e.target.value as "and" | "or" })}
            >
              <option value="and">모두 만족 (AND)</option>
              <option value="or">하나라도 만족 (OR)</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {group.rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded bg-black/[0.03] p-2 dark:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">조건 {i + 1}</span>
              {group.rows.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setGroup({ ...group, rows: group.rows.filter((_, j) => j !== i) })
                  }
                  className="text-[11px] text-neutral-400 hover:text-[#d03b3b]"
                >
                  삭제 ✕
                </button>
              )}
            </div>
            <OperandEditor
              value={row.left}
              onChange={(o) =>
                setGroup({
                  ...group,
                  rows: group.rows.map((r, j) => (j === i ? { ...r, left: o } : r)),
                })
              }
            />
            <select
              className={`${inputCls} w-fit`}
              value={row.op}
              onChange={(e) =>
                setGroup({
                  ...group,
                  rows: group.rows.map((r, j) => (j === i ? { ...r, op: e.target.value } : r)),
                })
              }
            >
              {OPS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <OperandEditor
              value={row.right}
              onChange={(o) =>
                setGroup({
                  ...group,
                  rows: group.rows.map((r, j) => (j === i ? { ...r, right: o } : r)),
                })
              }
            />
          </div>
        ))}
      </div>
      {group.rows.length < 8 && (
        <button
          type="button"
          onClick={() => setGroup({ ...group, rows: [...group.rows, defaultRow()] })}
          className="mt-2 text-xs text-[#2a78d6] hover:opacity-80 dark:text-[#3987e5]"
        >
          + 조건 추가
        </button>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-black/10 bg-[#fcfcfb] p-4 text-[#0b0b0b] shadow-xl dark:border-white/10 dark:bg-[#1a1a19] dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">블록 빌더 — 전략 조립</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            닫기 ✕
          </button>
        </div>

        {initial && !init.imported && (
          <p className="mb-3 rounded bg-[#d99a2b]/10 px-2.5 py-1.5 text-[11px] text-[#b07a15] dark:text-[#d99a2b]">
            현재 적용된 전략은 중첩 구조라 빌더로 불러올 수 없어 새 전략으로 시작합니다.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} htmlFor="bb-name">전략 이름</label>
            <input
              id="bb-name"
              className={`${inputCls} w-full`}
              placeholder="예: 나의 골든크로스"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <span className={labelCls}>포지션 방향</span>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-black/10 p-1 dark:border-white/10">
              {(["long", "short"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                    direction === d
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  {d === "long" ? "롱 (상승 베팅)" : "숏 (하락 베팅)"}
                </button>
              ))}
            </div>
            {direction === "short" && (
              <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                숏은 진입 조건 성립 시 공매도로 진입합니다. 손절은 가격 상승 시, 익절은 가격 하락 시 발동됩니다.
              </p>
            )}
          </div>

          <GroupEditor
            title={direction === "short" ? "진입 (공매도) 조건" : "진입 (매수) 조건"}
            group={entry}
            setGroup={setEntry}
          />
          <GroupEditor title="청산 조건" group={exit} setGroup={setExit} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} htmlFor="bb-sl">손절 % (0 = 사용 안 함)</label>
              <input
                id="bb-sl"
                type="number"
                min={0}
                max={90}
                step={0.5}
                className={`${inputCls} w-full`}
                value={stopLoss}
                onChange={(e) => setStopLoss(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="bb-tp">익절 % (0 = 사용 안 함)</label>
              <input
                id="bb-tp"
                type="number"
                min={0}
                max={1000}
                step={1}
                className={`${inputCls} w-full`}
                value={takeProfit}
                onChange={(e) => setTakeProfit(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-2">
            <div>
              <label className={labelCls} htmlFor="bb-size">진입 비중 % (자본 대비)</label>
              <input
                id="bb-size"
                type="number"
                min={1}
                max={100}
                step={1}
                className={`${inputCls} w-full`}
                value={sizePct}
                onChange={(e) =>
                  setSizePct(Math.max(1, Math.min(100, Number(e.target.value) || 100)))
                }
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-xs text-neutral-700 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={intrabar}
                onChange={(e) => setIntrabar(e.target.checked)}
                className="accent-[#2a78d6]"
              />
              손절/익절 장중 판정
            </label>
          </div>
          {intrabar && (
            <p className="text-[11px] leading-relaxed text-neutral-500">
              장중 저가/고가가 임계값을 터치하면 청산으로 판정합니다 (체결가는 임계값,
              갭이면 시가). 종가 기준보다 보수적이고 현실적인 결과가 나옵니다.
            </p>
          )}

          {error && <p className="text-xs leading-relaxed text-[#d03b3b]">{error}</p>}

          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "검증 중…" : "전략 적용"}
          </button>
        </div>
      </div>
    </div>
  );
}
