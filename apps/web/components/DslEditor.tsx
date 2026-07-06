"use client";

import { useState } from "react";

import { validateDsl, type GeneratedStrategy, type StrategyDSL } from "@/lib/api";

const TEMPLATE = `{
  "version": 1,
  "name": "나의 전략",
  "entry": {
    "op": "lt",
    "left": { "ind": "rsi", "params": { "period": 14 } },
    "right": { "const": 30 }
  },
  "exit": {
    "op": "gt",
    "left": { "ind": "rsi", "params": { "period": 14 } },
    "right": { "const": 70 }
  },
  "risk": { "stop_loss_pct": 5, "take_profit_pct": null }
}`;

export default function DslEditor({
  initial,
  onApply,
  onClose,
}: {
  initial: GeneratedStrategy | null;
  onApply: (g: GeneratedStrategy) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(
    initial ? JSON.stringify(initial.dsl, null, 2) : TEMPLATE,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    let parsed: StrategyDSL;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(`JSON 문법 오류: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
      return;
    }
    try {
      onApply(await validateDsl(parsed));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전략 검증에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-black/10 bg-[#fcfcfb] p-4 text-[#0b0b0b] shadow-xl dark:border-white/10 dark:bg-[#1a1a19] dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">DSL JSON 에디터</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            닫기 ✕
          </button>
        </div>

        <p className="mb-2 text-xs leading-relaxed text-neutral-500">
          전략 DSL을 직접 작성하거나 붙여넣으세요. 조건 op: gt / lt / cross_above /
          cross_below / and / or / not · 피연산자: {"{ind, params}"} 또는 {"{const}"} ·
          지표 목록은 블록 빌더에서 확인할 수 있습니다.
        </p>

        <textarea
          className="h-80 w-full resize-y rounded-md border border-black/10 bg-transparent p-3 font-mono text-xs outline-none focus:border-[#2a78d6] dark:border-white/10 dark:focus:border-[#3987e5]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />

        {error && (
          <p className="mt-2 text-xs leading-relaxed text-[#d03b3b]">{error}</p>
        )}

        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="mt-3 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "검증 중…" : "검증 후 적용"}
        </button>
      </div>
    </div>
  );
}
