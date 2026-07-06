"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonteCarloResult } from "@/lib/api";
import { fmtMoney, fmtSigned, useVizTheme } from "@/lib/viz";

export default function MonteCarloView({ result }: { result: MonteCarloResult }) {
  const viz = useVizTheme();
  const env = result.envelope;
  const data = env.step.map((s, i) => ({
    step: s,
    band90: [env.p5[i], env.p95[i]],
    band50: [env.p25[i], env.p75[i]],
    median: env.p50[i],
  }));

  const s = result.stats;
  const tiles = [
    { label: "최악 5% 수익률", value: `${fmtSigned(s.final_p5)}%`, sub: "100번 중 95번은 이보다 좋음" },
    { label: "중앙값 수익률", value: `${fmtSigned(s.final_p50)}%`, sub: `상위 5%: ${fmtSigned(s.final_p95)}%` },
    { label: "손실 확률", value: `${s.prob_loss.toFixed(1)}%`, sub: "최종 자산 < 초기 자본" },
    { label: "최악 5% MDD", value: `${s.mdd_p95.toFixed(1)}%`, sub: "경로 중 낙폭 하위 5%" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-lg border border-black/10 p-3 dark:border-white/10"
          >
            <div className="text-[11px] font-medium text-neutral-500">{t.label}</div>
            <div className="mt-1 text-lg font-semibold leading-tight">{t.value}</div>
            <div className="mt-0.5 text-[11px] text-neutral-500">{t.sub}</div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={viz.grid} vertical={false} />
          <XAxis
            dataKey="step"
            tick={{ fill: viz.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: viz.axis }}
            label={{ value: "거래 번호", position: "insideBottomRight", offset: -2, fontSize: 11, fill: viz.muted }}
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
            contentStyle={{
              background: viz.surface,
              border: `1px solid ${viz.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: viz.ink,
            }}
            labelFormatter={(v) => `거래 ${v}번째`}
            formatter={(value, name) => {
              if (Array.isArray(value)) {
                const range = value.map((x) => fmtMoney(Number(x))).join(" ~ ");
                return [range, name === "band90" ? "90% 구간" : "50% 구간"];
              }
              return [fmtMoney(Number(value)), "중앙값"];
            }}
          />
          <Area
            dataKey="band90"
            fill={viz.strategy}
            fillOpacity={0.12}
            stroke="none"
            isAnimationActive={false}
          />
          <Area
            dataKey="band50"
            fill={viz.strategy}
            fillOpacity={0.22}
            stroke="none"
            isAnimationActive={false}
          />
          <Line
            dataKey="median"
            stroke={viz.strategy}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-xs leading-relaxed text-neutral-500">{result.note}</p>
    </div>
  );
}
