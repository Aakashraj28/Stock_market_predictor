# backend/app.py
import os, io, json, datetime as dt, time, traceback
from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
import yfinance as yf
import ta
import joblib
import requests
from textblob import TextBlob
import asyncio
import json
from pathlib import Path
from playwright.sync_api import sync_playwright



from symbols import load_symbols
from train import (
    load_history,
    make_features,      # optional export
    train_hybrid,
    predict_hybrid,
)

app = Flask(__name__)
CORS(app)

SYMBOLS = load_symbols()  # DataFrame with ticker,name,exchange

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

NEWSAPI_KEY = "66d85a5886fc410a93cb02134c6eb2ed"

# ---------- Helpers ----------
def safe_float(val):
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return None
        return f
    except Exception:
        return None

def compute_indicators(df: pd.DataFrame):
    result = {}
    df = df.copy()

    df["rsi"] = ta.momentum.RSIIndicator(df["Close"]).rsi()
    result["rsi"] = [
        {"t": int(pd.Timestamp(idx).timestamp()), "value": safe_float(val)}
        for idx, val in df["rsi"].items() if not pd.isna(val)
    ]

    df["sma20"] = df["Close"].rolling(20).mean()
    result["sma"] = [
        {"t": int(pd.Timestamp(idx).timestamp()), "value": safe_float(val)}
        for idx, val in df["sma20"].items() if not pd.isna(val)
    ]

    macd = ta.trend.MACD(df["Close"])
    macd_line = macd.macd(); macd_signal = macd.macd_signal(); macd_diff = macd.macd_diff()
    result["macd"] = []
    for idx in macd_line.index:
        result["macd"].append({
            "t": int(pd.Timestamp(idx).timestamp()),
            "macd": safe_float(macd_line.loc[idx]),
            "signal": safe_float(macd_signal.loc[idx]),
            "diff": safe_float(macd_diff.loc[idx]),
        })
    return result

def to_candles(df: pd.DataFrame):
    out = []
    for d, o, h, l, c, v in zip(df.index, df["Open"], df["High"], df["Low"], df["Close"], df["Volume"]):
        out.append(dict(
            t=int(pd.Timestamp(d).timestamp()),
            o=safe_float(o), h=safe_float(h), l=safe_float(l),
            c=safe_float(c), v=int(v) if not pd.isna(v) else 0
        ))
    return out

def get_profile(ticker: str):
    tk = yf.Ticker(ticker)
    info = {}
    try:
        raw = tk.get_info()
        info["longName"] = raw.get("longName") or raw.get("shortName") or ticker
        info["industry"] = raw.get("industry") or raw.get("category", "—")
        info["sector"] = raw.get("sector") or "—"
        info["website"] = raw.get("website")
        info["summary"] = raw.get("longBusinessSummary")
        info["logo"] = raw.get("logo_url") or None
        info["marketCap"] = safe_float(raw.get("marketCap"))
        info["trailingPE"] = safe_float(raw.get("trailingPE"))
        info["forwardPE"] = safe_float(raw.get("forwardPE"))
        info["dividendYield"] = safe_float(raw.get("dividendYield"))
        info["beta"] = safe_float(raw.get("beta"))
    except Exception:
        info = {
            "longName": ticker, "industry": "—", "sector": "—",
            "website": None, "summary": None, "logo": None,
            "marketCap": None, "trailingPE": None, "forwardPE": None,
            "dividendYield": None, "beta": None,
        }
    return info

# ---------- Routes ----------
@app.get("/api/search")
def search():
    q = (request.args.get("q") or "").lower()
    if not q:
        return jsonify(items=[])
    df = SYMBOLS.copy()
    mask = df["ticker"].str.lower().str.contains(q) | df["name"].str.lower().str.contains(q)
    items = df[mask].head(20).to_dict(orient="records")
    return jsonify(items=items)

@app.get("/api/top-movers")
def top_movers():
    universe = SYMBOLS.sample(min(50, len(SYMBOLS)), random_state=7) if len(SYMBOLS) > 0 else pd.DataFrame(columns=["ticker","name"])
    rows = []
    for _, row in universe.iterrows():
        t = row["ticker"]
        try:
            h = yf.Ticker(t).history(period="5d", interval="1d")
            if len(h) < 2:
                continue
            y = h["Close"].iloc[-1]; x = h["Close"].iloc[-2]
            change = (y - x) / x * 100.0
            rows.append({"ticker": t, "name": row["name"], "changePct": float(change)})
        except Exception:
            continue
    if not rows:
        return jsonify(gainers=[], losers=[])
    df = pd.DataFrame(rows)
    gainers = df.sort_values("changePct", ascending=False).head(5).to_dict(orient="records")
    losers  = df.sort_values("changePct", ascending=True).head(5).to_dict(orient="records")
    return jsonify(gainers=gainers, losers=losers)

