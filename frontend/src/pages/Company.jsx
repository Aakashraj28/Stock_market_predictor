// src/pages/Company.jsx
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";
import CandleChart from "../components/CandleChart";
import IndicatorChart from "../components/IndicatorChart";
import FinancialChart from "../components/FinancialChart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area
} from "recharts";

export default function Company() {
  const { ticker } = useParams();
  const [info, setInfo] = useState(null);
  const [prices, setPrices] = useState([]);
  const [indicators, setIndicators] = useState({ rsi: [], macd: [], sma: [] });
  const [technicals, setTechnicals] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loadingPred, setLoadingPred] = useState(false);
  const [rmse, setRmse] = useState(null);

  // Financials (store the full object returned by backend)
  const [financials, setFinancials] = useState(null);

  // Basic company + candles + indicators + technicals
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/company/${ticker}`);
        setInfo(r.data.info);
        setPrices(r.data.candles || []);
        setIndicators(r.data.indicators || { rsi: [], macd: [], sma: [] });
        setTechnicals(r.data.technicals || null);
      } catch (e) {
        console.error("Company API error", e);
      }
    })();
  }, [ticker]);

  // Fetch financials separately and store the full API response object
  useEffect(()=>{(async()=>{
    try {
      const r = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/financials/${ticker}`)
      // r.data => { quarterly: [...], annual: [...] }
      setFinancials(r.data || null)
    } catch(e) {
      console.error("Failed to load financials", e)
      setFinancials(null)
    }
  })()},[ticker])

  // Weekly pagination for the prices table
  const [week, setWeek] = useState(0);
  const rowsPerWeek = 5;
  const visiblePrices = useMemo(() => {
    if (!prices?.length) return [];
    const start = Math.max(0, prices.length - (week + 1) * rowsPerWeek);
    const end = prices.length - week * rowsPerWeek;
    return prices.slice(start, end);
  }, [prices, week]);
  const hasOlderWeek = prices.length > (week + 1) * rowsPerWeek;

  const onPredict = async () => {
    setLoadingPred(true);
    try {
      const r = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/predict/${ticker}`);

      // ✅ NEW: check stale model
      if (r.data.is_stale) {
        const retrain = confirm("⚠️ Model is older than 7 days. Retrain now?");
        
        if (retrain) {
          await axios.post(`https://stock-market-predictor-backend-a8v3.onrender.com/api/train/${ticker}`);
          
          const newPred = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/predict/${ticker}`);
          setForecast(r.data.forecast || []);
          setRmse(r?.data?.metrics?.rmse ?? null);
        } else {
          setForecast(r.data.forecast || []);
          setRmse(r?.data?.metrics?.rmse ?? null);
        }
      } else {
        setForecast(r.data.forecast || []);
        setRmse(r?.data?.metrics?.rmse ?? null);
      }
      const rmse = r?.data?.metrics?.rmse;
      alert(`Model: Hybrid CNN-LSTM${rmse != null ? ` | Test RMSE: ${(+rmse).toFixed(3)}` : ""}`);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        if (confirm("No trained model found. Train now?")) {
          await axios.post(`https://stock-market-predictor-backend-a8v3.onrender.com/api/train/${ticker}`);
          const r = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/predict/${ticker}`);
          setForecast(r.data.forecast || []);
          setRmse(r?.data?.metrics?.rmse ?? null);
          const rmse = r?.data?.metrics?.rmse;
          alert(`Model: Hybrid CNN-LSTM${rmse != null ? ` | Test RMSE: ${(+rmse).toFixed(3)}` : ""}`);
        }
      } else {
        alert("Prediction error");
      }
    } finally {
      setLoadingPred(false);
    }
  };

  // News
  const [news, setNews] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/news/${ticker}`);
        if (Array.isArray(r.data?.articles)) setNews(r.data.articles);
        else if (Array.isArray(r.data)) setNews(r.data);
        else setNews([]);
      } catch (e) {
        console.error("News API error:", e);
        setNews([]);
      }
    })();
  }, [ticker]);

  const avgPrice = prices.length > 0
    ? prices.reduce((sum, p) => sum + (p.c || 0), 0) / prices.length
    : null;

  const getRmseInfo = (rmse, avgPrice) => {
    if (rmse == null || avgPrice == null) {
      return { color: "text-gray-500", label: "N/A", percent: null };
    }

    const rel = (rmse / avgPrice) * 100;

    if (rel < 2) return { color: "text-green-600", label: "High Accuracy", percent: rel };
    if (rel < 5) return { color: "text-yellow-600", label: "Moderate Accuracy", percent: rel };
    return { color: "text-red-600", label: "Low Accuracy", percent: rel };
  };

  const chartData = (() => {
    if (!prices.length) return [];

    // last 30 days actual prices
    const last30 = prices.slice(-30).map((p) => ({
      date: new Date(p.t * 1000).toLocaleDateString(),
      actual: p.c,
      predicted: null,
      upper: null,
      lower: null
    }));

    // predictions
    const preds = forecast.map((x, i) => {
      const price = +x.close;

      const spread = rmse ? rmse * Math.sqrt(i + 1) : 0;

      return {
        date: `Day ${i + 1}`,
        actual: null,
        predicted: price,
        lower: price - spread,
        upper: price + spread
      };
    }); 

    const lastActual = last30.length > 0 ? last30[last30.length - 1] : null;

    let combined = [...last30];

    if (lastActual && preds.length > 0) {
      const firstPred = preds[0];

      // 🔥 connect smoothly by inserting transition point
      combined.push({
        date: "Transition",
        actual: lastActual.actual,
        predicted: lastActual.actual,
        lower: lastActual.actual,
        upper: lastActual.actual
      });

      combined = [...combined, ...preds];
    } else {
      combined = [...combined, ...preds];
    }

    return combined;
  })();

  const validValues = chartData.flatMap(d => {
    if (!d) return [];

    return [
      d.actual,
      d.predicted,
      d.lower,
      d.upper
    ].filter(v => v != null && !isNaN(v));
  });

  const yMin = Math.min(...validValues) * 0.995;
  const yMax = Math.max(...validValues) * 1.005;


  if (!info)
    return (
      <div>
        <Navbar />
        <div className="max-w-6xl mx-auto px-4 py-10">Loading…</div>
      </div>
    );

  
  return (
    <div>
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <img
            src={info.logo || "/logo-fallback.png"}
            alt="logo"
            className="w-12 h-12 rounded-xl border border-slate-200"
          />
          <div>
            <div className="text-2xl font-semibold">
              {info.longName || ticker}{" "}
              <span className="text-slate-500 text-base">({ticker})</span>
            </div>
            <div className="text-sm text-slate-600">
              {info.sector || "—"} · {info.industry || "—"}
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card p-4">
          <div className="font-semibold">About</div>
          <p className="text-sm text-slate-700 mt-2">{info.summary || "No description provided."}</p>
          <div className="text-xs text-slate-500 mt-2">
            Website:{" "}
            {info.website ? (
              <a className="underline" href={info.website} target="_blank" rel="noreferrer">
                {info.website}
              </a>
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="card p-4">
          <div className="font-semibold">Key Metrics</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
            <div>
              <div className="text-slate-500">Market Cap</div>
              <div className="font-medium">{info.marketCap ? info.marketCap.toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">PE (TTM)</div>
              <div className="font-medium">{info.trailingPE ?? "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">Forward PE</div>
              <div className="font-medium">{info.forwardPE ?? "—"}</div>
            </div>
            <div>
              <div className="text-slate-500">Dividend Yield</div>
              <div className="font-medium">
                {info.dividendYield != null ? `${(info.dividendYield * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Beta</div>
              <div className="font-medium">{info.beta ?? "—"}</div>
            </div>
            {technicals && (
              <>
                <div>
                  <div className="text-slate-500">Last Close</div>
                  <div className="font-medium">{technicals.lastClose ?? "—"}</div>
                </div>
                <div>
                  <div className="text-slate-500">Avg Vol (20d)</div>
                  <div className="font-medium">
                    {technicals.avgVolume20d ? Math.round(technicals.avgVolume20d).toLocaleString() : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">52W High</div>
                  <div className="font-medium">{technicals.high52w ?? "—"}</div>
                </div>
                <div>
                  <div className="text-slate-500">52W Low</div>
                  <div className="font-medium">{technicals.low52w ?? "—"}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Candles */}
        <div className="card p-4">
          <div className="font-semibold mb-2">Candlesticks</div>
          <CandleChart ticker={ticker} />
        </div>

        {/* Financials */}      
        <div className="card p-4">
          <FinancialChart financials={financials} ticker={ticker} />
        </div>

        {/* Indicators */}
        <div className="grid md:grid-cols-3 gap-4">
          <IndicatorChart title="RSI (14)" data={indicators.rsi} series={[{ key: "value", name: "RSI" }]} />
          <IndicatorChart
            title="MACD"
            data={indicators.macd}
            series={[
              { key: "macd", name: "MACD" },
              { key: "signal", name: "Signal" },
            ]}
            zeroLine
          />
          <IndicatorChart title="SMA 20" data={indicators.sma} series={[{ key: "value", name: "SMA 20" }]} />
        </div>

        {/* Prices table with weekly pagination */}
        <div className="card p-4 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Historical Prices</div>
            <div className="flex gap-2">
              <button onClick={() => setWeek(week + 1)} disabled={!hasOlderWeek} className="px-3 py-1.5 border rounded disabled:opacity-50">
                Show previous week
              </button>
              <button onClick={() => setWeek(Math.max(0, week - 1))} disabled={week === 0} className="px-3 py-1.5 border rounded disabled:opacity-50">
                Next week
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Close</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {visiblePrices.slice().reverse().map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="py-2">{new Date(d.t * 1000).toLocaleDateString()}</td>
                  <td>{(d.o ?? 0).toFixed(2)}</td>
                  <td>{(d.h ?? 0).toFixed(2)}</td>
                  <td>{(d.l ?? 0).toFixed(2)}</td>
                  <td>{(d.c ?? 0).toFixed(2)}</td>
                  <td>{d.v?.toLocaleString?.() ?? d.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-slate-500 mt-2">Showing week #{week + 1} (latest is week #1)</div>
        </div>

        {/* News Section */}
        <div className="card p-4">
          <div className="font-semibold mb-2">Latest News</div>
          {news.length > 0 ? (
            <ul className="space-y-2">
              {news.map((n, i) => (
                <li key={i} className="text-sm">
                  <a href={n.link} target="_blank" rel="noreferrer" className="underline">
                    {n.title}
                  </a>
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      n.sentiment === "positive" ? "bg-green-100 text-green-700" : n.sentiment === "negative" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {n.sentiment}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">No news available</div>
          )}
        </div>

        {/* Predict */}


        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-semibold">AI Price Prediction</div>
              <div className="text-sm text-slate-500">
                Next 7 trading days forecast using Hybrid CNN-LSTM model
              </div>
            </div>

            <button onClick={onPredict} disabled={loadingPred} className="px-5 py-2.5 rounded-xl bg-black text-white">
              {loadingPred ? "Predicting…" : "Run Prediction"}
            </button>
          </div>

          {rmse != null && (() => {
            const info = getRmseInfo(rmse, avgPrice);
            return (
              <div className={`mb-4 text-sm ${info.color}`}>
                RMSE: <span className="font-semibold">{(+rmse).toFixed(2)}</span>

                {info.percent != null && (
                  <span className="ml-2">
                    ({info.percent.toFixed(2)}%)
                  </span>
                )}

                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-100">
                  {info.label}
                </span>
              </div>
            );
          })()}

          {forecast.length > 0 ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {forecast.map((x, i) => (
                  <div key={i} className="border rounded-lg p-3 text-center bg-slate-50">
                    <div className="text-xs text-slate-500">Day {i + 1}</div>
                    <div className="text-lg font-semibold">₹{(+x.close).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              {/* 🔥 NEW COMBINED CHART */}
              <div className="mt-6 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>

                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[yMin, yMax]}
                      tickFormatter={(v) => v.toFixed(0)}
                    />
                    <Tooltip
                      formatter={(value) =>
                        value != null && !isNaN(value) ? `₹${value.toFixed(2)}` : ""
                      }
                    />

                    {/* Confidence Band */}
                    <Area
                      type="monotone"
                      dataKey="lower"
                      stackId="1"
                      stroke="none"
                      fill="transparent"
                    />

                    <Area
                      type="monotone"
                      dataKey="upper"
                      stackId="1"
                      stroke="none"
                      fill="#8884d8"
                      fillOpacity={0.25}
                    />
                    

                    {/* Actual Line */}
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={false}
                    />

                    {/* Prediction Line */}
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="#000"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                    />

                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500">
              Click "Run Prediction" to generate forecast
            </div>
          )}
        </div>



      </div>
    </div>
  );
}
