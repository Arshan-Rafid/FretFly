# this module exposes the local api contracts used by the browser client.
# it currently provides health and demo prediction endpoints for the prototype.
# future audio, vision, and fusion models should connect behind these contracts.
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel


ChordName = Literal["C", "G", "Am", "F"]


class HealthResponse(BaseModel):
    status: str
    service: str
    mode: str


class ChordResponse(BaseModel):
    chord: ChordName
    confidence: float
    source: str


app = FastAPI(title="FretFly API", version="0.1.0")


# expose a small local contract before model inference is connected
@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="fretfly", mode="local")


@app.get("/api/demo-chord", response_model=ChordResponse)
def demo_chord() -> ChordResponse:
    return ChordResponse(chord="C", confidence=0.82, source="demo-baseline")