@app.get("/api/company/<ticker>")
def company(ticker):
    period = request.args.get("period", "2y")  # e.g., 1mo, 6mo, 1y, 5y, max
    interval = request.args.get("interval", "1d")

    # ensure valid combos for yfinance
    valid_intervals = {
        "1mo": ["1d", "1h"],
        "3mo": ["1d", "1h"],
        "6mo": ["1d", "1h", "1wk"],
        "1y":  ["1d", "1wk"],
        "2y":  ["1d", "1wk"],
        "5y":  ["1d", "1wk", "1mo"],
        "10y": ["1wk", "1mo"],
        "ytd": ["1d", "1wk"],
        "max": ["1d", "1wk", "1mo"],
    }
    # fallback interval if invalid
    if period in valid_intervals and interval not in valid_intervals[period]:
        interval = valid_intervals[period][0]

    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval, auto_adjust=False)

    if df is None or df.empty:
        return jsonify(error=f"No data for {ticker} with period={period}, interval={interval}"), 404

    info = get_profile(ticker)
    indicators = compute_indicators(df.copy())
    candles = to_candles(df)

    last_close = safe_float(df["Close"].iloc[-1])
    last_volume = safe_float(df["Volume"].iloc[-1])
    last_date = df.index[-1].date().isoformat()
    window = df.tail(252)
    hi_52w = safe_float(window["High"].max()) if not window.empty else None
    lo_52w = safe_float(window["Low"].min()) if not window.empty else None
    avg_vol_20 = safe_float(df["Volume"].tail(20).mean()) if len(df) >= 20 else safe_float(df["Volume"].mean())

    technicals = {
        "lastClose": last_close,
        "lastVolume": last_volume,
        "lastDate": last_date,
        "high52w": hi_52w,
        "low52w": lo_52w,
        "avgVolume20d": avg_vol_20,
    }

    try:
        last_price = float(tk.fast_info.last_price)
    except Exception:
        last_price = last_close

    return jsonify(
        info=info,
        indicators=indicators,
        candles=candles,
        last=last_price,
        technicals=technicals,
    )



# --------- News (tightened query + proper shape) ----------
_news_cache = {}
CACHE_TTL = 60 * 15

@app.get("/api/news/<ticker>")
def company_news(ticker):
    now = time.time()
    if ticker in _news_cache and (now - _news_cache[ticker]["ts"] < CACHE_TTL):
        return jsonify({"articles": _news_cache[ticker]["data"]})

    try:
        profile = get_profile(ticker)
        company_name = profile.get("longName") or ticker
        query = f"({company_name}) AND (stock OR shares OR trading OR results OR earnings OR NSE OR BSE)"
        url = (
            "https://newsapi.org/v2/everything?"
            f"q={requests.utils.quote(query)}&language=en&sortBy=publishedAt&pageSize=10&apiKey={NEWSAPI_KEY}"
        )
        r = requests.get(url, timeout=6)
        data = r.json()
        if data.get("status") != "ok":
            return jsonify(error="Failed to fetch news", detail=data), 500

        arts = []
        for it in data.get("articles", []):
            head = it.get("title") or ""
            link = it.get("url") or ""
            pub  = it.get("publishedAt") or ""
            score = TextBlob(head).sentiment.polarity
            senti = "positive" if score > 0.2 else "negative" if score < -0.2 else "neutral"
            arts.append({"title": head, "link": link, "published": pub, "sentiment": senti})

        _news_cache[ticker] = {"ts": now, "data": arts}
        return jsonify({"articles": arts})
    except Exception as e:
        return jsonify(error=str(e)), 500

# --------- Hybrid training / prediction ----------
@app.post("/api/train/<ticker>")
def train_endpoint(ticker):
    # Hybrid is now the default trainer for accuracy
    try:
        hist = load_history(ticker, period="5y")
        if hist.empty:
            return jsonify(error=f"No historical data for {ticker}"), 400
        if len(hist) < 300:
            return jsonify(error=f"Not enough data to train model for {ticker} (have {len(hist)})"), 400

        out = train_hybrid(ticker, period="5y")
        return jsonify(ok=True, metrics=out["metrics"], plot=out["plot"])
    except Exception as e:
        print(f"[ERROR] Training failed for {ticker}: {e}")
        traceback.print_exc()
        return jsonify(error=f"Training failed: {e}"), 400

