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

import type { CompareResult } from "@/lib/api";
import { fmtDate, fmtMoney, fmtSigned, SERIES_COLORS, useVizTheme } from "@/lib/viz";

export default function CompareView({ result }: { result: CompareResult }) {
  const viz = useVizTheme();
  const data = result.time.map((t, i) => {
    const row: Record<string, number | string> = {
      t: fmtDate(t),
      benchmark: result.benchmark[i],
    };
    result.items.forEach((item) => {
      row[`s${item.id}`] = item.equity[i];
    });
    return row;
  });
  const nameById = Object.fromEntries(result.items.map((s) => [`s${s.id}`, s.name]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        {result.items.map((item, i) => (
          <span key={item.id} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            {item.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden>
            <line x1="0" y1="1" x2="16" y2="1" stroke={viz.benchmark} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          단순보유
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
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
            formatter={(value, name) => [
              fmtMoney(Number(value)),
              name === "benchmark" ? "단순보유" : (nameById[String(name)] ?? String(name)),
            ]}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke={viz.benchmark}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {result.items.map((item, i) => (
            <Line
              key={item.id}
              type="monotone"
              dataKey={`s${item.id}`}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-neutral-500 dark:border-white/10">
              <th className="py-1.5 pr-3 font-medium">전략</th>
              <th className="py-1.5 pr-3 font-medium">총 수익률</th>
              <th className="py-1.5 pr-3 font-medium">CAGR</th>
              <th className="py-1.5 pr-3 font-medium">샤프</th>
              <th className="py-1.5 pr-3 font-medium">MDD</th>
              <th className="py-1.5 pr-3 font-medium">승률</th>
              <th className="py-1.5 font-medium">거래</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item, i) => (
              <tr key={item.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="py-1.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                    />
                    <span className="text-xs" title={item.summary}>{item.name}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(item.metrics.total_return_pct)}%</td>
                <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(item.metrics.cagr_pct)}%</td>
                <td className="py-1.5 pr-3 tabular-nums">{item.metrics.sharpe.toFixed(2)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{item.metrics.mdd_pct.toFixed(1)}%</td>
                <td className="py-1.5 pr-3 tabular-nums">{item.metrics.win_rate_pct.toFixed(1)}%</td>
                <td className="py-1.5 tabular-nums">{item.metrics.num_trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
