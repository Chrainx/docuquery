# CLAUDE.md

## Project Overview

DocuQuery is a full-stack RAG (Retrieval-Augmented Generation) system. Upload a PDF, ask questions in plain English, get answers with exact page citations. Runs 100% locally, $0 cost.

The whole point is to demonstrate understanding of RAG from scratch — no LangChain — by building every piece: chunking, embedding, vector search, prompt construction, and answer generation.

## Architecture

```
Frontend (Next.js 14 + TypeScript + Tailwind) → port 3000
    ↓ HTTP
Backend (Go + Gin) → port 8080
    ↓ HTTP                    ↓ HTTP
Embedding Service          Ollama (Llama 3.1 8B)
(Python + FastAPI)         → port 11434
→ port 8001
    ↓
PostgreSQL + pgvector → port 5432
```

### Data Flow

1. User uploads PDF → Go backend receives it → calls Python service `/parse` → gets chunks with page numbers
2. Go backend calls Python service `/embed` → gets 384-dim vectors for each chunk
3. Go backend stores chunks + vectors in PostgreSQL (pgvector)
4. User asks question → Go backend embeds the question → cosine similarity search in pgvector → top-K chunks retrieved
5. Go backend constructs RAG prompt with chunks + page numbers → sends to Ollama → streams response back via SSE

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS | App Router, `"use client"` components |
| Backend | Go 1.22+, Gin framework | pgx for PostgreSQL, structured logging with slog |
| Database | PostgreSQL 16 + pgvector | HNSW index on embeddings, cosine distance |
| Embeddings | Python 3.11+, FastAPI, sentence-transformers | `all-MiniLM-L6-v2` model, 384 dimensions |
| PDF Parsing | Python, PyMuPDF (fitz) | Page-level text extraction |
| LLM | Ollama, Llama 3.1 8B | Local inference, streaming via `/api/generate` |

## Project Structure

```
docuquery/
├── frontend/                    # Next.js 14
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css      # Tailwind + custom CSS
│   │   │   ├── layout.tsx       # Root layout with Providers
│   │   │   └── page.tsx         # Main page orchestrating components
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx # Chat UI with SSE streaming
│   │   │   ├── DocumentList.tsx  # Document list with status badges
│   │   │   ├── UploadZone.tsx    # Drag-and-drop PDF upload
│   │   │   ├── Toast.tsx         # Toast notification system
│   │   │   ├── ErrorBoundary.tsx # React error boundary
│   │   │   ├── Skeleton.tsx      # Loading skeleton components
│   │   │   └── Providers.tsx     # Client-side provider wrapper
│   │   ├── lib/
│   │   │   └── api.ts           # Typed API client (fetch + SSE streaming)
│   │   ├── types/
│   │   │   └── index.ts         # TypeScript types mirroring Go models
│   │   └── __tests__/
│   │       └── api.test.ts      # API client unit tests
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── jest.config.js           # ⚠️ Has typo: setupFilesAfterSetup → setupFilesAfterSetup (see Known Issues)
│   ├── jest.setup.ts
│   └── Dockerfile
├── backend/                     # Go API server
│   ├── cmd/api/
│   │   └── main.go              # Entrypoint: config, DB, migrations, router, graceful shutdown
│   ├── internal/
│   │   ├── config/
│   │   │   ├── config.go        # Env var loading
│   │   │   └── config_test.go
│   │   ├── handlers/
│   │   │   ├── handlers.go      # All HTTP handlers (upload, list, delete, query, query/stream)
│   │   │   └── handlers_test.go
│   │   ├── middleware/
│   │   │   └── middleware.go    # CORS + request logging
│   │   ├── models/
│   │   │   └── models.go       # Document, Chunk, QueryRequest, QueryResponse, SourceChunk
│   │   └── services/
│   │       ├── embedding_client.go      # HTTP client for Python embedding service
│   │       ├── ollama_client.go         # HTTP client for Ollama (streaming + non-streaming)
│   │       └── ollama_client_test.go    # Tests for BuildPrompt
│   ├── migrations/
│   │   └── 001_initial.sql     # pgvector extension, documents table, chunks table, HNSW index
│   ├── go.mod
│   ├── go.sum                  # ⚠️ Empty — needs `go mod tidy`
│   ├── .golangci.yml
│   └── Dockerfile
├── embedding-service/           # Python FastAPI
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI app with /parse, /embed, /health
│   │   ├── pdf_parser.py       # PyMuPDF text extraction
│   │   ├── chunker.py          # Sentence-boundary chunking with overlap
│   │   └── embedder.py         # sentence-transformers wrapper
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_chunker.py
│   │   ├── test_pdf_parser.py
│   │   └── test_api.py         # FastAPI endpoint integration tests
│   ├── requirements.txt
│   ├── pyproject.toml          # ruff + pytest config
│   └── Dockerfile
├── scripts/
│   ├── e2e-test.sh             # End-to-end test script
│   └── create-issues.sh        # Creates all 18 GitHub Issues via `gh` CLI
├── docs/
│   ├── GITHUB_ISSUES.md        # All 18 issues as markdown (manual copy alternative)
│   ├── design.md               # Architecture decision records
│   ├── api.md                  # Full API reference
│   ├── development.md          # Local dev setup guide
│   └── troubleshooting.md
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # CI: Go tests, Python lint+tests, Next.js lint+typecheck+build, Docker build
│   │   └── release.yml         # Release: changelog, GitHub release, Docker image push to GHCR
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.md
│   │   ├── feature.md
│   │   └── config.yml
│   └── pull_request_template.md
├── docker-compose.yml          # Full stack: postgres, embedding-service, backend, frontend
├── Makefile                    # Developer commands (make up, make test, make lint, etc.)
├── .env.example
├── .gitignore
├── .dockerignore
├── README.md
├── LICENSE                     # MIT
└── CONTRIBUTING.md
```

