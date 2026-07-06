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

import type { BacktestResult } from "@/lib/api";
import { fmtDate, fmtMoney, useVizTheme } from "@/lib/viz";

export default function EquityChart({ result }: { result: BacktestResult }) {
  const viz = useVizTheme();
  const data = result.series.time.map((t, i) => ({
    t: fmtDate(t),
    strategy: result.series.equity[i],
    benchmark: result.series.benchmark[i],
  }));

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: viz.strategy }} />
          전략 ({result.strategy.name})
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden>
            <line x1="0" y1="1" x2="16" y2="1" stroke={viz.benchmark} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          단순보유 (벤치마크)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
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
              name === "strategy" ? "전략" : "단순보유",
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
          <Line
            type="monotone"
            dataKey="strategy"
            stroke={viz.strategy}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
