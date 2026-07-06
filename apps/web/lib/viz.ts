"use client";

import { useEffect, useState } from "react";

// dataviz 검증 통과 팔레트 (light/dark 각각 surface 대비 검증됨).
// 상승=빨강, 하락=파랑 (국내 관례). 벤치마크는 중립 참조선(회색 점선).
export const VIZ = {
  light: {
    surface: "#fcfcfb",
    plane: "#f9f9f7",
    ink: "#0b0b0b",
    ink2: "#52514e",
    muted: "#898781",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    border: "rgba(11,11,11,0.10)",
    up: "#e34948",
    down: "#2a78d6",
    strategy: "#2a78d6",
    benchmark: "#898781",
  },
  dark: {
    surface: "#1a1a19",
    plane: "#0d0d0d",
    ink: "#ffffff",
    ink2: "#c3c2b7",
    muted: "#898781",
    grid: "#2c2c2a",
    axis: "#383835",
    border: "rgba(255,255,255,0.10)",
    up: "#e66767",
    down: "#3987e5",
    strategy: "#3987e5",
    benchmark: "#898781",
  },
};

export type VizTheme = (typeof VIZ)["light"];

export function useVizTheme(): VizTheme {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark ? VIZ.dark : VIZ.light;
}

export function fmtMoney(v: number): string {
  return new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v);
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export function fmtSigned(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}
