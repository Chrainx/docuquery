# DocuQuery

**Ask questions about any PDF and get answers with exact page citations — 100% local, 100% free.**

DocuQuery is a full-stack Retrieval-Augmented Generation (RAG) system built from scratch. No LangChain, no API keys, no cloud dependencies. Every piece — chunking, embedding, vector search, prompt construction, and answer generation — is implemented by hand.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14+-000000?logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Next.js    │────▶│   Go (Gin)   │────▶│   PostgreSQL     │
│   Frontend   │◀────│   Backend    │◀────│   + pgvector     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                           │  ▲
                      ┌────▼──┴────┐     ┌──────────────────┐
                      │  Python    │     │   Ollama          │
                      │  Embedding │     │   (Llama 3.1 8B) │
                      │  Service   │     └──────────────────┘
                      └────────────┘
```

1. **Upload** a PDF through the web interface
2. **Extract** text from the PDF using PyMuPDF
3. **Chunk** the text into overlapping segments with page tracking
4. **Embed** each chunk into a 384-dimensional vector using `all-MiniLM-L6-v2`
5. **Store** chunks and vectors in PostgreSQL with pgvector
6. **Query** — your question is embedded, and the most similar chunks are retrieved via cosine similarity
7. **Generate** — retrieved chunks + your question are sent to a local Llama 3.1 model
8. **Cite** — the answer includes page numbers from the source PDF

## Architecture

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14, TypeScript, Tailwind CSS | Server components, type safety, rapid styling |
| Backend | Go 1.22+, Gin | High performance, strong typing, excellent concurrency |
| Database | PostgreSQL 16 + pgvector | Production-grade vector search with full SQL support |
| Embeddings | Python + sentence-transformers | Local inference, no API keys, `all-MiniLM-L6-v2` |
| PDF Parsing | Python + PyMuPDF | Fast, accurate text extraction with page metadata |
| LLM | Ollama (Llama 3.1 8B) | Local inference, no API keys, good quality/speed tradeoff |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- [Ollama](https://ollama.ai/) installed locally
- ~8 GB RAM available (for the LLM)
- ~5 GB disk space (model weights + Docker images)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Chrainx/docuquery.git
cd docuquery

# 2. Copy environment variables
cp .env.example .env

# 3. Pull the LLM model
ollama pull llama3.2:1b

# 4. Start all services
make up

# 5. Open the app
open http://localhost:3000
```

## Development

```bash
# Start infrastructure only (DB + Ollama)
make infra

# Run backend (hot reload)
make dev-backend

# Run frontend (hot reload)
make dev-frontend

# Run embedding service (hot reload)
make dev-embedding

# Run all tests
make test

# Run linters
make lint

# Reset database
make db-reset
```

## Project Structure

```
docuquery/
├── frontend/                 # Next.js 14 application
│   ├── src/
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # API client, utilities
│   │   └── types/           # TypeScript type definitions
│   └── package.json
├── backend/                  # Go API server
│   ├── cmd/api/             # Application entrypoint
│   ├── internal/
│   │   ├── handlers/        # HTTP request handlers
│   │   ├── middleware/      # CORS, logging, auth
│   │   ├── models/          # Data structures
│   │   ├── services/        # Business logic
│   │   └── config/          # Configuration loading
│   ├── migrations/          # SQL migration files
│   └── go.mod
├── embedding-service/        # Python FastAPI service
│   ├── app/
│   │   ├── main.py          # FastAPI application
│   │   ├── embedder.py      # Sentence transformer wrapper
│   │   ├── chunker.py       # Text chunking logic
│   │   └── pdf_parser.py    # PDF text extraction
│   ├── tests/
│   └── requirements.txt
├── scripts/                  # Utility scripts
├── docs/                     # Additional documentation
├── docker-compose.yml        # Full stack orchestration
├── Makefile                  # Developer commands
└── .github/
    ├── workflows/           # CI/CD pipelines
    └── ISSUE_TEMPLATE/      # Standardized issue templates
```

## API Endpoints

### Backend (Go) — `:8080`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/documents` | Upload a PDF |
| `GET` | `/api/v1/documents` | List all documents |
| `GET` | `/api/v1/documents/:id` | Get document details |
| `DELETE` | `/api/v1/documents/:id` | Delete a document |
| `POST` | `/api/v1/query` | Ask a question |
| `GET` | `/api/v1/health` | Health check |

### Embedding Service (Python) — `:8001`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/embed` | Generate embeddings for text chunks |
| `POST` | `/parse` | Extract text from PDF and return chunks |
| `GET` | `/health` | Health check |

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
