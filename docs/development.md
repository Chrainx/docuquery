# Local Development Guide

This guide walks through setting up DocuQuery for local development without
Docker (except for PostgreSQL).

---

## Prerequisites

Install these before starting:

- **Go 1.22+** — [go.dev/dl](https://go.dev/dl/)
- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Python 3.11+** — [python.org](https://www.python.org/downloads/)
- **Docker** — for PostgreSQL only
- **Ollama** — [ollama.ai](https://ollama.ai/)

---

## Step 1: Clone and Configure

```bash
git clone https://github.com/Chrainx/docuquery.git
cd docuquery
cp .env.example .env
```

---

## Step 2: Start Infrastructure

Start PostgreSQL with pgvector:

```bash
make infra
```

Pull the LLM model (one-time, ~4.7 GB download):

```bash
ollama pull llama3.2:1b
```

Start Ollama if it isn't running:

```bash
ollama serve
```

---

## Step 3: Install Dependencies

```bash
make setup
```

This runs:
- `npm install` in `frontend/`
- `pip install` in `embedding-service/.venv/`
- `go mod download` in `backend/`

---

## Step 4: Run Services

Open three terminal tabs:

**Tab 1 — Embedding Service** (port 8001):
```bash
make dev-embedding
```

Wait until you see "Model loaded" before starting the backend.

**Tab 2 — Go Backend** (port 8080):
```bash
make dev-backend
```

**Tab 3 — Next.js Frontend** (port 3000):
```bash
make dev-frontend
```

Open [http://localhost:3000](http://localhost:3000).

---

## Development Workflow

### Making Changes

**Frontend:** Next.js hot-reloads automatically. Edit any file in
`frontend/src/` and the browser updates instantly.

**Backend:** After editing Go files, stop (`Ctrl+C`) and restart
`make dev-backend`. For automatic reload, install
[air](https://github.com/air-verse/air):

```bash
go install github.com/air-verse/air@latest
cd backend && air
```

**Embedding Service:** uvicorn's `--reload` flag watches for file changes
automatically.

### Running Tests

```bash
make test              # All tests
make test-backend      # Go only
make test-frontend     # Next.js only
make test-embedding    # Python only
```

### Running Linters

```bash
make lint              # All linters
make lint-backend      # golangci-lint
make lint-frontend     # ESLint
make lint-embedding    # ruff
```

### Database Operations

```bash
make db-shell          # Open psql
make db-reset          # Drop and recreate everything
```

Useful psql commands:

```sql
-- Count documents
SELECT count(*) FROM documents;

-- See chunk distribution
SELECT d.filename, count(c.id) as chunks
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
GROUP BY d.filename;

-- Check index usage
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public';
```

---

## Project Layout Quick Reference

```
backend/
  cmd/api/main.go           ← Start here for the API server
  internal/handlers/         ← HTTP request handlers
  internal/services/         ← Embedding client, Ollama client
  internal/models/           ← Data structures
  internal/config/           ← Environment variable loading
  migrations/                ← SQL schema

embedding-service/
  app/main.py               ← FastAPI app
  app/pdf_parser.py         ← PDF → text
  app/chunker.py            ← Text → chunks
  app/embedder.py           ← Text → vectors

frontend/
  src/app/page.tsx           ← Main page
  src/components/            ← React components
  src/lib/api.ts             ← Backend API client
  src/types/index.ts         ← TypeScript types
```

---

## Common Gotchas

1. **Start the embedding service first.** The Go backend calls it during
   document processing. If it's not ready, uploads will fail.

2. **Ollama must be running.** Without it, queries return errors. The backend
   doesn't start Ollama for you.

3. **`go.sum` is empty initially.** Run `go mod tidy` in `backend/` to
   populate it. This also verifies all dependencies are available.

4. **Python virtual environment.** The Makefile assumes `.venv/` exists in
   `embedding-service/`. If `make setup` didn't create it:
   ```bash
   cd embedding-service
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```

5. **Port conflicts.** If another service uses 3000, 8080, 8001, or 5433,
   change them in `.env`.
