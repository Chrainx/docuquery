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
│   │   │   ├── globals.css      # Tailwind directives only (no custom classes)
│   │   │   ├── layout.tsx       # Root layout with Providers
│   │   │   └── page.tsx         # Main page orchestrating components
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx # Chat UI with SSE streaming
│   │   │   ├── DocumentList.tsx  # Document list with status badges
│   │   │   ├── UploadZone.tsx    # Drag-and-drop PDF upload
│   │   │   ├── Toast.tsx         # Toast notification system
│   │   │   ├── ErrorBoundary.tsx # React error boundary
│   │   │   ├── Skeleton.tsx      # Loading skeleton components
│   │   │   ├── DirectoryList.tsx # Directory sidebar (create, select, delete directories)
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
│   ├── jest.config.js           # Jest config: setupFilesAfterEnv, moduleNameMapper for @/ alias
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
│   │   │   ├── handlers.go      # All HTTP handlers (upload, list, delete, assign, directories, query, query/stream)
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
│   │   ├── 001_initial.sql     # pgvector extension, documents table, chunks table, HNSW index
│   │   └── 002_directories.sql # directories table, directory_id FK on documents
│   ├── cmd/api/migrations/     # Mirror of migrations/ for go:embed (must stay in sync)
│   ├── go.mod
│   ├── go.sum
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
| PATCH | /api/v1/documents/:id | Assign/unassign document to a directory |
| POST | /api/v1/directories | Create a directory |
| GET | /api/v1/directories | List directories with document counts |
| GET | /api/v1/directories/:id | Get single directory |
| DELETE | /api/v1/directories/:id | Delete directory (documents unassigned, not deleted) |
| POST | /api/v1/query | Ask question → JSON response with answer + sources |
| POST | /api/v1/query/stream | Ask question → SSE stream (event: token/sources/done/error) |

### Embedding Service (Python) — :8001

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Returns model name + dimension |
| POST | /parse | Upload PDF → returns chunks with page_numbers |
| POST | /embed | `{texts: string[]}` → `{embeddings: float[][]}` |

## Current State

### Setup (fresh clone)

1. Run `npm install` in `frontend/`
2. Run `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` in `embedding-service/`
3. Copy `.env.example` to `.env` and adjust ports/model if needed
4. `make up` — starts all services via Docker Compose

### Known Gotchas

- **`backend/cmd/api/migrations/`** must be kept in sync with `backend/migrations/` — the Go binary embeds from the former via `//go:embed migrations/*.sql`. When adding a new migration, copy it to both directories.
- **Ollama on Linux Docker** — `host.docker.internal:11434` works on macOS/Windows Docker Desktop. On Linux, add `--add-host=host.docker.internal:host-gateway` to the backend service in `docker-compose.yml`.
- **PostgreSQL port** — default is `5433` in `.env` to avoid conflicts with a locally-running Postgres.
- **SSE streaming** — the frontend SSE parser is hand-rolled (not using `EventSource`) because the query is a POST. Works correctly but keep in mind if debugging streaming issues.
- **`models.go` ErrorMessage** — `COALESCE` in all SQL queries prevents null-scan errors on the nullable `error_message` column. Maintain this pattern if adding new queries.

### What's Working

- ✅ Full RAG pipeline: upload → chunk → embed → store → query → retrieve → generate → stream
- ✅ Directories with shared query context
- ✅ Drag-and-drop document assignment to directories
- ✅ Dark UI with search/filter, collapsible upload zone
- ✅ Docker Compose full stack
- ✅ CI/CD (GitHub Actions)
- ✅ Unit tests (Go, Python, TypeScript)

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
