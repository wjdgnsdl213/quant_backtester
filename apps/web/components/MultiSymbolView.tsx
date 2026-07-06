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

import type { MultiSymbolResult } from "@/lib/api";
import { fmtSigned, SERIES_COLORS, useVizTheme } from "@/lib/viz";

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  low: { label: "낮음", cls: "bg-[#2e9e5b]/10 text-[#2e9e5b]" },
  medium: { label: "중간", cls: "bg-[#d99a2b]/10 text-[#b07a15] dark:text-[#d99a2b]" },
  high: { label: "높음", cls: "bg-[#d03b3b]/10 text-[#d03b3b]" },
};

export default function MultiSymbolView({ result }: { result: MultiSymbolResult }) {
  const viz = useVizTheme();

  // 심볼마다 거래일이 다르므로 날짜 union 기준으로 병합 (없는 날은 선 연결)
  const dates = new Set<string>();
  const bySymbol = result.items.map((item) => {
    const map = new Map<string, number>();
    item.series.time.forEach((t, i) => {
      const d = t.slice(0, 10);
      dates.add(d);
      map.set(d, item.series.equity_norm[i]);
    });
    return map;
  });
  const data = [...dates].sort().map((d) => {
    const row: Record<string, string | number | undefined> = { t: d };
    result.items.forEach((item, i) => {
      row[item.symbol] = bySymbol[i].get(d);
    });
    return row;
  });

  const positive = result.items.filter((i) => i.metrics.total_return_pct > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-neutral-500">
        같은 전략을 {result.items.length}개 종목에 적용한 결과입니다 (수익{" "}
        {positive}/{result.items.length}). 특정 종목에서만 통하는 전략은 그 종목의 과거에
        끼워 맞춰졌을 가능성을 의심하세요. 자산곡선은 시작=1로 정규화.
      </p>

      {result.errors.length > 0 && (
        <div className="rounded-md bg-[#d99a2b]/10 px-3 py-2 text-xs leading-relaxed text-[#b07a15] dark:text-[#d99a2b]">
          실패한 심볼: {result.errors.map((e) => `${e.symbol} (${e.detail})`).join(" · ")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        {result.items.map((item, i) => (
          <span key={item.symbol} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            {item.symbol}
          </span>
        ))}
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
            tickFormatter={(v) => `${Number(v).toFixed(1)}×`}
            tick={{ fill: viz.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
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
            formatter={(value, name) => [`${Number(value).toFixed(3)}×`, String(name)]}
          />
          {result.items.map((item, i) => (
            <Line
              key={item.symbol}
              type="monotone"
              dataKey={item.symbol}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-neutral-500 dark:border-white/10">
              <th className="py-1.5 pr-3 font-medium">종목</th>
              <th className="py-1.5 pr-3 font-medium">총 수익률</th>
              <th className="py-1.5 pr-3 font-medium">단순보유</th>
              <th className="py-1.5 pr-3 font-medium">샤프</th>
              <th className="py-1.5 pr-3 font-medium">MDD</th>
              <th className="py-1.5 pr-3 font-medium">승률</th>
              <th className="py-1.5 pr-3 font-medium">거래</th>
              <th className="py-1.5 font-medium">과적합</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item, i) => {
              const badge = item.overfit_risk ? RISK_BADGE[item.overfit_risk] : null;
              return (
                <tr key={item.symbol} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                      />
                      <span className="text-xs">{item.symbol}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(item.metrics.total_return_pct)}%</td>
                  <td className="py-1.5 pr-3 tabular-nums">{fmtSigned(item.metrics.benchmark_return_pct)}%</td>
                  <td className="py-1.5 pr-3 tabular-nums">{item.metrics.sharpe.toFixed(2)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{item.metrics.mdd_pct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 tabular-nums">{item.metrics.win_rate_pct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 tabular-nums">{item.metrics.num_trades}</td>
                  <td className="py-1.5">
                    {badge ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
