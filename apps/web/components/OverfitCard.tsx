"use client";

import type { SegmentMetrics, SplitInfo } from "@/lib/api";

const RISK_STYLE: Record<string, { label: string; cls: string }> = {
  low: {
    label: "과적합 위험 낮음",
    cls: "bg-[#2e9e5b]/10 text-[#2e9e5b] border-[#2e9e5b]/30",
  },
  medium: {
    label: "과적합 위험 중간",
    cls: "bg-[#d99a2b]/10 text-[#b07a15] border-[#d99a2b]/40 dark:text-[#d99a2b]",
  },
  high: {
    label: "과적합 위험 높음",
    cls: "bg-[#d03b3b]/10 text-[#d03b3b] border-[#d03b3b]/40",
  },
};

const ROWS: { key: keyof SegmentMetrics; label: string; unit: string }[] = [
  { key: "return_pct", label: "수익률", unit: "%" },
  { key: "sharpe", label: "샤프 비율", unit: "" },
  { key: "mdd_pct", label: "최대 낙폭", unit: "%" },
  { key: "num_trades", label: "거래 횟수", unit: "건" },
  { key: "win_rate_pct", label: "승률", unit: "%" },
];

export default function OverfitCard({ split }: { split: SplitInfo }) {
  if (!split?.available || !split.in_sample || !split.out_of_sample) {
    return (
      <p className="text-sm text-neutral-500">
        기간이 짧아 학습/검증 구간 분할 평가를 할 수 없습니다. 기간을 늘려 보세요.
      </p>
    );
  }

  const risk = RISK_STYLE[split.overfit_risk ?? "medium"];
  const splitDate = split.split_date?.slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${risk.cls}`}
        >
          {risk.label}
        </span>
        <span className="text-xs text-neutral-500">
          앞 70%(학습)와 뒤 30%(검증) 구간의 성과를 비교합니다 · 분할 기준일 {splitDate}
        </span>
      </div>

      <p className="text-sm leading-relaxed">{split.overfit_reason}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-96 text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-neutral-500 dark:border-white/10">
              <th className="py-1.5 pr-4 font-medium">지표</th>
              <th className="py-1.5 pr-4 font-medium">학습 구간 (IS)</th>
              <th className="py-1.5 font-medium">검증 구간 (OOS)</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr
                key={row.key}
                className="border-b border-black/5 last:border-0 dark:border-white/5"
              >
                <td className="py-1.5 pr-4 text-neutral-500">{row.label}</td>
                <td className="py-1.5 pr-4 tabular-nums">
                  {split.in_sample![row.key]}
                  {row.unit}
                </td>
                <td className="py-1.5 tabular-nums">
                  {split.out_of_sample![row.key]}
                  {row.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
