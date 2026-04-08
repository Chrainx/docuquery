# DocuQuery — Design Decisions

This document explains the reasoning behind key architectural and technical
choices in DocuQuery. It is intended for anyone reviewing the project —
interviewers, collaborators, or future-me.

---

## Why Build RAG from Scratch?

Most RAG tutorials use LangChain or LlamaIndex. These frameworks are powerful,
but they hide the mechanics. DocuQuery builds every piece by hand to
demonstrate understanding of the full pipeline: chunking strategy, embedding
generation, vector indexing, prompt engineering, and answer generation.

An interviewer looking at this project can see that the developer understands
_why_ chunks overlap, _how_ cosine similarity drives retrieval, and _what_
goes into a good RAG prompt — not just how to call `langchain.load_qa_chain()`.

---

## Service Architecture

### Why a Separate Embedding Service?

The embedding model (`all-MiniLM-L6-v2`) requires Python and PyTorch. The
backend is in Go. Rather than calling Python from Go (CGo, subprocess, etc.),
a clean HTTP boundary gives us:

1. **Independent scaling** — embedding is CPU-heavy; the Go API is I/O-heavy.
   They have different resource profiles.
2. **Independent deployment** — update the model without redeploying the API.
3. **Language-appropriate tooling** — Python's ML ecosystem is unmatched for
   this task; Go's HTTP and concurrency model is ideal for the API.
4. **Testability** — each service has its own test suite with no cross-language
   dependencies.

### Why Go for the Backend?

- **Performance** — Go's goroutines handle concurrent requests efficiently,
  which matters when streaming LLM responses to many clients.
- **Type safety** — compile-time type checking catches bugs early.
- **Single binary** — the entire backend compiles to one binary with no
  runtime dependencies (important for Docker image size).
- **Standard library** — Go's `net/http` and `encoding/json` are excellent;
  Gin adds just routing and middleware.

### Why PostgreSQL + pgvector Instead of a Dedicated Vector DB?

Dedicated vector databases (Pinecone, Weaviate, Qdrant) are excellent products,
but for this project:

1. **Simplicity** — one database for both relational data (documents, metadata)
   and vector search. No sync issues between two datastores.
2. **Maturity** — PostgreSQL is battle-tested in production at every scale.
   pgvector adds vector operations on top of a proven foundation.
3. **Cost** — $0. No SaaS subscription needed.
4. **HNSW indexing** — pgvector supports HNSW indexes, which provide
   sub-millisecond approximate nearest neighbor search for datasets up to
   ~1M vectors. This is more than enough for a document Q&A system.
5. **SQL flexibility** — filtering by document ID, joining with metadata,
   and ordering by similarity are trivial in SQL. In a dedicated vector DB,
   metadata filtering often requires separate configuration.

**When would you switch?** If the system needed to handle millions of documents
with real-time indexing, a dedicated vector DB with sharding and replication
would be a better choice.

---

## Chunking Strategy

### Why Sentence-Boundary Chunking?

Naive chunking (split every N characters) creates chunks that end mid-sentence.
This degrades both embedding quality and LLM answer quality:

- **Embedding quality** — sentence-transformers are trained on complete
  sentences. A chunk ending with "The company reported annual revenue of"
  produces a worse embedding than one ending with "The company reported
  annual revenue of $5.2 billion."
- **LLM answer quality** — if the LLM receives a chunk that cuts off
  mid-thought, it may hallucinate the rest or produce a confused answer.

### Why Overlapping Chunks?

Without overlap, information at chunk boundaries is lost. If a key fact
spans the end of chunk 4 and the start of chunk 5, neither chunk alone
captures the complete idea. A 64-token overlap ensures that boundary
content appears in at least one complete chunk.

### Why ~512 Tokens?

The `all-MiniLM-L6-v2` model has a max sequence length of 256 tokens, but
in practice:

- Shorter chunks (128-256 tokens) produce better embeddings but lose context.
- Longer chunks (1024+ tokens) retain context but dilute the embedding with
  unrelated information.
- 512 tokens is a practical middle ground: long enough to capture a complete
  idea, short enough for meaningful similarity search.

The model truncates inputs beyond its sequence length, so the embedding
captures the first ~256 tokens. The full chunk text is still stored and
sent to the LLM for answer generation.