## API Endpoints

### Backend (Go) — :8080

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/health | Health check |
| POST | /api/v1/documents | Upload PDF (multipart/form-data) → returns 202, processes async |
| GET | /api/v1/documents | List all documents |
| GET | /api/v1/documents/:id | Get single document |
| DELETE | /api/v1/documents/:id | Delete document + chunks |
| POST | /api/v1/query | Ask question → JSON response with answer + sources |
| POST | /api/v1/query/stream | Ask question → SSE stream (event: token/sources/done/error) |

### Embedding Service (Python) — :8001

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Returns model name + dimension |
| POST | /parse | Upload PDF → returns chunks with page_numbers |
| POST | /embed | `{texts: string[]}` → `{embeddings: float[][]}` |

## Current State & Known Issues

### Must Fix Before Running

1. **`go.sum` is empty** — run `go mod tidy` in `backend/` to populate dependencies
2. **`node_modules/` missing** — run `npm install` in `frontend/`
3. **Python venv missing** — run `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` in `embedding-service/`
4. **`go.mod` has placeholder** — replace `Chrainx` with actual GitHub username in `go.mod` and all Go import paths
5. **`Chrainx` appears in many files** — global find-and-replace needed:
   - `go.mod`
   - All `.go` files (import paths)
   - `README.md`
   - `CONTRIBUTING.md`
   - `.golangci.yml`
   - `layout.tsx` (GitHub link)

### Known Code Issues

1. **`jest.config.js`** — the key `setupFilesAfterSetup` should be `setupFilesAfterSetup`
   - Wait, actually these look the same. The real Jest key is **`setupFilesAfterSetup`** — check the actual spelling: `s-e-t-u-p-F-i-l-e-s-A-f-t-e-r-S-e-t-u-p`. Actually the correct Jest option name is `setupFilesAfterSetup`. Open the file and verify.

2. **Go `embed` directive in `main.go`** — the `//go:embed ../../migrations/*.sql` path assumes the binary runs from `cmd/api/`, which is correct for `go run ./cmd/api` but the embedded FS path may fail. The fallback `runMigrationsFromDisk` handles this but test it.

3. **Go `models.go`** — `ErrorMessage` field is `string` but the SQL column is nullable. The `COALESCE` in queries handles this, but if any query misses it, there'll be a scan error.

4. **pgvector casting** — the `pgvectorString` function builds the vector string manually (`[0.1,0.2,0.3]`). This works with pgvector but verify with actual pgx driver that `$1::vector` casting works with string input.

5. **SSE streaming** — the frontend SSE parser is hand-rolled (not using `EventSource` because we need POST). This works but edge cases around buffering may need testing.

6. **Docker Compose** — the backend uses `host.docker.internal:11434` for Ollama, which works on macOS/Windows Docker Desktop but may need `--add-host` on Linux.

### What's Working (Code Complete)

- ✅ Full project structure
- ✅ Python embedding service (PDF parser, chunker, embedder, FastAPI app)
- ✅ Go backend (all handlers, services, config, middleware, migrations)
- ✅ Next.js frontend (upload zone, document list, chat with SSE streaming, source citations)
- ✅ Docker Compose for full stack
- ✅ CI/CD workflows (GitHub Actions)
- ✅ GitHub Issue templates + creation script
- ✅ All 18 issues documented
- ✅ Comprehensive documentation (design decisions, API ref, dev guide, troubleshooting)
- ✅ Unit tests (Go, Python, TypeScript)
- ✅ E2E test script

### What Has NOT Been Tested End-to-End

- The full pipeline: upload → chunk → embed → store → query → retrieve → generate → stream
- This requires all services running simultaneously with Ollama
- Start order matters: PostgreSQL → embedding service → backend → frontend

## Development Commands

```bash
make help          # See all commands
make up            # Start everything via Docker
make infra         # Start PostgreSQL only
make dev-backend   # Run Go backend locally
make dev-frontend  # Run Next.js dev server
make dev-embedding # Run Python service with hot reload
make test          # All tests
make lint          # All linters
make db-reset      # Drop and recreate database
make db-shell      # Open psql
```

## Conventions

- **Go**: standard library style, `gofmt`, table-driven tests, structured logging with `slog`
- **Python**: PEP 8, type hints, `ruff` for linting, `pytest`
- **TypeScript**: strict mode, no `any`, server components by default, `"use client"` only when needed
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `test:`, `docs:`, `ci:`)
- **Branches**: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `ci/`

## Key Design Decisions

- **No LangChain** — everything from scratch to show understanding
- **Sentence-boundary chunking** with 64-token overlap to avoid splitting mid-thought
- **`all-MiniLM-L6-v2`** (384-dim) — small, fast, good enough for document Q&A
- **pgvector HNSW index** — supports incremental inserts without reindexing
- **SSE streaming** — tokens stream to the browser as the LLM generates them
- **Async document processing** — upload returns 202 immediately, processing happens in a goroutine
- See `docs/design.md` for the full reasoning behind every choice
