import os, io, time, requests, pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
NSE_PATH = os.path.join(DATA_DIR, 'symbols_nse.csv')
BSE_PATH = os.path.join(DATA_DIR, 'symbols_bse.csv')

NSE_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv'
BSE_URL = 'https://www.bseindia.com/corporates/List_Scrips.aspx'  # requires query to get CSV; we use a pre-scraped mirror below
BSE_CSV_MIRROR = 'https://github.com/mbzuai-oss/india-markets-data/raw/main/bse_equity_list.csv'

HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'text/csv,application/json,*/*'}

def fetch_nse():
    r = requests.get(NSE_URL, headers=HEADERS, timeout=20)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    # Map to yfinance ticker format: append .NS
    df['ticker'] = (df['SYMBOL'].astype(str).str.strip() + '.NS')
    df['name'] = df['NAME OF COMPANY'].astype(str).str.strip()
    df['exchange'] = 'NSE'
    out = df[['ticker','name','exchange']].drop_duplicates()
    out.to_csv(NSE_PATH, index=False)
    return out

def fetch_bse():
    # Try mirror (raw CSV on GitHub). If fails, just return empty to avoid blocking.
    try:
        r = requests.get(BSE_CSV_MIRROR, headers=HEADERS, timeout=20)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text))
        # yfinance uses .BO for BSE
        df['ticker'] = df['Security Code'].astype(str).str.zfill(6) + '.BO'
        df['name'] = df['Security Name'].astype(str).str.strip()
        df['exchange'] = 'BSE'
        out = df[['ticker','name','exchange']].drop_duplicates()
        out.to_csv(BSE_PATH, index=False)
        return out
    except Exception:
        if os.path.exists(BSE_PATH):
            return pd.read_csv(BSE_PATH)
        return pd.DataFrame(columns=['ticker','name','exchange'])

def load_symbols():
    nse,bse = None,None
    try:
        if not os.path.exists(NSE_PATH) or (time.time()-os.path.getmtime(NSE_PATH) > 86400*7):
            nse = fetch_nse()
        else:
            nse = pd.read_csv(NSE_PATH)
    except Exception:
        nse = pd.read_csv(NSE_PATH) if os.path.exists(NSE_PATH) else pd.DataFrame(columns=['ticker','name','exchange'])
    try:
        if not os.path.exists(BSE_PATH) or (time.time()-os.path.getmtime(BSE_PATH) > 86400*7):
            bse = fetch_bse()
        else:
            bse = pd.read_csv(BSE_PATH)
    except Exception:
        bse = pd.read_csv(BSE_PATH) if os.path.exists(BSE_PATH) else pd.DataFrame(columns=['ticker','name','exchange'])
    return pd.concat([nse,bse], ignore_index=True).drop_duplicates()
