// =============================================================================
// API Types — mirrors the Go backend models
// =============================================================================

export type DocumentStatus = "processing" | "ready" | "error";

export interface Directory {
  id: string;
  name: string;
  description?: string;
  document_count: number;
  created_at: string;
}

export interface Document {
  id: string;
  filename: string;
  page_count: number;
  file_size_bytes: number;
  status: DocumentStatus;
  chunk_count: number;
  error_message?: string;
  directory_id?: string;
  created_at: string;
}

export interface SourceChunk {
  content: string;
  page_numbers: number[];
  similarity_score: number;
  document_id: string;
  filename: string;
}

export interface QueryResponse {
  answer: string;
  sources: SourceChunk[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  timestamp: Date;
}

// Context modes for querying
export type QueryContextMode = "all" | "document" | "directory";