@app.get("/api/predict/<ticker>")
def predict_endpoint(ticker):
    # Hybrid predictor for 7 trading days
    try:
        # Check artifacts exist
        need = [f"{ticker}_cnn(c+l).pkl", f"{ticker}_lstm(c+l).keras", f"{ticker}_lstm_scaler(c+l).pkl", f"{ticker}_blend(c+l).pkl", f"{ticker}_hybrid_meta(c+l).json"]
        if not all(os.path.exists(os.path.join(MODELS_DIR, p)) for p in need):
            return jsonify(error="model not trained"), 404

        fc = predict_hybrid(ticker, horizon=7)
        meta = json.load(open(os.path.join(MODELS_DIR, f"{ticker}_hybrid_meta(c+l).json")))

        # ✅ --- NEW: Check model age ---
        trained_at = meta.get("trained_at")
        is_stale = False

        if trained_at:
            trained_time = dt.datetime.fromisoformat(trained_at.replace("Z", "+00:00"))
            now = dt.datetime.utcnow().replace(tzinfo=trained_time.tzinfo)
            age_days = (now - trained_time).days

            if age_days > 7:
                is_stale = True
        # --------------------------------

        # Provide blended RMSE estimate (from training)
        rmse_est = meta.get("metrics", {}).get("hybrid_rmse", None) if isinstance(meta, dict) else None
        return jsonify(model="Hybrid(LSTM+CNN)", metrics={"rmse": rmse_est}, forecast=fc, is_stale=is_stale)
    except Exception as e:
        print(f"[ERROR] Training failed for {ticker}: {e}")
        traceback.print_exc()
        return jsonify(error=str(e)), 500

# ---------- NSE Event Calendar ----------


EVENTS_CACHE = {}
EVENTS_CACHE_TTL = 60 * 60 * 24  # 24 hours


def fetch_event_calendar():
    now = time.time()
    if "all" in EVENTS_CACHE and (now - EVENTS_CACHE["all"]["ts"] < EVENTS_CACHE_TTL):
        return EVENTS_CACHE["all"]["data"]

    events = []

    with sync_playwright() as p:
        # Force HTTP/1.1 instead of HTTP/2
        browser = p.chromium.launch(
            headless=False,  # try visible first; change to True later
            args=[
                "--disable-http2", 
                "--disable-blink-features=AutomationControlled"
            ]
        )

        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="en-US",
        )

        page = context.new_page()

        # Step 1: Try loading homepage (get cookies)
        try:
            page.goto("https://www.nseindia.com", wait_until="domcontentloaded", timeout=60000)
            time.sleep(3)
        except Exception as e:
            print("Homepage load failed:", e)

        # Step 2: Fetch API with cookies
        headers = {
            "User-Agent": page.evaluate("() => navigator.userAgent"),
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-event-calendar",
            "Connection": "keep-alive",
        }

        response = context.request.get(
            "https://www.nseindia.com/api/event-calendar",
            headers=headers,
        )

        if response.ok:
            data = response.json()
            for item in data:
                dt = pd.to_datetime(item.get("date"), errors="coerce")
                events.append({
                    "symbol": item.get("symbol"),
                    "company": item.get("company"),
                    "purpose": item.get("purpose"),
                    "description": item.get("bm_desc"),
                    "date": dt.date().isoformat() if pd.notna(dt) else None
                })
        else:
            print("API failed:", response.status, response.text()[:200])

        browser.close()

    EVENTS_CACHE["all"] = {"ts": now, "data": events}
    return events


@app.get("/api/events")
def events_upcoming():
    try:
        events = fetch_event_calendar()
        today = pd.Timestamp.today().normalize()
        next_week = today + pd.Timedelta(days=7)
        upcoming = [
            ev for ev in events
            if ev["date"] is not None and today <= pd.to_datetime(ev["date"]) <= next_week
        ]
        return jsonify({"upcoming": upcoming})
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/api/events/all")
def events_all():
    try:
        events = fetch_event_calendar()
        return jsonify({"events": events})
    except Exception as e:
        return jsonify(error=str(e)), 500

