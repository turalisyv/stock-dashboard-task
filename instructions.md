# Stock Analysis Dashboard - How to Run

## Requirements
- Python 3.9 or newer
- A web browser (no extra JavaScript libraries are needed; charts are drawn natively)

## Setup
```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Data files
The dashboard has no built-in stocks. Every `.csv` file in the `data/` folder is listed as a stock, named after the file.

- Click **Upload** in the dashboard, or copy CSV files into `data/` yourself.
- Uploaded files are saved into `data/`, and an existing file is never overwritten.
- When the app starts, it loads the first file found in `data/`. Files copied in while the app is running appear the next time you open the stock menu.
- Each CSV needs the columns `Date, Open, High, Low, Close` (column names are case-insensitive, extra columns are ignored).
- To use another folder, set the `STOCK_DATA_DIR` environment variable.

## Run
```bash
python app.py
```
Then open http://127.0.0.1:8000 in your browser.

## Deploying (e.g. Railway)
Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT` (`python app.py` and `uvicorn main:app` also work). Mount a volume (for example at `/data`) and set `STOCK_DATA_DIR=/data` so uploaded files survive redeploys.

## Usage
- Search for an indicator in the top-left box and add it (MA, EMA, RSI, MACD, ATR, Bollinger Bands). The same indicator can be added several times with different parameters. No indicators are added by default.
- Expand a card to change its parameters with the `+` / `-` buttons or by typing. The chart updates without a page reload. The current values are shown next to the indicator name, for example `MA (30)`.
- Use the tick at the left of a card to show or hide the indicator on the charts. Hidden indicators are not calculated.
- Click the colored dot to change the line color, and `x` to remove the indicator.
- Use the top bar to switch between line and candle charts, choose a timeframe (All time, 1Y, 1M, 1W, 1D), and pick the stock.
- Hovering a chart moves a cursor across all charts and shows the values at that date.

## Command-line export (the old task.py)
```bash
python task.py --stock <file name without .csv> --indicators ma,rsi --param ma.window=50
```
This writes `<stock>_processed.csv` to the current folder.

## Adding a new indicator
Write a class in `stock_analysis/indicators.py` that extends `Indicator` and is decorated with `@register`. Declare its parameters in `params`; the API and the UI pick it up automatically.

## Project structure
```
app.py                  FastAPI server (API + static files)
main.py                 Alias so `uvicorn main:app` also works
task.py                 Command-line tool
stock_analysis/         Python library (StockAnalyzer + indicators)
frontend/               index.html, style.css, chart.js, script.js
data/                   CSV files (one per stock)
```
