"""
RecreteTech Backend Proxy
=========================
Sits between the React frontend and Anthropic's API so the API key
is never exposed in the browser bundle.

Setup:
  pip install fastapi uvicorn httpx python-dotenv

Run locally:
  uvicorn main:app --reload --port 8000

Deploy to Render:
  - Connect this folder as a new "Web Service" on render.com
  - Set environment variable ANTHROPIC_API_KEY in the Render dashboard
  - Set environment variable ALLOWED_ORIGIN to your GitHub Pages URL
    e.g. https://yourusername.github.io
"""

import os
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()  # reads .env file in local dev

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"

# Allow requests from your GitHub Pages domain and local dev
ALLOWED_ORIGINS = [
    os.getenv("ALLOWED_ORIGIN", "https://yourusername.github.io"),
    "http://localhost:5173",   # Vite dev server
    "http://localhost:4173",   # Vite preview
]

app = FastAPI(title="RecreteTech API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health():
    """Simple health check — use this in Render's health check URL field."""
    return {"status": "ok"}


@app.post("/api/optimize")
async def optimize(request: Request):
    """
    Forwards the mix-design request to Anthropic and returns the response.
    The API key is injected here on the server — never sent to the browser.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Basic validation: must have messages array
    if "messages" not in body or not isinstance(body["messages"], list):
        raise HTTPException(status_code=400, detail="Request must include a messages array")

    headers = {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(ANTHROPIC_URL, json=body, headers=headers)
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Upstream timeout — please retry")
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return JSONResponse(content=resp.json())
