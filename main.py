"""Entry-point alias: lets `uvicorn main:app` and `python main.py` work too.

Some hosts assume the app lives in main.py. The real application is in app.py.
"""
import os

import uvicorn

from app import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
