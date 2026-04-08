# DocuQuery — GitHub Issues

Copy each issue below into your GitHub repository. Create them in order so the
issue numbers align with the references in later issues.

---

## Milestone 1: Infrastructure & Project Setup

### Issue #1 — Initialize project structure and CI/CD

**Labels:** `setup`, `ci`

**Description:**

Set up the monorepo with all services, Docker Compose, Makefile, and GitHub
Actions. This is the foundation everything else builds on.

**Acceptance Criteria:**

- [ ] Project structure matches README
- [ ] `docker compose up` starts PostgreSQL with pgvector extension enabled
- [ ] CI workflow runs on push to `main` and on pull requests
- [ ] `make help` lists all available commands
- [ ] `.env.example` documents every environment variable
- [ ] README, LICENSE, and CONTRIBUTING.md are in place

---

### Issue #2 — Database schema and migrations

**Labels:** `backend`, `database`

**Description:**

Create the PostgreSQL schema for storing documents, chunks, and embeddings.
Write SQL migration files that the Go backend applies on startup.

**Schema:**

```sql
-- documents table
id UUID PRIMARY KEY
filename TEXT NOT NULL
page_count INTEGER NOT NULL
file_size_bytes BIGINT NOT NULL
status TEXT NOT NULL DEFAULT 'processing' -- processing | ready | error
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- chunks table
id UUID PRIMARY KEY
document_id UUID REFERENCES documents(id) ON DELETE CASCADE
content TEXT NOT NULL
page_number INTEGER NOT NULL
chunk_index INTEGER NOT NULL
embedding vector(384) NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Acceptance Criteria:**

- [ ] Migration files in `backend/migrations/`
- [ ] `pgvector` extension is created via migration
- [ ] Index on `chunks.embedding` using `ivfflat` or `hnsw`
- [ ] Go backend applies migrations on startup
- [ ] `make db-reset` works correctly

---

## Milestone 2: Embedding Service (Python)

### Issue #3 — PDF text extraction with page tracking

**Labels:** `embedding-service`, `feature`

**Description:**

Build the PDF parser using PyMuPDF. Must extract text page by page and
preserve page numbers so we can cite them later.

**Acceptance Criteria:**

- [ ] `POST /parse` accepts a PDF file upload
- [ ] Returns JSON array of `{ page_number, text }` objects
- [ ] Handles multi-page PDFs correctly
- [ ] Gracefully handles empty pages (skips them)
- [ ] Returns 400 for non-PDF files
- [ ] Unit tests with a sample PDF

---

### Issue #4 — Text chunking with overlap

**Labels:** `embedding-service`, `feature`

**Description:**

Implement a text chunker that splits extracted text into overlapping chunks.
Each chunk must carry its source page number.

**Chunking strategy:**
- Split by sentences (not mid-word or mid-sentence)
- Target chunk size: ~512 tokens (configurable via env var)
- Overlap: ~64 tokens between consecutive chunks
- If a chunk spans multiple pages, track all page numbers

**Acceptance Criteria:**

- [ ] `chunker.py` with a `chunk_text(pages, chunk_size, overlap)` function
- [ ] Chunks never split mid-sentence
- [ ] Each chunk includes `page_numbers: list[int]`
- [ ] Configurable chunk size and overlap via environment variables
- [ ] Unit tests covering edge cases (single page, very long page, empty pages)

---

### Issue #5 — Embedding generation with sentence-transformers

**Labels:** `embedding-service`, `feature`

**Description:**

Wrap `sentence-transformers` to generate 384-dimensional embeddings using the
`all-MiniLM-L6-v2` model. The model should be downloaded and cached on first
startup.

**Acceptance Criteria:**

- [ ] `POST /embed` accepts `{ texts: string[] }` and returns `{ embeddings: float[][] }`
- [ ] Uses `all-MiniLM-L6-v2` by default, configurable via `EMBEDDING_MODEL` env var
- [ ] Model is loaded once at startup (not per-request)
- [ ] Batch embedding for multiple texts in a single call
- [ ] `GET /health` returns model status and name
- [ ] Dockerfile builds and caches the model layer

---

### Issue #6 — Embedding service FastAPI application

**Labels:** `embedding-service`, `feature`

**Description:**

Wire together the PDF parser, chunker, and embedder into a FastAPI application.
This is the glue that ties Issues #3, #4, and #5 together.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | /parse | Upload PDF → returns chunks with page numbers |
| POST | /embed | Text array → returns embedding vectors |
| GET | /health | Service status |

**Acceptance Criteria:**

- [ ] All three endpoints working
- [ ] Request/response validation with Pydantic models
- [ ] Proper error handling and HTTP status codes
- [ ] Structured logging
- [ ] Dockerfile with multi-stage build
- [ ] Integration tests

---

## Milestone 3: Go Backend

### Issue #7 — Backend project scaffolding and config

**Labels:** `backend`, `setup`

**Description:**

Set up the Go backend with Gin, configuration loading, database connection,
and middleware (CORS, logging, request ID).

**Acceptance Criteria:**

- [ ] `cmd/api/main.go` — application entrypoint
- [ ] Config loaded from environment variables
- [ ] PostgreSQL connection pool with pgx
- [ ] CORS middleware (allow frontend origin)
- [ ] Request logging middleware
- [ ] `GET /api/v1/health` endpoint
- [ ] Graceful shutdown on SIGINT/SIGTERM

---

### Issue #8 — Document upload endpoint

**Labels:** `backend`, `feature`

**Description:**

Implement the `POST /api/v1/documents` endpoint. This receives a PDF,
stores it, calls the embedding service to parse + chunk + embed it,
and stores all chunks with their vectors in PostgreSQL.

**Flow:**
1. Receive multipart file upload
2. Validate it's a PDF and within size limit
3. Save file to disk
4. Insert document record with status `processing`
5. Call embedding service `/parse` to extract chunks
6. Call embedding service `/embed` to generate vectors
7. Insert all chunks with vectors into `chunks` table
8. Update document status to `ready`

**Acceptance Criteria:**

- [ ] File size validation (configurable max)
- [ ] PDF-only validation
- [ ] Processing runs asynchronously (return 202 immediately)
- [ ] Document status transitions: `processing` → `ready` or `error`
- [ ] Error handling if embedding service is down
- [ ] Unit tests with mocked services

---

### Issue #9 — Document listing and deletion endpoints

**Labels:** `backend`, `feature`

**Description:**

Implement CRUD-ish endpoints for documents (no update — just list, get, delete).

**Endpoints:**
- `GET /api/v1/documents` — list all, sorted by created_at desc
- `GET /api/v1/documents/:id` — get one with chunk count
- `DELETE /api/v1/documents/:id` — delete document, chunks, and file

**Acceptance Criteria:**

- [ ] List returns `id`, `filename`, `page_count`, `status`, `created_at`, `chunk_count`
- [ ] Get includes all list fields
- [ ] Delete cascades to chunks (via FK) and removes the file from disk
- [ ] 404 for non-existent IDs
- [ ] Unit tests

---

### Issue #10 — Vector search and query endpoint

**Labels:** `backend`, `feature`, `core`

**Description:**

This is the heart of the RAG system. Implement the `POST /api/v1/query`
endpoint that:

1. Embeds the user's question via the embedding service
2. Runs a cosine similarity search against `chunks.embedding` in PostgreSQL
3. Returns the top-K most relevant chunks with their page numbers

**Request:**
```json
{
  "question": "What are the main findings?",
  "document_id": "uuid",  // optional — if omitted, search all docs
  "top_k": 5              // optional — default 5
}
```

**Acceptance Criteria:**

- [ ] Vector search using pgvector `<=>` operator (cosine distance)
- [ ] Configurable `top_k` (default 5, max 20)
- [ ] Optional document_id filter
- [ ] Returns chunks with `content`, `page_numbers`, `similarity_score`
- [ ] Response time < 200ms for 10K chunks
- [ ] Unit tests

---

### Issue #11 — LLM answer generation with Ollama

**Labels:** `backend`, `feature`, `core`

**Description:**

After retrieving relevant chunks (Issue #10), construct a prompt and send it to
the local Ollama instance to generate an answer with citations.

**Prompt template:**
```
You are a helpful assistant that answers questions based only on the provided
context. Always cite the page number(s) where you found the information.
If the context doesn't contain the answer, say so.

