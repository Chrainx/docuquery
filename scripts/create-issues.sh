#!/usr/bin/env bash
# =============================================================================
# Create GitHub Issues for DocuQuery
#
# Prerequisites:
#   - GitHub CLI installed and authenticated: https://cli.github.com
#   - Repository already created on GitHub
#
# Usage:
#   ./scripts/create-issues.sh
#
# This script creates all 18 issues organized into 5 milestones.
# Run it ONCE after pushing the initial commit.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}→ $1${NC}"; }
pass()  { echo -e "${GREEN}✓ $1${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $1${NC}"; }

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------

if ! command -v gh &> /dev/null; then
  echo -e "${RED}Error: GitHub CLI (gh) is not installed.${NC}"
  echo "Install it from https://cli.github.com"
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo -e "${RED}Error: Not authenticated with GitHub CLI.${NC}"
  echo "Run: gh auth login"
  exit 1
fi

# ---------------------------------------------------------------------------
# Create Milestones
# ---------------------------------------------------------------------------

info "Creating milestones..."

create_milestone() {
  local title="$1"
  local desc="$2"
  if gh api repos/:owner/:repo/milestones --jq ".[].title" 2>/dev/null | grep -qF "$title"; then
    warn "Milestone '$title' already exists, skipping"
  else
    gh api repos/:owner/:repo/milestones -f title="$title" -f description="$desc" -f state="open" > /dev/null
    pass "Created milestone: $title"
  fi
}

create_milestone "M1: Infrastructure & Setup" "Project scaffolding, CI/CD, database schema"
create_milestone "M2: Embedding Service" "PDF parsing, chunking, embedding generation (Python)"
create_milestone "M3: Go Backend" "API server, document management, vector search, LLM integration"
create_milestone "M4: Frontend" "Next.js UI — upload, chat, citations"
create_milestone "M5: Polish & Production" "Error handling, E2E tests, documentation"

# Get milestone numbers
M1=$(gh api repos/:owner/:repo/milestones --jq '.[] | select(.title | startswith("M1")) | .number')
M2=$(gh api repos/:owner/:repo/milestones --jq '.[] | select(.title | startswith("M2")) | .number')
M3=$(gh api repos/:owner/:repo/milestones --jq '.[] | select(.title | startswith("M3")) | .number')
M4=$(gh api repos/:owner/:repo/milestones --jq '.[] | select(.title | startswith("M4")) | .number')
M5=$(gh api repos/:owner/:repo/milestones --jq '.[] | select(.title | startswith("M5")) | .number')

# ---------------------------------------------------------------------------
# Create Labels
# ---------------------------------------------------------------------------

info "Creating labels..."

create_label() {
  local name="$1"
  local color="$2"
  if gh label list --search "$name" 2>/dev/null | grep -qF "$name"; then
    :
  else
    gh label create "$name" --color "$color" --force > /dev/null 2>&1 || true
  fi
}

create_label "setup"             "c5def5"
create_label "ci"                "d4c5f9"
create_label "backend"           "0075ca"
create_label "frontend"          "7057ff"
create_label "database"          "006b75"
create_label "embedding-service" "e99695"
create_label "feature"           "a2eeef"
create_label "core"              "d93f0b"
create_label "reliability"       "fbca04"
create_label "testing"           "0e8a16"
create_label "docs"              "0075ca"

pass "Labels ready"

# ---------------------------------------------------------------------------
# Create Issues
# ---------------------------------------------------------------------------

info "Creating issues..."

create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"
  local milestone="$4"

  gh issue create \
    --title "$title" \
    --body "$body" \
    --label "$labels" \
    --milestone "$milestone" \
    > /dev/null

  pass "Created: $title"
}

# --- Milestone 1 ---

create_issue \
  "Initialize project structure and CI/CD" \
  "Set up the monorepo with all services, Docker Compose, Makefile, and GitHub Actions.

