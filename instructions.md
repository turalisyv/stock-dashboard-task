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
