# backend/train.py
import os, json, argparse, datetime as dt, warnings
warnings.filterwarnings("ignore")

# ---- Matplotlib headless ----
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import numpy as np
import pandas as pd
import yfinance as yf

from sklearn.linear_model import Ridge
from sklearn.metrics import mean_squared_error, mean_absolute_error
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split

from prophet import Prophet  # optional, unused here
import joblib
import ta
import tensorflow as tf
from tensorflow.keras import layers, callbacks, models

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# --------------------------
# Data
# --------------------------
def load_history(ticker, period="5y", interval="1d"):
    tk = yf.Ticker(ticker)
    df = tk.history(period=period, interval=interval, auto_adjust=False)
    if df is None or df.empty:
        return pd.DataFrame()
    df = df.reset_index().rename(columns={"Date": "ds"})
    df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
    df = df[["ds", "Open", "High", "Low", "Close", "Volume"]].dropna().copy()
    return df

# --------------------------
# Feature Engineering
# --------------------------
def make_features(df: pd.DataFrame, max_lag=30):
    df = df.copy()
    df["ret_1"] = df["Close"].pct_change(1)
    df["ret_5"] = df["Close"].pct_change(5)
    df["ret_10"] = df["Close"].pct_change(10)
    for k in range(1, max_lag + 1):
        df[f"lag_{k}"] = df["Close"].shift(k)
    for win in (7, 14, 30):
        df[f"ma_{win}"] = df["Close"].rolling(win).mean()
        df[f"std_{win}"] = df["Close"].rolling(win).std()
    try:
        df["rsi_14"] = ta.momentum.RSIIndicator(close=df["Close"], window=14).rsi()
        macd = ta.trend.MACD(close=df["Close"], window_slow=26, window_fast=12, window_sign=9)
        df["macd"] = macd.macd()
        df["macd_signal"] = macd.macd_signal()
        bb = ta.volatility.BollingerBands(close=df["Close"], window=20, window_dev=2)
        df["bb_percB"] = bb.bollinger_pband()
    except Exception:
        df["rsi_14"] = df["macd"] = df["macd_signal"] = df["bb_percB"] = np.nan
    df["dow"] = df["ds"].dt.weekday
    df["month"] = df["ds"].dt.month
    df["y"] = df["Close"].shift(-1)
    df = df.dropna().reset_index(drop=True)
    feature_cols = [c for c in df.columns if c not in ("ds", "y")]
    return df[["ds"] + feature_cols + ["y"]], feature_cols

# --------------------------
# LSTM
# --------------------------
def build_lstm_dataset(series: np.ndarray, seq_len=60):
    X, y = [], []
    for i in range(seq_len, len(series)):
        X.append(series[i-seq_len:i])
        y.append(series[i])
    X = np.array(X)[:, :, None]
    y = np.array(y)
    return X, y

def train_lstm(df: pd.DataFrame, seq_len=60, val_size=0.1, epochs=200, batch=32):
    close = df["Close"].values.reshape(-1, 1)
    scaler = MinMaxScaler()
    close_scaled = scaler.fit_transform(close).flatten()
    X, y = build_lstm_dataset(close_scaled, seq_len=seq_len)
    ds = df["ds"].values[seq_len:]
    split = int(0.8 * len(X))
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]
    ds_train, ds_test = ds[:split], ds[split:]
    es = callbacks.EarlyStopping(monitor="val_loss", patience=20, restore_best_weights=True)
    rlrop = callbacks.ReduceLROnPlateau(monitor="val_loss", patience=8, factor=0.5)
    model = models.Sequential([
        layers.Input(shape=(X.shape[1], 1)),    
        layers.LSTM(64, return_sequences=True),
        layers.LSTM(32),
        layers.Dense(16, activation="relu"),
        layers.Dense(1)
    ])
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse")
    model.fit(X_train, y_train, validation_split=val_size, epochs=epochs,
              batch_size=batch, verbose=0, callbacks=[es, rlrop])
    pred_scaled = model.predict(X_test, verbose=0).flatten()
    y_test_inv = scaler.inverse_transform(y_test.reshape(-1,1)).flatten()
    pred_inv = scaler.inverse_transform(pred_scaled.reshape(-1,1)).flatten()
    rmse = float(np.sqrt(mean_squared_error(y_test_inv, pred_inv)))
    mae  = float(mean_absolute_error(y_test_inv, pred_inv))
    lstm_path = os.path.join(MODELS_DIR, "tmp_lstm(c+l).keras")
    model.save(lstm_path)
    return {"model_path": lstm_path, "scaler": scaler, "seq_len": int(seq_len),
            "rmse": rmse, "mae": mae, "ds_test": ds_test,
            "y_test": y_test_inv, "y_pred": pred_inv}

