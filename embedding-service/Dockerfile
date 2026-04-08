# =============================================================================
# Build stage — install dependencies
# =============================================================================
FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# =============================================================================
# Pre-download model (cached as its own layer)
# =============================================================================
FROM python:3.11-slim AS model-cache

COPY --from=builder /install /usr/local

RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# =============================================================================
# Runtime stage
# =============================================================================
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --from=model-cache /root/.cache /root/.cache

COPY app/ ./app/

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
