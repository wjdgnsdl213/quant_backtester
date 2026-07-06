import type { Trade } from "@/lib/api";

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  downloadText(filename, JSON.stringify(data, null, 2), "application/json");
}

// UTF-8 BOM을 붙여야 엑셀에서 한글 헤더가 깨지지 않는다
export function tradesToCsv(trades: Trade[]): string {
  const header = ["진입시각", "청산시각", "진입가", "청산가", "수익률(%)", "보유봉수"];
  const rows = trades.map((t) => [
    t.entry_time,
    t.exit_time ?? "(보유 중)",
    t.entry_price,
    t.exit_price,
    t.return_pct,
    t.holding_bars,
  ]);
  return "﻿" + [header, ...rows].map((r) => r.join(",")).join("\r\n");
}
