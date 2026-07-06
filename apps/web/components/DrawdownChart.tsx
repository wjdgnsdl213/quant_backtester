"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BacktestResult } from "@/lib/api";
import { fmtDate, useVizTheme } from "@/lib/viz";

export default function DrawdownChart({ result }: { result: BacktestResult }) {
  const viz = useVizTheme();
  const data = result.series.time.map((t, i) => ({
    t: fmtDate(t),
    dd: result.series.drawdown[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={viz.grid} vertical={false} />
        <XAxis
          dataKey="t"
          tick={{ fill: viz.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: viz.axis }}
          minTickGap={48}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: viz.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
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
          formatter={(value) => [`${Number(value).toFixed(2)}%`, "낙폭"]}
        />
        <Area
          type="monotone"
          dataKey="dd"
          stroke={viz.down}
          strokeWidth={2}
          fill={viz.down}
          fillOpacity={0.18}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
