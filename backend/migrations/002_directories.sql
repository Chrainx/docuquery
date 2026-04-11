-- Migration 002: Directories
-- Adds directories table and directory_id to documents for grouping with shared context.

-- ============================================================================
-- Directories table
-- ============================================================================

CREATE TABLE IF NOT EXISTS directories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_directories_created_at ON directories (created_at DESC);

-- ============================================================================
-- Link documents to directories
-- ============================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS directory_id UUID REFERENCES directories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_directory_id ON documents (directory_id);
