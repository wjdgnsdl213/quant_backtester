"use client";

import type { Metrics } from "@/lib/api";
import { fmtSigned } from "@/lib/viz";

// 상승=빨강, 하락=파랑 (국내 관례)
const POS = "text-[#e34948] dark:text-[#e66767]";
const NEG = "text-[#2a78d6] dark:text-[#3987e5]";

function polarity(v: number) {
  if (v > 0) return POS;
  if (v < 0) return NEG;
  return "";
}

export default function MetricsCards({ metrics }: { metrics: Metrics }) {
  const alpha = metrics.total_return_pct - metrics.benchmark_return_pct;
  const tiles: { label: string; value: string; cls?: string; sub?: string }[] = [
    {
      label: "총 수익률",
      value: `${fmtSigned(metrics.total_return_pct)}%`,
      cls: polarity(metrics.total_return_pct),
      sub: `단순보유 ${fmtSigned(metrics.benchmark_return_pct)}% (α ${fmtSigned(alpha)}%p)`,
    },
    {
      label: "CAGR (연환산)",
      value: `${fmtSigned(metrics.cagr_pct)}%`,
      cls: polarity(metrics.cagr_pct),
    },
    { label: "샤프 지수", value: metrics.sharpe.toFixed(2), sub: `소르티노 ${metrics.sortino.toFixed(2)}` },
    {
      label: "최대 낙폭 (MDD)",
      value: `${metrics.mdd_pct.toFixed(2)}%`,
      cls: NEG,
      sub: `변동성 ${metrics.volatility_pct.toFixed(1)}%`,
    },
    {
      label: "승률",
      value: `${metrics.win_rate_pct.toFixed(1)}%`,
      sub: `${metrics.num_trades}회 거래`,
    },
    {
      label: "손익비 (PF)",
      value: metrics.profit_factor === null ? "—" : metrics.profit_factor.toFixed(2),
      sub: `평균 거래 ${fmtSigned(metrics.avg_trade_pct, 2)}%`,
    },
    { label: "시장 노출도", value: `${metrics.exposure_pct.toFixed(1)}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7 lg:gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border border-black/10 bg-[#fcfcfb] p-3 dark:border-white/10 dark:bg-[#1a1a19]"
        >
          <div className="text-[11px] font-medium text-neutral-500">{t.label}</div>
          <div className={`mt-1 text-lg font-semibold leading-tight ${t.cls ?? ""}`}>
            {t.value}
          </div>
          {t.sub && (
            <div className="mt-0.5 text-[11px] text-neutral-500">{t.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
