"use client";

import type { OptimizeResult } from "@/lib/api";
import { fmtSigned } from "@/lib/viz";

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  low: { label: "낮음", cls: "bg-[#2e9e5b]/10 text-[#2e9e5b]" },
  medium: { label: "중간", cls: "bg-[#d99a2b]/10 text-[#b07a15] dark:text-[#d99a2b]" },
  high: { label: "높음", cls: "bg-[#d03b3b]/10 text-[#d03b3b]" },
};

export default function OptimizeTable({
  result,
  paramLabels,
  onApply,
  applying,
}: {
  result: OptimizeResult;
  paramLabels: Record<string, string>;
  onApply: (params: Record<string, number>) => void;
  applying: boolean;
}) {
  const fmtParams = (params: Record<string, number>) =>
    Object.entries(params)
      .map(([k, v]) => `${paramLabels[k] ?? k} ${v}`)
      .join(" · ");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-neutral-500">
        {result.evaluated}개 조합 평가 · {result.note}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-neutral-500 dark:border-white/10">
              <th className="py-1.5 pr-3 font-medium">#</th>
              <th className="py-1.5 pr-3 font-medium">파라미터</th>
              <th className="py-1.5 pr-3 font-medium">IS 샤프</th>
              <th className="py-1.5 pr-3 font-medium">IS 수익률</th>
              <th className="py-1.5 pr-3 font-medium">OOS 샤프</th>
              <th className="py-1.5 pr-3 font-medium">OOS 수익률</th>
              <th className="py-1.5 pr-3 font-medium">전체 수익률</th>
              <th className="py-1.5 pr-3 font-medium">MDD</th>
              <th className="py-1.5 pr-3 font-medium">거래</th>
              <th className="py-1.5 pr-3 font-medium">과적합</th>
              <th className="py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {result.results.map((row, i) => {
              const badge = RISK_BADGE[row.overfit_risk];
              return (
                <tr
                  key={i}
                  className="border-b border-black/5 last:border-0 dark:border-white/5"
                >
                  <td className="py-1.5 pr-3 text-neutral-500">{i + 1}</td>
                  <td className="py-1.5 pr-3 text-xs">{fmtParams(row.params)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.is_sharpe?.toFixed(2) ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.is_return_pct != null ? `${fmtSigned(row.is_return_pct)}%` : "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.oos_sharpe?.toFixed(2) ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {row.oos_return_pct != null ? `${fmtSigned(row.oos_return_pct)}%` : "—"}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {fmtSigned(row.total_return_pct)}%
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.mdd_pct.toFixed(1)}%</td>
                  <td className="py-1.5 pr-3 tabular-nums">{row.num_trades}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      disabled={applying}
                      onClick={() => onApply(row.params)}
                      className="rounded border border-[#2a78d6] px-2 py-0.5 text-[11px] font-medium text-[#2a78d6] hover:opacity-80 disabled:opacity-40 dark:border-[#3987e5] dark:text-[#3987e5]"
                    >
                      적용
                    </button>
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