Context:
[Page 3] Lorem ipsum dolor sit amet...
[Page 7] Consectetur adipiscing elit...

Question: {user_question}

Answer:
```

**Acceptance Criteria:**

- [ ] Prompt construction from chunks with page citations
- [ ] Streaming response from Ollama to client (SSE)
- [ ] Timeout handling (configurable, default 60s)
- [ ] Fallback message if Ollama is unavailable
- [ ] Response includes `sources: [{ page_number, snippet }]`
- [ ] Integration test with Ollama running

---

## Milestone 4: Next.js Frontend

### Issue #12 — Frontend project setup and layout

**Labels:** `frontend`, `setup`

**Description:**

Initialize the Next.js 14 app with TypeScript, Tailwind CSS, and a clean layout.

**Acceptance Criteria:**

- [ ] Next.js 14 with App Router
- [ ] TypeScript strict mode
- [ ] Tailwind CSS configured
- [ ] Root layout with header and main content area
- [ ] Responsive design (mobile-friendly)
- [ ] API client utility (`lib/api.ts`)
- [ ] Type definitions for all API responses

---

### Issue #13 — PDF upload interface

**Labels:** `frontend`, `feature`

**Description:**

Build the document upload UI with drag-and-drop, progress indication, and
document list.

**Acceptance Criteria:**

- [ ] Drag-and-drop upload zone
- [ ] File type validation (PDF only, client-side)
- [ ] Upload progress indicator
- [ ] Document list showing filename, page count, status, upload date
- [ ] Status badge (processing/ready/error)
- [ ] Delete button with confirmation
- [ ] Empty state when no documents uploaded

---

### Issue #14 — Chat interface with streaming responses

**Labels:** `frontend`, `feature`, `core`

**Description:**

Build the question-answer chat interface. This is the main user experience.

**Acceptance Criteria:**

- [ ] Text input for questions
- [ ] Document selector dropdown (or "search all")
- [ ] Streaming response display (SSE)
- [ ] Page citations displayed as clickable badges
- [ ] Chat history within the session (in-memory)
- [ ] Loading state while waiting for response
- [ ] Error state if backend is unavailable
- [ ] "Ask another question" flow

---

### Issue #15 — Source citation panel

**Labels:** `frontend`, `feature`

**Description:**

When the LLM answer references page numbers, show a side panel or expandable
section with the actual source chunks.

**Acceptance Criteria:**

- [ ] Clickable page citations in the answer
- [ ] Expandable panel showing the source chunk text
- [ ] Page number and similarity score displayed
- [ ] Highlight the most relevant portions
- [ ] Smooth expand/collapse animation

---

## Milestone 5: Polish & Production Readiness

### Issue #16 — Error handling and resilience

**Labels:** `backend`, `frontend`, `reliability`

**Description:**

Add comprehensive error handling, retries, and user-friendly error messages
across all services.

**Acceptance Criteria:**

- [ ] Backend: structured error responses with error codes
- [ ] Backend: retry logic for embedding service calls (3 attempts, exponential backoff)
- [ ] Backend: circuit breaker for Ollama (fail fast if down)
- [ ] Frontend: toast notifications for errors
- [ ] Frontend: retry button for failed uploads
- [ ] Embedding service: graceful handling of corrupt PDFs

---

### Issue #17 — End-to-end integration test

**Labels:** `testing`, `ci`

**Description:**

Write an end-to-end test that uploads a known PDF, asks a question, and
verifies the answer contains correct page citations.

**Acceptance Criteria:**

- [ ] Test script in `scripts/e2e-test.sh`
- [ ] Uses a sample PDF committed to the repo (`docs/sample.pdf`)
- [ ] Uploads the PDF via API
- [ ] Waits for processing to complete
- [ ] Asks a question whose answer is on a known page
- [ ] Asserts the response contains the correct page number
- [ ] Can run in CI (with Ollama stubbed or using a small model)

---

### Issue #18 — Documentation and demo

**Labels:** `docs`

**Description:**

Create comprehensive documentation and a demo GIF/video for the README.

**Acceptance Criteria:**

- [ ] Architecture diagram (Mermaid or image)
- [ ] API reference in `docs/api.md`
- [ ] Local development guide in `docs/development.md`
- [ ] Troubleshooting guide in `docs/troubleshooting.md`
- [ ] Demo GIF in README showing upload → question → answer flow
- [ ] Blog-style write-up of design decisions in `docs/design.md`
