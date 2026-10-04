"""Loads stock CSV files from a data folder and runs indicators on them."""
import io
import os
import re

import pandas as pd

from .indicators import INDICATORS

REQUIRED_COLUMNS = ("Date", "Open", "High", "Low", "Close")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class StockAnalyzer:
    """Every ``*.csv`` file in ``data_dir`` is a stock, named after the file.

    To add a stock, drop a CSV into the folder (or upload it through the API).
    """

    def __init__(self, data_dir="data", indicators=None):
        self.data_dir = data_dir
        self.indicators = indicators if indicators is not None else INDICATORS
        os.makedirs(self.data_dir, exist_ok=True)

    # ---- Info ----
    def _files(self):
        """Return {stock name: file name} for the CSV files currently in the folder."""
        return {
            os.path.splitext(f)[0]: f
            for f in sorted(os.listdir(self.data_dir))
            if f.lower().endswith(".csv") and os.path.isfile(os.path.join(self.data_dir, f))
        }

    def stocks(self):
        return [{"name": name} for name in self._files()]

    def has_stock(self, stock):
        return stock in self._files()

    def indicators_info(self):
        return [cls.describe() for cls in self.indicators.values()]

    # ---- Data loading ----
    @staticmethod
    def _parse(content):
        """Read CSV bytes; falls back to delimiter detection for ';' or tab separated files."""
        df = pd.read_csv(io.BytesIO(content))
        if df.shape[1] == 1:
            df = pd.read_csv(io.BytesIO(content), sep=None, engine="python")
        return df

    @staticmethod
    def _prepare(df, source):
        """Normalize column names, validate the data and sort it by date."""
        df = df.rename(columns=lambda c: str(c).strip().lstrip("\ufeff").title())
        if "Date" not in df.columns:  # accept common alternatives for the date column
            alias = next((c for c in df.columns if c in ("Datetime", "Timestamp", "Time")), None)
            if alias is None and str(df.columns[0]).startswith("Unnamed"):
                alias = df.columns[0]
            if alias is not None:
                df = df.rename(columns={alias: "Date"})
        missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
        if missing:
            raise ValueError(f"{source} is missing column(s): {', '.join(missing)}")
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        prices = ["Open", "High", "Low", "Close"]
        df[prices] = df[prices].apply(pd.to_numeric, errors="coerce")
        df = df.dropna(subset=["Date"] + prices).sort_values("Date").reset_index(drop=True)
        if len(df) < 2:
            raise ValueError(f"{source} does not contain enough valid rows.")
        return df

    def load(self, stock):
        files = self._files()
        if stock not in files:
            raise FileNotFoundError(f"Data file not found for '{stock}'.")
        with open(os.path.join(self.data_dir, files[stock]), "rb") as f:
            return self._prepare(self._parse(f.read()), files[stock])

    def add_upload(self, filename, content):
        """Validate an uploaded CSV and save it into the data folder."""
        if len(content) > MAX_UPLOAD_BYTES:
            raise ValueError("File is too large (10 MB maximum).")
        try:
            raw = self._parse(content)
        except Exception:
            raise ValueError("The file could not be read as CSV.")
        df = self._prepare(raw, filename)

        stem = os.path.splitext(os.path.basename(filename))[0]
        base = re.sub(r"[^\w\- ]", "", stem).strip()[:50] or "stock"
        files = self._files()
        name, n = base, 2
        while name in files:  # never overwrite an existing file
            name, n = f"{base} ({n})", n + 1
        df.to_csv(os.path.join(self.data_dir, f"{name}.csv"), index=False)  # saved in a clean, standard form
        return {"name": name}

    # ---- Analysis ----
    def build(self, config):
        """config: [{"id": "a", "key": "ma", "params": {"window": 20}}] -> [(id, indicator)]"""
        built = []
        for item in config:
            key = item["key"]
            if key not in self.indicators:
                raise ValueError(f"Unknown indicator: '{key}'.")
            built.append((item.get("id", key), self.indicators[key](**item.get("params", {}))))
        return built

    def analyze(self, stock, config):
        """Return a JSON-friendly dict with the price and the requested indicators."""
        df = self.load(stock)
        return {
            "stock": stock,
            "dates": df["Date"].dt.strftime("%Y-%m-%d").tolist(),
            "open": self._clean(df["Open"]),
            "high": self._clean(df["High"]),
            "low": self._clean(df["Low"]),
            "close": self._clean(df["Close"]),
            "indicators": [
                {
                    "id": ind_id,
                    "key": ind.key,
                    "panel": ind.panel,
                    "guides": ind.guides(),
                    "series": {name: self._clean(col) for name, col in ind.compute(df).items()},
                }
                for ind_id, ind in self.build(config)
            ],
        }

    def to_frame(self, stock, config):
        """Price data and indicator columns in one table (used for CSV export)."""
        df = self.load(stock)
        return pd.concat([df] + [ind.compute(df) for _, ind in self.build(config)], axis=1)

    @staticmethod
    def _clean(series):
        """NaN/inf -> None, because JSON has no NaN."""
        series = series.astype(float).replace([float("inf"), float("-inf")], float("nan"))
        return [None if pd.isna(v) else round(float(v), 4) for v in series]