# --------------------------
# CNN
# --------------------------
def train_cnn(df, feature_cols):
    X = df[feature_cols].values
    y = df["y"].values

    feat_scaler = StandardScaler()
    X = feat_scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
    X_train_c = X_train.reshape((X_train.shape[0], X_train.shape[1], 1))
    X_test_c  = X_test.reshape((X_test.shape[0], X_test.shape[1], 1))

    es = callbacks.EarlyStopping(monitor="val_loss", patience=30, restore_best_weights=True)
    rlrop = callbacks.ReduceLROnPlateau(monitor="val_loss", patience=10, factor=0.5)

    input_shape = (X_train_c.shape[1], 1)
    cnn = models.Sequential([
        layers.Input(shape=input_shape),
        layers.Conv1D(128, kernel_size=3, padding="same", activation="relu"),
        layers.BatchNormalization(),
        layers.Conv1D(64, kernel_size=3, padding="same", activation="relu"),
        layers.BatchNormalization(),
        layers.GlobalAveragePooling1D(),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.3),
        layers.Dense(64, activation="relu"),
        layers.Dense(1)
    ])

    cnn.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="mse")
    cnn.fit(X_train_c, y_train, validation_split=0.1, epochs=300, batch_size=32,
            verbose=0, callbacks=[es, rlrop])

    y_pred = cnn.predict(X_test_c, verbose=0).flatten()
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    mae = float(mean_absolute_error(y_test, y_pred))

    eval_out = {"X_test": X_test, "y_test": y_test, "y_pred": y_pred,
                "rmse": rmse, "mae": mae, "scaler": feat_scaler}
    return cnn, eval_out

