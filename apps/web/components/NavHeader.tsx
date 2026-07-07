"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ENGINE_URL } from "@/lib/api";
import { useAdvancedMode } from "@/lib/advanced-context";

const NAV_LINKS = [
  { href: "/", label: "홈" },
  { href: "/backtest", label: "백테스트" },
  { href: "/strategies", label: "저장된 전략" },
  { href: "/signals", label: "실전 시그널" },
];

function EngineStatus() {
  const [status, setStatus] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(`${ENGINE_URL}/health`)
      .then((r) => {
        if (!cancelled) setStatus(r.ok ? "up" : "down");
      })
      .catch(() => {
        if (!cancelled) setStatus("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dotCls =
    status === "up"
      ? "bg-[#2e9e5b]"
      : status === "down"
        ? "bg-[#d03b3b]"
        : "bg-neutral-400";
  const label =
    status === "up" ? "엔진 연결됨" : status === "down" ? "엔진 연결 안 됨" : "확인 중…";

  return (
    <span className="hidden items-center gap-1.5 text-xs text-neutral-500 sm:flex">
      <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  );
}

export default function NavHeader() {
  const pathname = usePathname();
  const { advanced, toggle } = useAdvancedMode();

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#f9f9f7]/80 backdrop-blur-md dark:border-white/10 dark:bg-[#0d0d0d]/80">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-bold tracking-tight">
            퀀트 백테스트
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <EngineStatus />
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-500">
            고급 모드
            <button
              type="button"
              role="switch"
              aria-checked={advanced}
              onClick={toggle}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                advanced ? "bg-[#2a78d6] dark:bg-[#3987e5]" : "bg-black/20 dark:bg-white/20"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  advanced ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      </div>
    </header>
  );
}
