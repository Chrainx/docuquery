"""DocuQuery Embedding Service — FastAPI application.

Provides endpoints for PDF parsing, text chunking, and embedding generation.
"""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.chunker import chunk_pages
from app.embedder import Embedder
from app.pdf_parser import extract_pages

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "512"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "64"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------

embedder: Embedder | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the embedding model on startup."""
    global embedder
    embedder = Embedder(model_name=EMBEDDING_MODEL)
    logger.info("Embedding service ready")
    yield
    logger.info("Embedding service shutting down")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DocuQuery Embedding Service",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=500)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dimension: int
    count: int


class ChunkResponse(BaseModel):
    text: str
    page_numbers: list[int]
    chunk_index: int


class ParseResponse(BaseModel):
    filename: str
    page_count: int
    chunks: list[ChunkResponse]


class HealthResponse(BaseModel):
    status: str
    model: str
    dimension: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check — confirms model is loaded."""
    if embedder is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    return HealthResponse(
        status="healthy",
        model=embedder.model_name,
        dimension=embedder.dimension,
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest):
    """Generate embeddings for a list of texts."""
    if embedder is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start = time.time()
    vectors = embedder.embed(request.texts)
    elapsed = time.time() - start

    logger.info("Embedded %d texts in %.3fs", len(request.texts), elapsed)

    return EmbedResponse(
        embeddings=vectors,
        dimension=embedder.dimension,
        count=len(vectors),
    )


@app.post("/parse", response_model=ParseResponse)
async def parse(file: UploadFile = File(...)):
    """Upload a PDF, extract text, chunk it, and return chunks with page numbers."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        pages = extract_pages(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    chunks = chunk_pages(pages, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

    logger.info(
        "Parsed '%s': %d pages → %d chunks",
        file.filename,
        len(pages),
        len(chunks),
    )

    return ParseResponse(
        filename=file.filename,
        page_count=max(p.page_number for p in pages),
        chunks=[
            ChunkResponse(
                text=c.text,
                page_numbers=c.page_numbers,
                chunk_index=c.chunk_index,
            )
            for c in chunks
        ],
    )
