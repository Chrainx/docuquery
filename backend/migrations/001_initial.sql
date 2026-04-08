-- Migration 001: Initial schema
-- Creates the documents and chunks tables with pgvector support.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Documents table
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename        TEXT NOT NULL,
    page_count      INTEGER NOT NULL DEFAULT 0,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'ready', 'error')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);

-- ============================================================================
-- Chunks table
-- ============================================================================

CREATE TABLE IF NOT EXISTS chunks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content       TEXT NOT NULL,
    page_numbers  INTEGER[] NOT NULL,
    chunk_index   INTEGER NOT NULL,
    embedding     vector(384) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id);

-- HNSW index for fast approximate nearest neighbor search.
-- ef_construction=128 and m=16 are good defaults for medium datasets.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);
