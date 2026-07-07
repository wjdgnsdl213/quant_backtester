"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";

import type { BacktestResult } from "@/lib/api";
import { SERIES_COLORS, useVizTheme } from "@/lib/viz";

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

    // 전략이 참조하는 지표 오버레이 (이동평균·볼린저·채널 등)
    for (const [idx, overlay] of (result.overlays ?? []).entries()) {
      const line = chart.addSeries(LineSeries, {
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(
        time.flatMap((t, i) =>
          overlay.values[i] == null ? [] : [{ time: toTs(t), value: overlay.values[i]! }],
        ),
      );
    }

    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const trade of result.trades) {
      const short = trade.direction === "short";
      markers.push({
        time: toTs(trade.entry_time),
        position: short ? "aboveBar" : "belowBar",
        color: short ? viz.down : viz.up,
        shape: short ? "arrowDown" : "arrowUp",
        text: short ? "숏" : "매수",
      });
      if (trade.exit_time) {
        markers.push({
          time: toTs(trade.exit_time),
          position: short ? "belowBar" : "aboveBar",
          color: short ? viz.up : viz.down,
          shape: short ? "arrowUp" : "arrowDown",
          text: short ? "커버" : "매도",
        });
      }
    }
    markers.sort((a, b) => a.time - b.time);
    createSeriesMarkers(series, markers);

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [result, viz]);

  return (
    <div>
      {result.overlays && result.overlays.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          {result.overlays.map((o, i) => (
            <span key={o.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {o.label}
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
