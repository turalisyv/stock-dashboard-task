"""FastAPI backend: JSON API under /api, dashboard files served at /."""
import os
from typing import Dict, List

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from stock_analysis import StockAnalyzer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("STOCK_DATA_DIR", os.path.join(BASE_DIR, "data"))

app = FastAPI(title="Stock Analysis API")
analyzer = StockAnalyzer(data_dir=DATA_DIR)


class IndicatorRequest(BaseModel):
    id: str
    key: str
    params: Dict[str, float] = {}


class AnalyzeRequest(BaseModel):
    stock: str
    indicators: List[IndicatorRequest] = []


@app.middleware("http")
async def no_cache(request: Request, call_next):
    """Always serve the latest dashboard files instead of a stale browser copy."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/stocks")
def stocks():
    return analyzer.stocks()


@app.get("/api/indicators")
def indicators():
    return analyzer.indicators_info()


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    """POST is used because the same indicator can be requested several times with different parameters."""
    if not analyzer.has_stock(body.stock):
        raise HTTPException(404, f"Unknown stock '{body.stock}'.")
    config = [{"id": i.id, "key": i.key, "params": i.params} for i in body.indicators]
    try:
        return analyzer.analyze(body.stock, config)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/upload")
async def upload(request: Request, filename: str):
    """The raw CSV content is the request body (no extra multipart dependency needed)."""
    content = await request.body()
    try:
        return analyzer.add_upload(filename, content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


# Mounted last so it does not shadow the /api routes.
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "frontend"), html=True), name="frontend")

if __name__ == "__main__":
    on_server = "PORT" in os.environ  # hosts such as Railway set PORT automatically
    uvicorn.run(
        "app:app",
        host="0.0.0.0" if on_server else "127.0.0.1",
        port=int(os.environ.get("PORT", 8000)),
        reload=not on_server,
    )
