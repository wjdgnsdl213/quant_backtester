"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";

import type { BacktestResult } from "@/lib/api";
import { useVizTheme } from "@/lib/viz";

function toTs(iso: string): UTCTimestamp {
  return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
}

export default function CandleChart({ result }: { result: BacktestResult }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viz = useVizTheme();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height: 320,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: viz.muted,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: viz.grid },
      },
      timeScale: { borderColor: viz.axis },
      rightPriceScale: { borderColor: viz.axis },
      crosshair: {
        vertLine: { color: viz.muted, labelBackgroundColor: viz.ink2 },
        horzLine: { color: viz.muted, labelBackgroundColor: viz.ink2 },
      },
    });

    // 상승=빨강, 하락=파랑 (국내 관례)
    const series = chart.addSeries(CandlestickSeries, {
      upColor: viz.up,
      downColor: viz.down,
      borderVisible: false,
      wickUpColor: viz.up,
      wickDownColor: viz.down,
    });

    const { time, open, high, low, close } = result.ohlcv;
    series.setData(
      time.map((t, i) => ({
        time: toTs(t),
        open: open[i],
        high: high[i],
        low: low[i],
        close: close[i],
      })),
    );

    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const trade of result.trades) {
      markers.push({
        time: toTs(trade.entry_time),
        position: "belowBar",
        color: viz.up,
        shape: "arrowUp",
        text: "매수",
      });
      if (trade.exit_time) {
        markers.push({
          time: toTs(trade.exit_time),
          position: "aboveBar",
          color: viz.down,
          shape: "arrowDown",
          text: "매도",
        });
      }
    }
    markers.sort((a, b) => a.time - b.time);
    createSeriesMarkers(series, markers);

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [result, viz]);

  return <div ref={containerRef} className="w-full" />;
}
