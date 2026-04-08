// =============================================================================
// API Types — mirrors the Go backend models
// =============================================================================

export type DocumentStatus = "processing" | "ready" | "error";

export interface Document {
  id: string;
  filename: string;
  page_count: number;
  file_size_bytes: number;
  status: DocumentStatus;
  chunk_count: number;
  error_message?: string;
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
