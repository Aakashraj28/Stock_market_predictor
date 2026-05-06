// src/components/CandleChart.jsx
import React, { useEffect, useRef, useState } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";

export default function CandleChart({ ticker, height = 420 }) {
  const wrapperRef = useRef(null);
  const chartDivRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [range, setRange] = useState("1y");
  const [data, setData] = useState([]);
  const [selectedInfo, setSelectedInfo] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [showOHLC, setShowOHLC] = useState(false);

  // fetch candles
  const loadData = async (period) => {
    try {
      const res = await fetch(
        `https://stock-market-predictor-backend-a8v3.onrender.com/api/company/${ticker}?period=${period}&interval=1d`
      );
      const json = await res.json();
      if (json.candles) setData(json.candles);
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };
  useEffect(() => {
    loadData(range);
  }, [ticker, range]);

  // init chart
  useEffect(() => {
    if (!chartDivRef.current) return;

    const chart = createChart(chartDivRef.current, {
      width: chartDivRef.current.clientWidth,
      height: chartDivRef.current.clientHeight,
      layout: { backgroundColor: "transparent", textColor: "#222" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#0f766e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#0f766e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: "",
      priceFormat: { type: "volume" },
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    chart.priceScale("").applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resize = () => {
      chart.applyOptions({
        width: chartDivRef.current.clientWidth,
        height: chartDivRef.current.clientHeight,
      });
      chart.timeScale().fitContent();
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, []);

  // set data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !data.length) return;

    const mapped = data.map((d) => {
      let t = d.t;
      if (typeof t === "number" && t > 1e12) t = Math.floor(t / 1000);
      return { time: t, open: d.o, high: d.h, low: d.l, close: d.c, volume: d.v };
    });

    candleSeriesRef.current.setData(mapped);
    volumeSeriesRef.current.setData(
      mapped.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? "#0f766e55" : "#ef444455",
      }))
    );

    chartRef.current.timeScale().fitContent();
  }, [data]);

  // fullscreen resize
  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        if (chartRef.current && chartDivRef.current) {
          chartRef.current.applyOptions({
            width: chartDivRef.current.clientWidth,
            height: chartDivRef.current.clientHeight,
          });
          chartRef.current.timeScale().fitContent();
        }
      }, 60);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) wrapperRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const resetView = () => chartRef.current?.timeScale().fitContent();

  // --- crosshair OHLC info ---
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const handleCrosshair = (param) => {
      if (!showOHLC || !param?.point || !param.time) {
        setSelectedInfo(null);
        return;
      }

      const c = param.seriesData.get(candleSeriesRef.current);

      if (c) {
        const change = (((c.close - c.open) / c.open) * 100).toFixed(2);
        setSelectedInfo({
          open: c.open.toFixed(2),
          high: c.high.toFixed(2),
          low: c.low.toFixed(2),
          close: c.close.toFixed(2),
          change,
        });

        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const chartRect = chartDivRef.current.getBoundingClientRect();
        setCursorPos({
          x: param.point.x + (chartRect.left - wrapperRect.left),
          y: param.point.y + (chartRect.top - wrapperRect.top),
        });
      } else {
        setSelectedInfo(null);
      }
    };

    chartRef.current.subscribeCrosshairMove(handleCrosshair);
    return () => chartRef.current.unsubscribeCrosshairMove(handleCrosshair);
  }, [showOHLC]);

  const chartHeight = isFullscreen ? "calc(100vh - 96px)" : `${height}px`;

  return (
    <div
      ref={wrapperRef}
      className="relative bg-white rounded-2xl shadow-sm border border-slate-100"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-800">Candlesticks</div>
          <div className="text-xs text-slate-500">
            Zoom · Pan · Toggle OHLC for details
          </div>
        </div>

        <div className="flex items-center gap-2">
          {["1mo", "6mo", "1y", "5y", "max"].map((p) => (
            <button
              key={p}
              onClick={() => setRange(p)}
              className={`text-xs px-2 py-1 rounded-md border ${
                range === p
                  ? "bg-slate-900 text-white"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              {p.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setShowOHLC((prev) => !prev)}
            className={`text-xs px-3 py-1 rounded-md border ${
              showOHLC
                ? "bg-emerald-600 text-white"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            {showOHLC ? "OHLC ON" : "OHLC OFF"}
          </button>
          <button
            onClick={resetView}
            className="text-xs px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            onClick={toggleFullscreen}
            className="text-xs px-3 py-1 rounded-md bg-slate-900 text-white"
          >
            {isFullscreen ? "Exit" : "Fullscreen"}
          </button>
        </div>
      </div>

      {/* Floating OHLC box following cursor */}
      {selectedInfo && (
        <div
          className="absolute z-50 bg-white shadow-md rounded-md px-3 py-2 text-xs border border-slate-200 pointer-events-none"
          style={{
            left: cursorPos.x + 12,
            top: cursorPos.y + 12,
          }}
        >
          <div><span className="font-semibold">Open:</span> {selectedInfo.open}</div>
          <div><span className="font-semibold">High:</span> {selectedInfo.high}</div>
          <div><span className="font-semibold">Low:</span> {selectedInfo.low}</div>
          <div><span className="font-semibold">Close:</span> {selectedInfo.close}</div>
          <div><span className="font-semibold">Change:</span> {selectedInfo.change}%</div>
        </div>
      )}

      {/* Chart */}
      <div ref={chartDivRef} style={{ width: "100%", height: chartHeight }} />
    </div>
  );
}
