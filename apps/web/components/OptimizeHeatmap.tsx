"use client";

import { useMemo, useState } from "react";

import type { OptimizeAllRow } from "@/lib/api";

const selectCls =
  "rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2 py-1 text-xs outline-none focus:border-[#2a78d6] dark:focus:border-[#3987e5]";

export default function OptimizeHeatmap({
  all,
  paramLabels,
}: {
  all: OptimizeAllRow[];
  paramLabels: Record<string, string>;
}) {
  // 값이 2개 이상인 파라미터만 축 후보
  const varying = useMemo(() => {
    const valuesByKey = new Map<string, Set<number>>();
    all.forEach((r) =>
      Object.entries(r.params).forEach(([k, v]) => {
        if (!valuesByKey.has(k)) valuesByKey.set(k, new Set());
        valuesByKey.get(k)!.add(v);
      }),
    );
    return [...valuesByKey.entries()]
      .filter(([, vals]) => vals.size >= 2)
      .map(([k]) => k);
  }, [all]);

  const [xKey, setXKey] = useState(varying[0] ?? "");
  const [yKey, setYKey] = useState(varying[1] ?? "");

  if (varying.length < 2) return null;
  const x = varying.includes(xKey) ? xKey : varying[0];
  const y = varying.includes(yKey) && yKey !== x ? yKey : (varying.find((k) => k !== x) ?? varying[1]);

  // 셀 = (x,y)에서 나머지 파라미터에 대한 최대 IS 샤프
  const xs = [...new Set(all.map((r) => r.params[x]))].sort((a, b) => a - b);
  const ys = [...new Set(all.map((r) => r.params[y]))].sort((a, b) => a - b);
  const cells = new Map<string, number>();
  all.forEach((r) => {
    if (r.is_sharpe == null) return;
    const key = `${r.params[x]}|${r.params[y]}`;
    const cur = cells.get(key);
    if (cur === undefined || r.is_sharpe > cur) cells.set(key, r.is_sharpe);
  });
  const values = [...cells.values()];
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const best = max;
  const norm = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className="font-medium">파라미터 지형 (셀 = 최대 IS 샤프)</span>
        <select className={selectCls} value={x} onChange={(e) => setXKey(e.target.value)} aria-label="가로축 파라미터">
          {varying.map((k) => (
            <option key={k} value={k}>가로: {paramLabels[k] ?? k}</option>
          ))}
        </select>
        <select className={selectCls} value={y} onChange={(e) => setYKey(e.target.value)} aria-label="세로축 파라미터">
          {varying.filter((k) => k !== x).map((k) => (
            <option key={k} value={k}>세로: {paramLabels[k] ?? k}</option>
          ))}
        </select>
      </div>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        최적점 주변이 완만하게 밝으면(봉우리) 안정적, 옆 칸만 바뀌어도 어두워지면(벼랑) 그
        조합은 우연일 가능성이 큽니다.
      </p>

      <div className="overflow-x-auto">
        <div
          className="grid w-fit gap-0.5 text-[11px] tabular-nums"
          style={{ gridTemplateColumns: `auto repeat(${xs.length}, minmax(44px, 1fr))` }}
        >
          <div className="px-1 py-1 text-right text-neutral-500">
            {paramLabels[y] ?? y} ↓
          </div>
          {xs.map((xv) => (
            <div key={xv} className="px-1 py-1 text-center font-medium text-neutral-500">
              {xv}
            </div>
          ))}
          {[...ys].reverse().map((yv) => (
            <div key={yv} className="contents">
              <div className="px-1 py-1 text-right font-medium text-neutral-500">{yv}</div>
              {xs.map((xv) => {
                const v = cells.get(`${xv}|${yv}`);
                if (v === undefined) {
                  return (
                    <div key={xv} className="rounded-sm bg-black/[0.03] px-1 py-1 text-center text-neutral-300 dark:bg-white/[0.04] dark:text-neutral-600">
                      —
                    </div>
                  );
                }
                const t = norm(v);
                return (
                  <div
                    key={xv}
                    title={`${paramLabels[x] ?? x}=${xv}, ${paramLabels[y] ?? y}=${yv} → IS 샤프 ${v.toFixed(2)}`}
                    className={`rounded-sm px-1 py-1 text-center ${v === best ? "ring-1 ring-[#2a78d6] dark:ring-[#3987e5]" : ""}`}
                    style={{
                      background: `rgba(42, 120, 214, ${0.06 + 0.6 * t})`,
                      color: t > 0.65 ? "#ffffff" : undefined,
                    }}
                  >
                    {v.toFixed(2)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
