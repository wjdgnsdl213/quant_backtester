"use client";

import { useEffect, useState } from "react";

import {
  addWatch,
  checkSignals,
  deleteWatch,
  fetchSavedStrategies,
  fetchWatches,
  type SavedStrategy,
  type SignalResult,
  type Watch,
} from "@/lib/api";

const inputCls =
  "w-full rounded-md border border-black/10 dark:border-white/10 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#2a78d6] dark:focus:border-[#3987e5]";
const labelCls = "block text-xs font-medium text-neutral-500 mb-1";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  entry_signal: { label: "진입 시그널", cls: "bg-[#e34948]/10 text-[#e34948] border-[#e34948]/40 font-semibold" },
  exit_signal: { label: "청산 시그널", cls: "bg-[#d99a2b]/10 text-[#b07a15] border-[#d99a2b]/40 font-semibold dark:text-[#d99a2b]" },
  holding: { label: "보유 중", cls: "bg-[#2a78d6]/10 text-[#2a78d6] border-[#2a78d6]/30" },
  idle: { label: "관망", cls: "bg-black/5 text-neutral-500 border-black/10 dark:bg-white/10 dark:border-white/10" },
  error: { label: "오류", cls: "bg-[#d03b3b]/10 text-[#d03b3b] border-[#d03b3b]/40" },
};

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a19]">
      {title && <h2 className="mb-3 text-sm font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export default function SignalsPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [results, setResults] = useState<Map<number, SignalResult>>(new Map());
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formStrategy, setFormStrategy] = useState<number | null>(null);
  const [formSource, setFormSource] = useState<"stock" | "crypto">("stock");
  const [formSymbol, setFormSymbol] = useState("");
  const [formInterval, setFormInterval] = useState("1d");
  const [adding, setAdding] = useState(false);

  const load = () => {
    fetchWatches().then(setWatches).catch(() => {});
    fetchSavedStrategies().then(setSaved).catch(() => {});
  };
  useEffect(load, []);

  const onAdd = async () => {
    if (!formStrategy || !formSymbol.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await addWatch({
        strategy_id: formStrategy,
        source: formSource,
        symbol: formSymbol.trim(),
        interval: formInterval,
      });
      setFormSymbol("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "감시 추가에 실패했습니다");
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteWatch(id);
      setWatches((list) => list.filter((w) => w.id !== id));
    } catch {
      load();
    }
  };

  const onCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const { results: rs } = await checkSignals();
      setResults(new Map(rs.map((r) => [r.id, r])));
      setCheckedAt(new Date().toLocaleTimeString("ko-KR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "시그널 확인에 실패했습니다");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-bold">실전 시그널</h1>
        <p className="text-xs leading-relaxed text-neutral-500">
          저장된 전략을 종목에 연결해두고 최신 시세 기준으로 진입/청산 시그널이 떴는지
          확인합니다. 시그널은 마지막 봉 <b>종가 기준</b>이며, 실제 진입/청산은 다음 봉이라는
          점을 감안하세요. 투자 판단의 참고 자료일 뿐 매매 권유가 아닙니다.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[#d03b3b]/40 bg-[#d03b3b]/5 px-4 py-3 text-sm text-[#d03b3b]">
          {error}
        </div>
      )}

      <Card title="감시 추가">
        {saved.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">
            먼저 백테스트 페이지에서 전략을 만들어 저장하세요. 저장된 전략만 감시에 등록할 수 있습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={labelCls}>전략</label>
              <select
                className={inputCls}
                value={formStrategy ?? ""}
                onChange={(e) => setFormStrategy(Number(e.target.value) || null)}
              >
                <option value="">전략 선택</option>
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className={labelCls}>시장</label>
              <select
                className={inputCls}
                value={formSource}
                onChange={(e) => setFormSource(e.target.value as "stock" | "crypto")}
              >
                <option value="stock">주식</option>
                <option value="crypto">크립토</option>
              </select>
            </div>
            <div className="w-40">
              <label className={labelCls}>종목</label>
              <input
                className={inputCls}
                placeholder={formSource === "stock" ? "AAPL" : "BTC/USDT"}
                value={formSymbol}
                onChange={(e) => setFormSymbol(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="w-28">
              <label className={labelCls}>봉 주기</label>
              <select
                className={inputCls}
                value={formInterval}
                onChange={(e) => setFormInterval(e.target.value)}
              >
                <option value="1d">일봉</option>
                <option value="4h">4시간봉</option>
                <option value="1h">1시간봉</option>
                <option value="1wk">주봉</option>
              </select>
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={adding || !formStrategy || !formSymbol.trim()}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              {adding ? "추가 중…" : "추가"}
            </button>
          </div>
        )}
      </Card>

      <Card title={`감시 목록 (${watches.length})`}>
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onCheck}
            disabled={checking || watches.length === 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            {checking ? "최신 시세 확인 중…" : "시그널 확인"}
          </button>
          {checkedAt && (
            <span className="text-xs text-neutral-500">마지막 확인: {checkedAt}</span>
          )}
        </div>

        {watches.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">
            등록된 감시가 없습니다. 위에서 전략과 종목을 연결해 보세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-neutral-500 dark:border-white/10">
                  <th className="py-1.5 pr-3 font-medium">전략</th>
                  <th className="py-1.5 pr-3 font-medium">종목</th>
                  <th className="py-1.5 pr-3 font-medium">주기</th>
                  <th className="py-1.5 pr-3 font-medium">상태</th>
                  <th className="py-1.5 pr-3 font-medium">기준 봉 / 종가</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {watches.map((w) => {
                  const r = results.get(w.id);
                  const badge = r ? STATUS_BADGE[r.status] : null;
                  return (
                    <tr key={w.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                      <td className="py-2 pr-3 text-xs">{w.strategy_name}</td>
                      <td className="py-2 pr-3 tabular-nums">{w.symbol}</td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">{w.interval}</td>
                      <td className="py-2 pr-3">
                        {badge ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.cls}`}>
                            {badge.label}
                            {r?.status === "holding" && r.holding_bars
                              ? ` (${r.holding_bars}봉째${r.direction === "short" ? "·숏" : ""})`
                              : r?.direction === "short" && (r.status === "entry_signal")
                                ? " (숏)"
                                : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">— 확인 전</span>
                        )}
                        {r?.status === "error" && (
                          <p className="mt-0.5 text-[11px] text-[#d03b3b]">{r.detail}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs tabular-nums text-neutral-500">
                        {r?.last_bar ? `${r.last_bar.slice(0, 10)} / ${r.last_close?.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onDelete(w.id)}
                          aria-label="감시 삭제"
                          className="rounded px-1.5 text-xs text-neutral-400 hover:text-[#d03b3b]"
                        >
                          삭제 ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