def _get_val_from_df_cell(df_col, key_candidates):
    for k in key_candidates:
        if k in df_col.index:
            return safe_float(df_col.get(k))
    for idx in df_col.index:
        if str(idx).strip().lower() in [kk.strip().lower() for kk in key_candidates]:
            return safe_float(df_col.get(idx))
    return None

def normalize_financial_records(df: pd.DataFrame):
    """
    Normalize yfinance financials into dict keyed by date.
    """
    if df is None or df.empty:
        return {}

    out = {}
    candidates = {
        "total_revenue": ["Total Revenue", "totalRevenue", "Revenue", "total_revenue", "TotalRevenue"],
        "net_income": ["Net Income", "NetIncome", "Net Profit", "Net_Income", "netIncome"],
        "diluted_eps": ["Diluted EPS", "DilutedEPSEarnings", "Diluted_EPS", "EPS (Diluted)", "DilutedEPS"],
        "operating_cash_flow": ["Operating Cash Flow", "Total Cash From Operating Activities", "operatingCashFlow", "operating_cash_flow"],
        "capital_expenditure": ["Capital Expenditure", "Capital Expenditures", "CapEx", "capitalExpenditure", "capital_expenditure"],
        "total_debt": ["Total Debt", "totalDebt", "Long Term Debt", "longTermDebt", "TotalDebt"],
        "total_equity": ["Total Equity", "Total shareholders' equity", "totalStockholderEquity", "total_equity", "TotalEquity"],
    }

    for col in df.columns:
        date_label = str(col.date()) if hasattr(col, "date") else str(col)
        rec = {"date": date_label}
        for outkey, keys in candidates.items():
            val = None
            try:
                val = _get_val_from_df_cell(df[col], keys)
            except Exception:
                val = None
            rec[outkey] = safe_float(val)
        out[date_label] = rec

    return out

def extract_equity(df: pd.DataFrame):
    """Try to extract equity with fallbacks."""
    if df is None or df.empty:
        return {}
    out = {}
    for col in df.columns:
        date = str(col.date()) if hasattr(col, "date") else str(col)
        val = None
        try:
            if "Total Equity Gross Minority Interest" in df.index:
                val = df.at["Total Equity Gross Minority Interest", col]
            elif "Ordinary Shares Equity" in df.index:
                val = df.at["Ordinary Shares Equity", col]
            elif "Total Stockholder Equity" in df.index:
                val = df.at["Total Stockholder Equity", col]
            elif (
                "Total Assets" in df.index
                and "Total Liabilities Net Minority Interest" in df.index
            ):
                val = (
                    df.at["Total Assets", col]
                    - df.at["Total Liabilities Net Minority Interest", col]
                )
        except Exception:
            val = None
        out[date] = safe_float(val)
    return out

def merge_by_date(*dicts, equity_map=None):
    merged = {}
    for d in dicts:
        for date, rec in d.items():
            if date not in merged:
                merged[date] = {"date": date}
            for k, v in rec.items():
                if k == "date":
                    continue
                if v is not None:
                    merged[date][k] = safe_float(v)
    # inject equity
    if equity_map:
        for date, val in equity_map.items():
            if date not in merged:
                merged[date] = {"date": date}
            merged[date]["total_equity"] = safe_float(val)
    out = list(merged.values())
    out.sort(key=lambda r: r.get("date", ""), reverse=True)
    return out

# ---------- Financials API ----------
@app.get("/api/financials/<ticker>")
def financials(ticker):
    try:
        tk = yf.Ticker(ticker)

        quarterly_fin = tk.quarterly_financials
        annual_fin = tk.financials
        quarterly_bs = tk.quarterly_balance_sheet
        annual_bs = tk.balance_sheet
        quarterly_cf = tk.quarterly_cashflow
        annual_cf = tk.cashflow

        q_income = normalize_financial_records(quarterly_fin)
        a_income = normalize_financial_records(annual_fin)
        q_balance = normalize_financial_records(quarterly_bs)
        a_balance = normalize_financial_records(annual_bs)
        q_cf = normalize_financial_records(quarterly_cf)
        a_cf = normalize_financial_records(annual_cf)

        q_equity = extract_equity(quarterly_bs)
        a_equity = extract_equity(annual_bs)

        quarterly_merged = merge_by_date(q_income, q_balance, q_cf, equity_map=q_equity)
        annual_merged = merge_by_date(a_income, a_balance, a_cf, equity_map=a_equity)

        return jsonify({
            "quarterly": quarterly_merged,
            "annual": annual_merged,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 500





if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
