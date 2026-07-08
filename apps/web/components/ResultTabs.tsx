"use client";

export type ResultTabId = "backtest" | "optimize" | "walkforward" | "montecarlo" | "score";

const TABS: { id: ResultTabId; label: string }[] = [
  { id: "backtest", label: "백테스트" },
  { id: "optimize", label: "최적화" },
  { id: "walkforward", label: "워크포워드" },
  { id: "montecarlo", label: "몬테카를로" },
  { id: "score", label: "신뢰 점수" },
];

export default function ResultTabs({
  active,
  onSelect,
  hasData,
}: {
  active: ResultTabId;
  onSelect: (id: ResultTabId) => void;
  hasData: Record<ResultTabId, boolean>;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-black/10 pb-2 dark:border-white/10">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === t.id
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          }`}
        >
          {t.label}
          {hasData[t.id] && active !== t.id && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" />
          )}
        </button>
      ))}
    </div>
  );
}
