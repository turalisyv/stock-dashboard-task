"""Technical indicators.

Each indicator is a subclass of ``Indicator``. Its parameters are declared in
``params`` (label, default, min, max, step) and passed to the constructor, so
nothing is hard-coded. ``@register`` makes an indicator available to the API
and the UI automatically.
"""
import math
from abc import ABC, abstractmethod

import pandas as pd

INDICATORS = {}  # key -> indicator class


def register(cls):
    INDICATORS[cls.key] = cls
    return cls


class Indicator(ABC):
    key = ""
    label = ""
    aliases = ()     # extra search keywords for the UI
    panel = "price"  # "price": drawn over the price, "separate": drawn in its own chart
    params = {}      # name -> (label, default, min, max, step)

    def __init__(self, **values):
        unknown = set(values) - set(self.params)
        if unknown:
            raise ValueError(f"Unknown parameter(s) for {self.key}: {', '.join(sorted(unknown))}")
        self.values = {}
        for name, (label, default, low, high, _step) in self.params.items():
            try:
                value = float(values.get(name, default))
            except (TypeError, ValueError):
                raise ValueError(f"'{label}' must be a number.")
            if not math.isfinite(value):
                raise ValueError(f"'{label}' must be a number.")
            if isinstance(default, int):
                if value != int(value):
                    raise ValueError(f"'{label}' must be a whole number.")
                value = int(value)
            if not low <= value <= high:
                raise ValueError(f"'{label}' must be between {low} and {high}.")
            self.values[name] = value
        self.validate()

    def validate(self):
        """Optional cross-parameter validation."""

    def guides(self):
        """Optional horizontal guide lines drawn in the indicator's own chart."""
        return []

    @abstractmethod
    def compute(self, df):
        """Return a DataFrame with the indicator columns (same index as df)."""

    @classmethod
    def describe(cls):
        return {
            "key": cls.key,
            "label": cls.label,
            "aliases": list(cls.aliases),
            "panel": cls.panel,
            "params": [
                {"name": n, "label": l, "default": d, "min": lo, "max": hi, "step": s}
                for n, (l, d, lo, hi, s) in cls.params.items()
            ],
        }


@register
class MovingAverage(Indicator):
    key, label, aliases = "ma", "Moving Average", ("sma", "simple")
    params = {"window": ("Window", 30, 2, 200, 1)}

    def compute(self, df):
        w = self.values["window"]
        return pd.DataFrame({f"MA_{w}": df["Close"].rolling(w).mean()})


@register
class EMA(Indicator):
    key, label = "ema", "Exponential Moving Average"
    params = {"span": ("Span", 14, 2, 200, 1)}

    def compute(self, df):
        s = self.values["span"]
        return pd.DataFrame({f"EMA_{s}": df["Close"].ewm(span=s, adjust=False).mean()})


@register
class RSI(Indicator):
    key, label, panel = "rsi", "Relative Strength Index", "separate"
    params = {
        "period": ("Period", 14, 2, 100, 1),
        "overbought": ("Overbought", 70, 50, 100, 1),
        "oversold": ("Oversold", 30, 0, 50, 1),
    }

    def validate(self):
        if self.values["oversold"] >= self.values["overbought"]:
            raise ValueError("RSI 'Oversold' must be lower than 'Overbought'.")

    def guides(self):
        return [self.values["overbought"], self.values["oversold"]]

    def compute(self, df):
        p = self.values["period"]
        delta = df["Close"].diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        rs = gain.rolling(p).mean() / loss.rolling(p).mean()
        return pd.DataFrame({f"RSI_{p}": 100 - (100 / (1 + rs))})


@register
class MACD(Indicator):
    key, label, panel = "macd", "Moving Average Convergence Divergence", "separate"
    params = {
        "fast": ("Fast span", 12, 2, 100, 1),
        "slow": ("Slow span", 26, 3, 200, 1),
        "signal": ("Signal span", 9, 2, 100, 1),
    }

    def validate(self):
        if self.values["fast"] >= self.values["slow"]:
            raise ValueError("MACD 'Fast span' must be smaller than 'Slow span'.")

    def compute(self, df):
        v = self.values
        fast = df["Close"].ewm(span=v["fast"], adjust=False).mean()
        slow = df["Close"].ewm(span=v["slow"], adjust=False).mean()
        macd = fast - slow
        return pd.DataFrame({"MACD": macd, "MACD_Signal": macd.ewm(span=v["signal"], adjust=False).mean()})


@register
class ATR(Indicator):
    key, label, panel = "atr", "Average True Range", "separate"
    params = {"period": ("Period", 14, 2, 100, 1)}

    def compute(self, df):
        p = self.values["period"]
        prev_close = df["Close"].shift()
        true_range = pd.concat(
            [df["High"] - df["Low"], (df["High"] - prev_close).abs(), (df["Low"] - prev_close).abs()],
            axis=1,
        ).max(axis=1)
        return pd.DataFrame({f"ATR_{p}": true_range.rolling(p).mean()})


@register
class BollingerBands(Indicator):
    key, label = "bb", "Bollinger Bands"
    params = {
        "window": ("Window", 20, 2, 200, 1),
        "num_std": ("Std. deviations", 2.0, 0.5, 5.0, 0.5),
    }

    def compute(self, df):
        w, k = self.values["window"], self.values["num_std"]
        mean = df["Close"].rolling(w).mean()
        std = df["Close"].rolling(w).std()
        return pd.DataFrame({f"SMA_{w}": mean, "Upper_BB": mean + std * k, "Lower_BB": mean - std * k})
