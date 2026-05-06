# backend/train_xgb.py
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import yfinance as yf
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error
from xgboost import XGBRegressor
import joblib

def create_features(df, lags=[1,2,3,5,10]):
    """
    Create lag features and moving averages for stock price prediction
    """
    for lag in lags:
        df[f"lag_{lag}"] = df["Close"].shift(lag)
    df["returns"] = df["Close"].pct_change()
    df["ma7"] = df["Close"].rolling(7).mean()
    df["ma21"] = df["Close"].rolling(21).mean()
    df = df.dropna()
    return df

def train_xgboost(ticker, period="5y", test_size=0.2, save_dir="models"):
    # Fetch stock data
    df = yf.download(ticker, period=period)
    df = df[["Close"]].reset_index()

    # Feature engineering
    df = create_features(df)

    # Train/test split
    X = df.drop(columns=["Date","Close"])
    y = df["Close"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, shuffle=False)

    # Train model
    model = XGBRegressor(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=6,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42
    )
    model.fit(X_train, y_train)

    # Predictions
    y_pred = model.predict(X_test)

    # Metrics
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    mae = float(mean_absolute_error(y_test, y_pred))

    # Plot
    plt.figure(figsize=(10,6))
    plt.plot(y_test.index, y_test, label="Actual")
    plt.plot(y_test.index, y_pred, label="Predicted")
    plt.title(f"{ticker} - Test Set (XGBoost)")
    plt.xlabel("Index")
    plt.ylabel("Close")
    plt.legend()

    os.makedirs(save_dir, exist_ok=True)
    fig_path = os.path.join(save_dir, f"{ticker}_xgb_plot.png")
    plt.savefig(fig_path)
    plt.close()

    model_path = os.path.join(save_dir, f"{ticker}_xgb.pkl")
    joblib.dump(model, model_path)

    metrics = {
        "ticker": ticker,
        "model": "XGBoost",
        "train_points": len(X_train),
        "test_points": len(X_test),
        "rmse": rmse,
        "mae": mae
    }

    return metrics, model_path, fig_path
