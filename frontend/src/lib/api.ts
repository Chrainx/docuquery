// =============================================================================
// API Client — communicates with the Go backend
// =============================================================================

import type { Document, QueryResponse, SourceChunk } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(file: File): Promise<{ id: string; filename: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);

  return request("/documents", {
    method: "POST",
    body: formData,
  });
}

export async function listDocuments(): Promise<Document[]> {
  return request("/documents");
}

export async function getDocument(id: string): Promise<Document> {
  return request(`/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  await request(`/documents/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function queryDocument(
  question: string,
  documentId?: string,
  topK: number = 5,
): Promise<QueryResponse> {
  return request("/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      document_id: documentId || undefined,
      top_k: topK,
    }),
  });
}

// ---------------------------------------------------------------------------
// Streaming Query (SSE)
// ---------------------------------------------------------------------------

export async function queryDocumentStream(
  question: string,
  documentId: string | undefined,
  topK: number,
  onToken: (token: string) => void,
  onSources: (sources: SourceChunk[]) => void,
  onError: (error: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      document_id: documentId || undefined,
      top_k: topK,
    }),
  });

  // If the response is JSON (not SSE), it's an error or a "no results" response.
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await res.json();
    if (!res.ok) {
      onError(body.error || "Request failed");
      return;
    }
    // Non-streaming fallback (e.g. "no relevant content found").
    onToken(body.answer || "");
    onSources(body.sources || []);
    return;
  }

  if (!res.body) {
    onError("Streaming not supported by browser");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from the buffer.
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep the incomplete last line in the buffer.

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6);
        switch (currentEvent) {
          case "token":
            try {
              onToken(JSON.parse(data));
            } catch (_e) {
              onToken(data);
            }
            break;
          case "sources":
            try {
              onSources(JSON.parse(data));
            } catch (_e) {
              // Ignore malformed source data.
            }
            break;
          case "error":
            try {
              const err = JSON.parse(data);
              onError(err.error || "Generation failed");
            } catch (_e) {
              onError("Generation failed");
            }
            break;
          case "done":
            break;
        }
        currentEvent = "";
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<{ status: string }> {
  return request("/health");
}

export { ApiError };
