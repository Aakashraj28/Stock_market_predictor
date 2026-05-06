// src/pages/Financials.jsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "../components/Navbar";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export default function Financials() {
  const { ticker } = useParams();
  const [finData, setFinData] = useState(null);
  const [mode, setMode] = useState("quarterly");

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`https://stock-market-predictor-backend-a8v3.onrender.com/api/financials/${ticker}`);
        setFinData(r.data);
      } catch (e) {
        console.error("Financials API error", e);
        setFinData(null);
      }
    })();
  }, [ticker]);

  if (!finData) return (
    <div>
      <Navbar />
      <div className="p-6">Loading…</div>
    </div>
  );

  // finData[mode] expected to be an array of normalized records with keys as in the backend
  const raw = finData[mode] || [];
  const dataset = (raw || []).map((r) => {
    const rec = { ...r };
    rec.date = rec.date || "";
    // ensure numbers
    rec.total_revenue = Number(rec.total_revenue || 0);
    rec.net_income = Number(rec.net_income || 0);
    rec.diluted_eps = rec.diluted_eps != null ? Number(rec.diluted_eps) : null;
    rec.operating_cash_flow = Number(rec.operating_cash_flow || 0);
    rec.capital_expenditure = Number(rec.capital_expenditure || 0);
    rec.total_debt = Number(rec.total_debt || 0);
    rec.total_equity = Number(rec.total_equity || 0);
    rec.net_margin_pct = rec.total_revenue ? (rec.net_income / rec.total_revenue) * 100 : null;
    return rec;
  });

  const moneyFmt = (v) => {
    if (v == null || isNaN(v)) return "-";
    const n = Math.abs(v);
    if (n >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (n >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return v.toLocaleString();
  };

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Financials – {ticker}</h1>
          <div className="flex gap-2">
            <button onClick={() => setMode("quarterly")} className={`px-3 py-1 border rounded ${mode==="quarterly"?"bg-black text-white":"bg-white"}`}>Quarterly</button>
            <button onClick={() => setMode("annual")} className={`px-3 py-1 border rounded ${mode==="annual"?"bg-black text-white":"bg-white"}`}>Annually</button>
          </div>
        </div>

        {/* Revenue & Net Income */}
        <div className="card p-4 h-80">
          <div className="font-semibold mb-2">Revenue & Net Income</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataset}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(v) => (v / 1e9).toFixed(1) + "B"} />
              <Tooltip formatter={(v) => moneyFmt(v)} />
              <Legend />
              <Bar dataKey="total_revenue" fill="#2563eb" name="Revenue" />
              <Bar dataKey="net_income" fill="#16a34a" name="Net Income" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* EPS & Net Margin */}
        <div className="card p-4 h-80">
          <div className="font-semibold mb-2">EPS & Net Margin %</div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataset}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(v) => (v == null ? "-" : v)} />
              <Legend />
              <Line type="monotone" dataKey="diluted_eps" stroke="#9333ea" name="Diluted EPS" />
              <Line type="monotone" dataKey="net_margin_pct" stroke="#dc2626" name="Net Margin %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cash Flow */}
        <div className="card p-4 h-80">
          <div className="font-semibold mb-2">Cash Flow</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataset}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(v) => (v / 1e9).toFixed(1) + "B"} />
              <Tooltip formatter={(v) => moneyFmt(v)} />
              <Legend />
              <Bar dataKey="operating_cash_flow" fill="#0ea5e9" name="Operating CF" />
              <Bar dataKey="capital_expenditure" fill="#f97316" name="CapEx" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Balance: Debt vs Equity */}
        <div className="card p-4 h-80">
          <div className="font-semibold mb-2">Debt vs Equity</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataset}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(v) => (v / 1e9).toFixed(1) + "B"} />
              <Tooltip formatter={(v) => moneyFmt(v)} />
              <Legend />
              <Bar dataKey="total_debt" fill="#ef4444" name="Debt" />
              <Bar dataKey="total_equity" fill="#22c55e" name="Equity" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Summary table */}
        <div className="card p-4 overflow-x-auto">
          <div className="font-semibold mb-2">Summary</div>
          <table className="min-w-full text-sm border">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-2 py-1 border">Date</th>
                <th className="px-2 py-1 border">Revenue</th>
                <th className="px-2 py-1 border">Net Income</th>
                <th className="px-2 py-1 border">EPS</th>
                <th className="px-2 py-1 border">Net Margin %</th>
                <th className="px-2 py-1 border">Debt</th>
                <th className="px-2 py-1 border">Equity</th>
              </tr>
            </thead>
            <tbody>
              {dataset.slice(0, 12).map((row, i) => (
                <tr key={i} className="text-center">
                  <td className="border px-2 py-1">{row.date}</td>
                  <td className="border px-2 py-1">{row.total_revenue ? (row.total_revenue / 1e9).toFixed(1) + "B" : "-"}</td>
                  <td className="border px-2 py-1">{row.net_income ? (row.net_income / 1e9).toFixed(1) + "B" : "-"}</td>
                  <td className="border px-2 py-1">{row.diluted_eps != null ? row.diluted_eps : "-"}</td>
                  <td className="border px-2 py-1">{row.net_margin_pct != null ? Number(row.net_margin_pct).toFixed(2) + "%" : "-"}</td>
                  <td className="border px-2 py-1">{row.total_debt ? (row.total_debt / 1e9).toFixed(1) + "B" : "-"}</td>
                  <td className="border px-2 py-1">{row.total_equity ? (row.total_equity / 1e9).toFixed(1) + "B" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
