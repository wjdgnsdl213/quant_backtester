"use client";

import type { Trade } from "@/lib/api";
import { fmtSigned } from "@/lib/viz";

const POS = "text-[#e34948] dark:text-[#e66767]";
const NEG = "text-[#2a78d6] dark:text-[#3987e5]";

export default function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        이 기간에는 체결된 거래가 없습니다.
      </p>
    );
  }

  return (
    <div className="max-h-80 overflow-auto rounded-md border border-black/10 dark:border-white/10">
      <table className="w-full text-sm [font-variant-numeric:tabular-nums]">
        <thead className="sticky top-0 bg-[#f9f9f7] text-xs text-neutral-500 dark:bg-[#0d0d0d]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">진입</th>
            <th className="px-3 py-2 text-left font-medium">청산</th>
            <th className="px-3 py-2 text-right font-medium">진입가</th>
            <th className="px-3 py-2 text-right font-medium">청산가</th>
            <th className="px-3 py-2 text-right font-medium">수익률</th>
            <th className="px-3 py-2 text-right font-medium">보유(봉)</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr
              key={`${t.entry_time}-${i}`}
              className="border-t border-black/5 dark:border-white/5"
            >
              <td className="px-3 py-1.5 text-neutral-500">{i + 1}</td>
              <td className="px-3 py-1.5">{t.entry_time.slice(0, 10)}</td>
              <td className="px-3 py-1.5">
                {t.exit_time ? t.exit_time.slice(0, 10) : <span className="text-neutral-500">보유 중</span>}
              </td>
              <td className="px-3 py-1.5 text-right">{t.entry_price.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right">{t.exit_price.toLocaleString()}</td>
              <td className={`px-3 py-1.5 text-right font-medium ${t.return_pct > 0 ? POS : t.return_pct < 0 ? NEG : ""}`}>
                {fmtSigned(t.return_pct)}%
              </td>
              <td className="px-3 py-1.5 text-right">{t.holding_bars}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