---

## Embedding Model Choice

### Why `all-MiniLM-L6-v2`?

| Model | Dimension | Size | Speed | Quality |
|-------|-----------|------|-------|---------|
| all-MiniLM-L6-v2 | 384 | 80 MB | Fast | Good |
| all-mpnet-base-v2 | 768 | 420 MB | Medium | Better |
| e5-large-v2 | 1024 | 1.3 GB | Slow | Best |

For a local-first project, the tradeoffs favor MiniLM:

- **80 MB** model fits comfortably in memory alongside the LLM.
- **384-dimensional** vectors keep the pgvector index compact.
- **Quality is sufficient** for document Q&A — the bottleneck in answer
  quality is almost always the LLM, not the retrieval.

For a production system with API budget, OpenAI's `text-embedding-3-small`
(1536 dimensions) or Cohere's `embed-english-v3.0` would be significant
quality upgrades.

---

## Prompt Engineering

### Why "Answer ONLY from context"?

Without this constraint, the LLM may use its training knowledge to answer
questions. This defeats the purpose of RAG — the user wants to know what
_their document_ says, not what the LLM knows.

The constraint also reduces hallucination: if the context doesn't contain
the answer, the LLM should say so rather than making something up.

### Why Include Page Numbers in the Prompt?

The prompt formats context as `[Page N] chunk text`. This gives the LLM
explicit metadata to cite. Without it, the LLM would need to infer page
numbers from chunk ordering, which is error-prone.

### Why Streaming?

LLMs generate tokens sequentially. Without streaming, the user stares at a
loading spinner for 5-30 seconds until the complete answer is ready.
Streaming (via Server-Sent Events) shows tokens as they are generated,
creating a much more responsive experience.

The architecture sends SSE events for:
- `token` — each generated token
- `sources` — citation data (sent after generation completes)
- `done` — signals the end of the stream
- `error` — if generation fails mid-stream

---

## Vector Search Implementation

### Cosine Similarity vs. L2 Distance

pgvector supports three distance metrics:

- `<->` L2 (Euclidean) distance
- `<=>` Cosine distance
- `<#>` Inner product

We use cosine distance (`<=>`) because:

1. Sentence-transformer embeddings are L2-normalized, so cosine similarity
   equals inner product. But cosine distance is more intuitive to reason about.
2. Cosine similarity is scale-invariant — it measures the angle between
   vectors, not their magnitude. This is ideal for text similarity.

### HNSW vs. IVFFlat Index

pgvector supports two index types:

- **IVFFlat** — partitions vectors into clusters. Fast for large datasets,
  but requires a representative training set and periodic reindexing.
- **HNSW** — builds a hierarchical graph. Slower to build, faster to query,
  and doesn't require reindexing as data changes.

We use HNSW because:

1. Documents are uploaded incrementally — new vectors must be searchable
   immediately without rebuilding the index.
2. HNSW provides excellent recall (>99%) with low latency.
3. The parameter choices (`m=16, ef_construction=128`) balance build time
   and search quality for datasets up to ~1M vectors.

---

## Security Considerations

This is a local-only development project, but the architecture considers
security:

- **File validation** — PDF magic bytes are checked before processing.
- **Size limits** — configurable upload size prevents resource exhaustion.
- **SQL injection** — all queries use parameterized statements (pgx).
- **CORS** — restricted to the frontend origin.
- **No auth** — intentionally omitted for simplicity. In production, add
  JWT or session-based authentication.

---

## What I Would Change in Production

1. **Authentication** — JWT tokens with refresh, or OAuth2.
2. **Object storage** — store PDFs in S3/MinIO instead of local disk.
3. **Queue-based processing** — use Redis/NATS for async document processing
   instead of goroutines (survives server restarts).
4. **Better embeddings** — use an API-based model (OpenAI, Cohere) for
   higher quality retrieval.
5. **Hybrid search** — combine vector search with full-text search (BM25)
   for better recall on keyword-heavy queries.
6. **Reranking** — add a cross-encoder reranking step after retrieval to
   improve precision.
7. **Observability** — OpenTelemetry traces, Prometheus metrics, structured
   logging to a log aggregator.
8. **Rate limiting** — per-user rate limits on queries and uploads.