# --------------------------
# Hybrid (CNN + LSTM + Ridge)
# --------------------------
def train_hybrid(ticker: str, period="5y"):
    raw = load_history(ticker, period=period)
    if raw.empty or len(raw) < 300:
        raise RuntimeError(f"Not enough data to train for {ticker} (have {len(raw)} rows).")

    feat_df, feature_cols = make_features(raw, max_lag=30)
    cnn_model, cnn_eval = train_cnn(feat_df, feature_cols)
    lstm_out = train_lstm(raw, seq_len=60, epochs=300, batch=64)

    n_cnn_test = len(cnn_eval["y_test"])
    cnn_test_ds = feat_df["ds"].values[-n_cnn_test:]
    ds_lstm = lstm_out["ds_test"]
    ytrue_lstm = lstm_out["y_test"]
    ypred_lstm = lstm_out["y_pred"]

    df_c = pd.DataFrame({"ds": cnn_test_ds, "y_true_cnn": cnn_eval["y_test"], "cnn_pred": cnn_eval["y_pred"]})
    df_l = pd.DataFrame({"ds": ds_lstm, "y_true_lstm": ytrue_lstm, "lstm_pred": ypred_lstm})
    df_blend = pd.merge(df_c, df_l, on="ds", how="inner")

    # ---------------------------
    # Train blending model (Ridge)
    # ---------------------------
    if len(df_blend) < 50:
        blend = Ridge(alpha=1.0)
        w = np.array([0.5, 0.5])
        df_blend["blend_pred"] = 0.5 * df_blend["cnn_pred"] + 0.5 * df_blend["lstm_pred"]
    else:
        X_blend = df_blend[["cnn_pred", "lstm_pred"]].values
        y_blend = df_blend["y_true_lstm"].values
        blend = Ridge(alpha=1.0)
        blend.fit(X_blend, y_blend)
        df_blend["blend_pred"] = blend.predict(X_blend)
        w = np.r_[blend.coef_, blend.intercept_]

    # ---------------------------
    # Evaluate hybrid blend model
    # ---------------------------
    if "blend_pred" in df_blend:
        hybrid_rmse = float(np.sqrt(mean_squared_error(df_blend["y_true_lstm"], df_blend["blend_pred"])))
        hybrid_mae = float(mean_absolute_error(df_blend["y_true_lstm"], df_blend["blend_pred"]))
    else:
        hybrid_rmse = hybrid_mae = None

    
    # Save models and metadata
    
    cnn_keras_path = os.path.join(MODELS_DIR, f"{ticker}_cnn(c+l).keras")
    cnn_model.save(cnn_keras_path)
    scaler_path_feats = os.path.join(MODELS_DIR, f"{ticker}_cnn_scaler(c+l).pkl")
    joblib.dump(cnn_eval["scaler"], scaler_path_feats)

    cnn_wrapper_path = os.path.join(MODELS_DIR, f"{ticker}_cnn(c+l).pkl")
    wrapper = {"model_type": "keras_cnn", "keras_path": cnn_keras_path, "feat_scaler": scaler_path_feats}
    joblib.dump(wrapper, cnn_wrapper_path)

    lstm_path = os.path.join(MODELS_DIR, f"{ticker}_lstm(c+l).keras")
    tf.keras.models.load_model(lstm_out["model_path"]).save(lstm_path)
    scaler_path = os.path.join(MODELS_DIR, f"{ticker}_lstm_scaler(c+l).pkl")
    joblib.dump(lstm_out["scaler"], scaler_path)
    blender_path = os.path.join(MODELS_DIR, f"{ticker}_blend(c+l).pkl")
    joblib.dump(blend, blender_path)

    
    # Meta JSON (now includes hybrid metrics)
    
    meta = {
        "ticker": ticker,
        "feature_cols": feature_cols,
        "seq_len": lstm_out["seq_len"],
        "metrics": {
            "cnn_rmse": cnn_eval["rmse"], "cnn_mae": cnn_eval["mae"],
            "lstm_rmse": lstm_out["rmse"], "lstm_mae": lstm_out["mae"],
            "hybrid_rmse": hybrid_rmse, "hybrid_mae": hybrid_mae
        },
        "trained_at": dt.datetime.utcnow().isoformat() + "Z"
    }
    meta_path = os.path.join(MODELS_DIR, f"{ticker}_hybrid_meta(c+l).json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    
    # Visualization 
   
    plt.figure(figsize=(10,6))
    plt.plot(cnn_test_ds, cnn_eval["y_test"], label="Actual")
    plt.plot(cnn_test_ds, cnn_eval["y_pred"], label="CNN Predicted")
    if len(df_blend) > 0:
        plt.plot(df_blend["ds"], df_blend["lstm_pred"], label="LSTM Predicted")
    plt.title(f"{ticker} - Test Set (Hybrid base models)")
    plt.xlabel("Date"); plt.ylabel("Close"); plt.legend()
    plot_path = os.path.join(MODELS_DIR, f"{ticker}_hybrid_plot(c+l).png")
    plt.savefig(plot_path, bbox_inches="tight"); plt.close()

    if len(df_blend) > 0:
        plt.figure(figsize=(10,6))
        plt.plot(df_blend["ds"], df_blend["y_true_lstm"], label="Actual")
        plt.plot(df_blend["ds"], df_blend["blend_pred"], label="Hybrid (Blended)")
        plt.title(f"{ticker} - Test Set (Blended Prediction)")
        plt.xlabel("Date"); plt.ylabel("Close"); plt.legend()
        hybrid_plot_path = os.path.join(MODELS_DIR, f"{ticker}_hybrid_blend_plot(c+l).png")
        plt.savefig(hybrid_plot_path, bbox_inches="tight"); plt.close()
    else:
        hybrid_plot_path = None

    return {
        "cnn_path": cnn_wrapper_path,
        "lstm_path": lstm_path,
        "scaler_path": scaler_path,
        "feat_scaler_path": scaler_path_feats,
        "blender_path": blender_path,
        "meta_path": meta_path,
        "plot": plot_path,
        "metrics": {
            "cnn": {"rmse": cnn_eval["rmse"], "mae": cnn_eval["mae"]},
            "lstm": {"rmse": lstm_out["rmse"], "mae": lstm_out["mae"]},
            "hybrid": {"rmse": hybrid_rmse, "mae": hybrid_mae}
        }
    }



# Forecast

def _next_weekdays(start_date, n=7):
    dates = []
    d = start_date + dt.timedelta(days=1)
    while len(dates) < n:
        if d.weekday() < 5:
            dates.append(d)
        d += dt.timedelta(days=1)
    return dates

def predict_hybrid(ticker: str, horizon=7):
    cnn_wrapper = joblib.load(os.path.join(MODELS_DIR, f"{ticker}_cnn(c+l).pkl"))
    blender = joblib.load(os.path.join(MODELS_DIR, f"{ticker}_blend(c+l).pkl"))
    lstm_model = tf.keras.models.load_model(os.path.join(MODELS_DIR, f"{ticker}_lstm(c+l).keras"))
    scaler = joblib.load(os.path.join(MODELS_DIR, f"{ticker}_lstm_scaler(c+l).pkl"))
    feat_scaler = joblib.load(cnn_wrapper["feat_scaler"])
    cnn_model = tf.keras.models.load_model(cnn_wrapper["keras_path"])

    hist = load_history(ticker, period="2y")
    if hist.empty:
        raise RuntimeError("No history to predict.")

    meta = json.load(open(os.path.join(MODELS_DIR, f"{ticker}_hybrid_meta(c+l).json")))
    seq_len = int(meta["seq_len"])

    close_vals = hist["Close"].values.reshape(-1,1)
    close_scaled = scaler.transform(close_vals)

    feat_df, feature_cols = make_features(hist, max_lag=30)
    last_date = hist["ds"].iloc[-1].date()
    future_dates = _next_weekdays(last_date, horizon)

    results, close_list = [], close_vals.flatten().tolist()
    for d in future_dates:
        lstm_in = close_scaled[-seq_len:].reshape(1, seq_len, 1)
        lstm_pred_scaled = lstm_model.predict(lstm_in, verbose=0).flatten()[0]
        lstm_pred = float(scaler.inverse_transform([[lstm_pred_scaled]])[0,0])

        tmp = pd.DataFrame({"ds": [pd.Timestamp(d)], "Open": [np.nan], "High": [np.nan],
                            "Low": [np.nan], "Close": [close_list[-1]], "Volume": [np.nan]})
        base = pd.concat([hist, tmp], ignore_index=True)
        base.loc[base.index[-1], "Close"] = lstm_pred
        part, fcols = make_features(base, max_lag=30)
        X_last = feat_scaler.transform(part[fcols].iloc[-1:].values)
        X_last_c = X_last.reshape((1, X_last.shape[1], 1))
        cnn_pred = float(cnn_model.predict(X_last_c, verbose=0).flatten()[0])

        blended = float(blender.predict(np.array([[cnn_pred, lstm_pred]]))[0])

        # --- volatility ---
        vol = np.std(close_list[-20:]) if len(close_list) > 20 else np.std(close_list)

        # --- noise (stronger + grows over time) ---
        noise = np.random.normal(0, vol * 0.3 * np.sqrt(len(results) + 1))

        # --- momentum ---
        momentum = (close_list[-1] - close_list[-5]) if len(close_list) > 5 else 0

        # --- final ---
        blended = blended + noise + 0.2 * momentum

        # safety
        blended = max(blended, 0)
        blended = blended + noise


        results.append({"date": d.isoformat(), "close": blended})
        close_list.append(blended)
        close_scaled = np.r_[close_scaled, scaler.transform([[blended]])]
        hist = pd.concat([hist, pd.DataFrame([{"ds": pd.Timestamp(d), "Open": np.nan,
                                               "High": np.nan, "Low": np.nan,
                                               "Close": blended, "Volume": np.nan}])],
                         ignore_index=True)
    return results


# CLI

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ticker", help="Ticker symbol (e.g., TCS.NS)")
    ap.add_argument("--period", default="5y")
    ap.add_argument("--only-train", action="store_true")
    args = ap.parse_args()
    
    out = train_hybrid(args.ticker, period=args.period)
    print(json.dumps({"trained": True, "paths": out}, indent=2))
    if not args.only_train:
        fc = predict_hybrid(args.ticker, horizon=7)
        print(json.dumps({"forecast": fc}, indent=2))
