// src/components/FinancialChart.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

export default function FinancialChart({ financials, ticker }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("annual"); // annual | quarterly

  const { annualData, quarterlyData } = useMemo(() => {
    const toArray = (maybe) => {
      if (!maybe) return [];
      if (Array.isArray(maybe)) return maybe;
      // Already normalized: if object with arrays, return its arrays
      if (maybe.annual && Array.isArray(maybe.annual)) return maybe.annual;
      // fallback if the API returned { annual: [...], quarterly: [...] }
      return [];
    };

    // The Company page stores { annual: [...], quarterly: [...] }
    const annual = (financials && financials.annual) || [];
    const quarterly = (financials && financials.quarterly) || [];

    const normalize = (arr, limit = 8) => {
      return (arr || [])
        .map((r) => {
          // r expected to have keys: date, total_revenue, net_income, diluted_eps, operating_cash_flow, capital_expenditure, total_debt, total_equity
          const date = r.date || r.period || r.Date || "";
          const rev = Number(r.total_revenue || r.revenue || 0) || 0;
          const ni = Number(r.net_income || 0) || 0;
          const opcf = Number(r.operating_cash_flow || 0) || 0;
          const capex = Number(r.capital_expenditure || r.capital_expenditures || 0) || 0;
          const debt = Number(r.total_debt || 0) || 0;
          const equity = Number(r.total_equity || r.total_stockholders_equity || 0) || 0;
          const eps = r.diluted_eps ?? r.diluted_eps ?? null;

          const netMargin = rev !== 0 ? (ni / rev) * 100 : null;

          return {
            date,
            revenue: rev,
            netIncome: ni,
            netMargin,
            dilutedEps: eps,
            operatingCashFlow: opcf,
            capitalExpenditure: capex,
            totalDebt: debt,
            totalEquity: equity,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-limit);
    };

    return {
      annualData: normalize(annual, 8),
      quarterlyData: normalize(quarterly, 12),
    };
  }, [financials]);

  const dataset = mode === "annual" ? annualData : quarterlyData;

  const fmtMoney = (v) => {
    if (v == null || isNaN(v)) return "—";
    const n = Math.abs(v);
    if (n >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (n >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (v / 1e3).toFixed(2) + "K";
    return v.toLocaleString();
  };

  if (!dataset || dataset.length === 0) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Financials</div>
          <div>
            <button onClick={() => setMode("annual")} className={`px-2 py-1 mr-1 rounded text-sm ${mode === "annual" ? "bg-black text-white" : "border"}`}>Annual</button>
            <button onClick={() => setMode("quarterly")} className={`px-2 py-1 rounded text-sm ${mode === "quarterly" ? "bg-black text-white" : "border"}`}>Quarterly</button>
          </div>
        </div>
        <div className="text-sm text-slate-500">No financial data available</div>
        <div className="mt-3 text-right">
          {ticker && <button onClick={() => navigate(`/company/${ticker}/financials`)} className="text-sm px-3 py-1 bg-blue-600 text-white rounded">View details →</button>}
        </div>
      </div>
    );
  }

  const maxRev = Math.max(...dataset.map((d) => Math.abs(d.revenue || 0)), 0);
  const leftDomainMax = maxRev ? Math.ceil(maxRev * 1.2) : "auto";

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">Financials ({mode === "annual" ? "Annual" : "Quarterly"})</div>
        <div>
          <button onClick={() => setMode("annual")} className={`px-2 py-1 mr-1 rounded text-sm ${mode === "annual" ? "bg-black text-white" : "border"}`}>Annual</button>
          <button onClick={() => setMode("quarterly")} className={`px-2 py-1 rounded text-sm ${mode === "quarterly" ? "bg-black text-white" : "border"}`}>Quarterly</button>
        </div>
      </div>

      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={dataset} margin={{ top: 10, right: 50, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.6} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="money" tickFormatter={(v) => fmtMoney(v)} width={90} domain={[0, leftDomainMax]} />
            <YAxis yAxisId="percent" orientation="right" tickFormatter={(v) => (v == null ? "" : `${v.toFixed(1)}%`)} domain={[0, "dataMax + 5"]} />
            <Tooltip
              formatter={(value, name) => {
                if (name === "netMargin") return [`${value != null ? value.toFixed(2) + "%" : "—"}`, "Net Margin"];
                if (name === "revenue" || name === "netIncome") return [fmtMoney(value), name === "revenue" ? "Revenue" : "Net Income"];
                return [value, name];
              }}
              labelFormatter={(label) => `Period: ${label}`}
            />
            <Legend verticalAlign="bottom" height={36} />
            <Bar yAxisId="money" dataKey="revenue" name="Revenue" barSize={28} fill="#2563eb" radius={[6,6,0,0]} />
            <Bar yAxisId="money" dataKey="netIncome" name="Net Income" barSize={16} fill="#16a34a" radius={[6,6,0,0]} />
            <Line yAxisId="percent" type="monotone" dataKey="netMargin" name="Net Margin %" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-slate-500">Bars: Revenue & Net Income • Line: Net Margin %</div>
        <div>
          {ticker && <button onClick={() => navigate(`/company/${ticker}/financials`)} className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">View details →</button>}
        </div>
      </div>
    </div>
  );
}
