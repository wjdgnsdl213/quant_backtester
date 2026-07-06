"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { WalkforwardResult } from "@/lib/api";
import { fmtDate, fmtMoney, fmtSigned, useVizTheme } from "@/lib/viz";

export default function WalkforwardView({
  result,
  paramLabels,
}: {
  result: WalkforwardResult;
  paramLabels: Record<string, string>;
}) {
  const viz = useVizTheme();
  const data = result.series.time.map((t, i) => ({
    t: fmtDate(t),
    equity: result.series.equity[i],
  }));

  const positive = result.oos.positive_folds;
  const verdictCls =
    positive === result.n_folds
      ? "bg-[#2e9e5b]/10 text-[#2e9e5b] border-[#2e9e5b]/30"
      : positive * 2 >= result.n_folds
        ? "bg-[#d99a2b]/10 text-[#b07a15] border-[#d99a2b]/40 dark:text-[#d99a2b]"
        : "bg-[#d03b3b]/10 text-[#d03b3b] border-[#d03b3b]/40";

  const fmtParams = (params: Record<string, number>) =>
    Object.entries(params)
      .map(([k, v]) => `${paramLabels[k] ?? k} ${v}`)
      .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${verdictCls}`}>
          검증 구간 수익 {positive}/{result.n_folds}
        </span>
        <span className="text-xs text-neutral-500">
          OOS 종합: 수익률 {fmtSigned(result.oos.return_pct)}% · 샤프{" "}
          {result.oos.sharpe.toFixed(2)} · MDD {result.oos.mdd_pct.toFixed(1)}%
        </span>
      </div>

      <p className="text-sm leading-relaxed">{result.oos.verdict}</p>
      <p className="text-xs leading-relaxed text-neutral-500">{result.note}</p>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={viz.grid} vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: viz.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: viz.axis }}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={fmtMoney}
            tick={{ fill: viz.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: viz.axis, strokeDasharray: "3 3" }}
            contentStyle={{
              background: viz.surface,
              border: `1px solid ${viz.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: viz.ink,
            }}
            labelStyle={{ color: viz.ink2, marginBottom: 4 }}
            formatter={(value) => [fmtMoney(Number(value)), "OOS 자산"]}
          />
          <Line
            type="monotone"
            dataKey="equity"
            stroke={viz.strategy}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-neutral-500 dark:border-white/10">
              <th className="py-1.5 pr-3 font-medium">폴드</th>
              <th className="py-1.5 pr-3 font-medium">검증 기간</th>
              <th className="py-1.5 pr-3 font-medium">선택된 파라미터 (학습 최적)</th>
              <th className="py-1.5 pr-3 font-medium">학습 샤프</th>
              <th className="py-1.5 pr-3 font-medium">검증 수익률</th>
              <th className="py-1.5 pr-3 font-medium">검증 샤프</th>
              <th className="py-1.5 font-medium">검증 MDD</th>
            </tr>
          </thead>
          <tbody>
            {result.folds.map((f) => (
              <tr key={f.fold} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="py-1.5 pr-3 text-neutral-500">{f.fold}</td>
                <td className="py-1.5 pr-3 text-xs">
                  {fmtDate(f.test_start)} ~ {fmtDate(f.test_end)}
                </td>
                <td className="py-1.5 pr-3 text-xs">{fmtParams(f.best_params)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{f.is_sharpe.toFixed(2)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(f.oos.return_pct)}%</td>
                <td className="py-1.5 pr-3 tabular-nums">{f.oos.sharpe.toFixed(2)}</td>
                <td className="py-1.5 tabular-nums">{f.oos.mdd_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
