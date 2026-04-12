-- Add optional display name to documents.
-- Falls back to filename when NULL.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS display_name TEXT;