**Acceptance Criteria:**
- [ ] Project structure matches README
- [ ] \`docker compose up\` starts PostgreSQL with pgvector extension enabled
- [ ] CI workflow runs on push to \`main\` and on PRs
- [ ] \`make help\` lists all available commands
- [ ] \`.env.example\` documents every environment variable
- [ ] README, LICENSE, and CONTRIBUTING.md are in place" \
  "setup,ci" \
  "$M1"

create_issue \
  "Database schema and migrations" \
  "Create PostgreSQL schema for documents, chunks, and embeddings. Write SQL migration files.

**Schema:** documents (id, filename, page_count, file_size_bytes, status, created_at), chunks (id, document_id, content, page_number, chunk_index, embedding vector(384))

**Acceptance Criteria:**
- [ ] Migration files in \`backend/migrations/\`
- [ ] pgvector extension created via migration
- [ ] HNSW index on \`chunks.embedding\`
- [ ] Go backend applies migrations on startup
- [ ] \`make db-reset\` works" \
  "backend,database" \
  "$M1"

# --- Milestone 2 ---

create_issue \
  "PDF text extraction with page tracking" \
  "Build PDF parser using PyMuPDF. Extract text page by page, preserving page numbers.

**Acceptance Criteria:**
- [ ] \`POST /parse\` accepts PDF file upload
- [ ] Returns JSON array of \`{ page_number, text }\`
- [ ] Handles multi-page PDFs correctly
- [ ] Gracefully handles empty pages
- [ ] Returns 400 for non-PDF files
- [ ] Unit tests with sample PDF" \
  "embedding-service,feature" \
  "$M2"

create_issue \
  "Text chunking with overlap" \
  "Implement text chunker splitting extracted text into overlapping chunks preserving sentence boundaries.

**Acceptance Criteria:**
- [ ] \`chunker.py\` with \`chunk_text(pages, chunk_size, overlap)\`
- [ ] Chunks never split mid-sentence
- [ ] Each chunk includes \`page_numbers: list[int]\`
- [ ] Configurable chunk size and overlap via env vars
- [ ] Unit tests for edge cases" \
  "embedding-service,feature" \
  "$M2"

create_issue \
  "Embedding generation with sentence-transformers" \
  "Wrap sentence-transformers for 384-dim embeddings using all-MiniLM-L6-v2.

**Acceptance Criteria:**
- [ ] \`POST /embed\` accepts \`{ texts: string[] }\`, returns \`{ embeddings: float[][] }\`
- [ ] Configurable model via \`EMBEDDING_MODEL\` env var
- [ ] Model loaded once at startup
- [ ] Batch embedding support
- [ ] \`GET /health\` returns model status
- [ ] Dockerfile caches model layer" \
  "embedding-service,feature" \
  "$M2"

create_issue \
  "Embedding service FastAPI application" \
  "Wire together PDF parser, chunker, and embedder into a FastAPI application.

**Acceptance Criteria:**
- [ ] /parse, /embed, /health endpoints working
- [ ] Pydantic request/response validation
- [ ] Proper error handling and HTTP status codes
- [ ] Structured logging
- [ ] Multi-stage Dockerfile
- [ ] Integration tests" \
  "embedding-service,feature" \
  "$M2"

# --- Milestone 3 ---

create_issue \
  "Backend project scaffolding and config" \
  "Set up Go backend with Gin, config loading, database connection, and middleware.

**Acceptance Criteria:**
- [ ] \`cmd/api/main.go\` entrypoint
- [ ] Config from environment variables
- [ ] PostgreSQL connection pool with pgx
- [ ] CORS and request logging middleware
- [ ] \`GET /api/v1/health\` endpoint
- [ ] Graceful shutdown" \
  "backend,setup" \
  "$M3"

create_issue \
  "Document upload endpoint" \
  "Implement \`POST /api/v1/documents\` — receive PDF, store it, call embedding service, store chunks with vectors.

**Acceptance Criteria:**
- [ ] File size and PDF validation
- [ ] Async processing (return 202 immediately)
- [ ] Status transitions: processing → ready/error
- [ ] Error handling if embedding service is down
- [ ] Unit tests with mocked services" \
  "backend,feature" \
  "$M3"

create_issue \
  "Document listing and deletion endpoints" \
  "Implement GET /documents, GET /documents/:id, DELETE /documents/:id.

**Acceptance Criteria:**
- [ ] List returns id, filename, page_count, status, chunk_count
- [ ] Delete cascades to chunks via FK
- [ ] 404 for non-existent IDs
- [ ] Unit tests" \
  "backend,feature" \
  "$M3"

create_issue \
  "Vector search and query endpoint" \
  "Implement \`POST /api/v1/query\` — embed question, run cosine similarity search, return top-K chunks.

**Acceptance Criteria:**
- [ ] Vector search using pgvector \`<=>\` operator
- [ ] Configurable top_k (default 5, max 20)
- [ ] Optional document_id filter
- [ ] Returns chunks with content, page_numbers, similarity_score
- [ ] Response time < 200ms for 10K chunks
- [ ] Unit tests" \
  "backend,feature,core" \
  "$M3"

create_issue \
  "LLM answer generation with Ollama" \
  "After retrieving chunks, construct prompt and call Ollama for answer generation with citations.

**Acceptance Criteria:**
- [ ] Prompt construction with page citations
- [ ] Streaming response via SSE (\`POST /query/stream\`)
- [ ] Non-streaming fallback (\`POST /query\`)
- [ ] Timeout handling (configurable, default 60s)
- [ ] Fallback message if Ollama unavailable
- [ ] Response includes sources array" \
  "backend,feature,core" \
  "$M3"

# --- Milestone 4 ---

create_issue \
  "Frontend project setup and layout" \
  "Initialize Next.js 14 with TypeScript, Tailwind CSS, and clean layout.

**Acceptance Criteria:**
- [ ] App Router, TypeScript strict mode, Tailwind configured
- [ ] Root layout with header
- [ ] Responsive design
- [ ] API client utility (\`lib/api.ts\`)
- [ ] Type definitions for API responses" \
  "frontend,setup" \
  "$M4"

create_issue \
  "PDF upload interface" \
  "Build document upload UI with drag-and-drop, progress, and document list.

**Acceptance Criteria:**
- [ ] Drag-and-drop upload zone
- [ ] Client-side PDF validation
- [ ] Upload progress indicator
- [ ] Document list with status badges
- [ ] Delete with confirmation
- [ ] Empty state" \
  "frontend,feature" \
  "$M4"

create_issue \
  "Chat interface with streaming responses" \
  "Build the question-answer chat with SSE streaming.

**Acceptance Criteria:**
- [ ] Text input for questions
- [ ] Document selector dropdown
- [ ] Streaming response display (SSE)
- [ ] Page citations as clickable badges
- [ ] Session chat history (in-memory)
- [ ] Loading and error states" \
  "frontend,feature,core" \
  "$M4"

create_issue \
  "Source citation panel" \
  "Show expandable panel with source chunks when citations are clicked.

**Acceptance Criteria:**
- [ ] Clickable page citations in answers
- [ ] Expandable panel with chunk text
- [ ] Page number and similarity score displayed
- [ ] Smooth expand/collapse animation" \
  "frontend,feature" \
  "$M4"

# --- Milestone 5 ---

create_issue \
  "Error handling and resilience" \
  "Add comprehensive error handling, retries, and user-friendly error messages.

**Acceptance Criteria:**
- [ ] Structured error responses with error codes
- [ ] Retry logic for embedding service (3 attempts, exponential backoff)
- [ ] Circuit breaker for Ollama
- [ ] Frontend toast notifications
- [ ] Retry button for failed uploads
- [ ] Graceful handling of corrupt PDFs" \
  "backend,frontend,reliability" \
  "$M5"

create_issue \
  "End-to-end integration test" \
  "Write E2E test: upload known PDF, ask question, verify answer includes correct page citations.

**Acceptance Criteria:**
- [ ] Test script in \`scripts/e2e-test.sh\`
- [ ] Uses sample PDF in repo
- [ ] Uploads, waits for processing, queries, asserts page citations
- [ ] Can run in CI" \
  "testing,ci" \
  "$M5"

create_issue \
  "Documentation and demo" \
  "Create comprehensive docs and demo material.

**Acceptance Criteria:**
- [ ] Architecture diagram
- [ ] API reference in \`docs/api.md\`
- [ ] Local dev guide in \`docs/development.md\`
- [ ] Troubleshooting guide
- [ ] Demo GIF in README
- [ ] Design decisions write-up in \`docs/design.md\`" \
  "docs" \
  "$M5"

# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}✅ All 18 issues created with milestones and labels!${NC}"
echo ""
echo "View them at: $(gh repo view --json url -q .url)/issues"
