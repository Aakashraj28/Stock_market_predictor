# Stock Market Dashboard & Price Predictor (Prophet Edition)

Full-stack project (React + Tailwind + Flask) with **Prophet** forecasting and **separate train/test** workflow. Includes full **NSE & BSE** search, live data via **yfinance**, candlesticks, indicators, and 7‑day forecasts.

## Features
- Home: “Start your stock market journey” + CTA
- Explore: search across **all NSE & BSE** companies (cached & refreshed), Top 5 **gainers/losers**
- Company: logo, summary, candlestick chart, RSI/MACD/SMA charts, historical table
- ML: **Prophet** with proper **train/test split**, metrics (RMSE/MAE) saved, and a test-set comparison plot
- Predict endpoint loads the saved model and forecasts the next **7 trading days**

## Backend endpoints
- `GET /api/search?q=` – full-text search (NSE/BSE)  
- `GET /api/top-movers` – top 5 gainers/losers (sampled universe for responsiveness)  
- `GET /api/company/<ticker>` – profile + 2y candles + indicators (live yfinance)  
- `POST /api/train/<ticker>` – train Prophet, save model + metrics + test plot  
- `GET /api/predict/<ticker>` – load saved model, return next 7 closes

## How search coverage works (NSE & BSE)
On startup, backend tries to download the latest symbol lists:
- **NSE** from NSE archives CSV → symbols saved to `backend/data/symbols_nse.csv`
- **BSE** from a public mirror CSV (mapped to `.BO`) → saved to `backend/data/symbols_bse.csv`  
These are cached for 7 days and auto-refreshed.

## Setup

### 1) Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
> First run will download NSE/BSE symbol lists and may compile Prophet backend (CmdStan).

### 2) Frontend
```bash
cd frontend
npm i
npm run dev
```

### 3) Train a model (separate step)
Use the API from the UI (Company → Predict button will prompt training if needed) **or** the CLI:
```bash
cd backend
python train.py TCS.NS
# or any NSE like RELIANCE.NS / BSE like 500325.BO
```
Artifacts are saved in `backend/models/`:
- `<TICKER>_prophet.pkl` – trained model
- `<TICKER>_metrics.json` – metrics incl. RMSE/MAE, points, timestamp
- `<TICKER>_test_plot.png` – chart for your report

## Notes
- yfinance provides near-real-time data (subject to provider delays). Indicators and candles refresh each request.
- Top movers use a random sample of ~50 tickers for speed; expand if you want more exhaustive scanning.
- Prophet can be tuned further (holidays, changepoints). Keep defaults for a balanced, student‑friendly baseline.
- For deterministic results in reports, run training on the same machine; save metrics and plot with your submission.

## License
MIT
