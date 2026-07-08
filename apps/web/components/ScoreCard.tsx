"use client";

import type { ScoreResult } from "@/lib/api";

const GRADE_STYLE: Record<ScoreResult["grade"], string> = {
  A: "bg-[#2e9e5b]/10 text-[#2e9e5b] border-[#2e9e5b]/30",
  B: "bg-[#2e9e5b]/10 text-[#2e9e5b] border-[#2e9e5b]/30",
  C: "bg-[#d99a2b]/10 text-[#b07a15] border-[#d99a2b]/40 dark:text-[#d99a2b]",
  D: "bg-[#d03b3b]/10 text-[#d03b3b] border-[#d03b3b]/40",
  F: "bg-[#d03b3b]/10 text-[#d03b3b] border-[#d03b3b]/40",
};

function componentBarColor(score: number | null): string {
  if (score === null) return "bg-neutral-300 dark:bg-neutral-700";
  if (score >= 65) return "bg-[#2e9e5b]";
  if (score >= 35) return "bg-[#d99a2b]";
  return "bg-[#d03b3b]";
}

export default function ScoreCard({ result }: { result: ScoreResult }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full border-2 text-2xl font-bold ${GRADE_STYLE[result.grade]}`}
        >
          {result.grade}
        </span>
        <div>
          <p className="text-sm font-semibold">{result.grade_label}</p>
          <p className="text-xs text-neutral-500">
            종합 점수 {result.score.toFixed(1)}/100 · {result.symbol} ({result.interval})
          </p>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-[#d99a2b]/40 bg-[#d99a2b]/10 p-3 text-xs leading-relaxed text-[#b07a15] dark:text-[#d99a2b]">
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {result.components.map((c) => (
          <div key={c.id} className="rounded-md border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {c.label} <span className="text-xs font-normal text-neutral-500">(가중치 {Math.round(c.weight * 100)}%)</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {c.available ? `${c.score!.toFixed(1)}점` : "평가 불가"}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              {c.available && (
                <div
                  className={`h-full rounded-full ${componentBarColor(c.score)}`}
                  style={{ width: `${c.score}%` }}
                />
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{c.detail}</p>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">{result.note}</p>
    </div>
  );
}
