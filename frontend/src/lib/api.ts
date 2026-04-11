// =============================================================================
// API Client — communicates with the Go backend
// =============================================================================

import type { Directory, Document, QueryResponse, SourceChunk } from "@/types";

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
// Directories
// ---------------------------------------------------------------------------

export async function listDirectories(): Promise<Directory[]> {
  return request("/directories");
}

export async function getDirectory(id: string): Promise<Directory> {
  return request(`/directories/${id}`);
}

export async function createDirectory(name: string, description?: string): Promise<Directory> {
  return request("/directories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteDirectory(id: string): Promise<void> {
  await request(`/directories/${id}`, { method: "DELETE" });
}

export async function updateDirectory(
  id: string,
  name: string,
  description?: string,
): Promise<void> {
  await request(`/directories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? "" }),
  });
}

export async function assignDocumentToDirectory(
  documentId: string,
  directoryId: string | null,
): Promise<void> {
  await request(`/documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory_id: directoryId }),
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(
  file: File,
  directoryId?: string,
): Promise<{ id: string; filename: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (directoryId) formData.append("directory_id", directoryId);

  return request("/documents", {
    method: "POST",
    body: formData,
  });
}

export async function listDocuments(directoryId?: string): Promise<Document[]> {
  const qs = directoryId ? `?directory_id=${directoryId}` : "";
  return request(`/documents${qs}`);
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
  directoryId?: string,
  topK: number = 5,
): Promise<QueryResponse> {
  return request("/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      document_id: documentId || undefined,
      directory_id: directoryId || undefined,
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
  directoryId: string | undefined,
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
      directory_id: directoryId || undefined,
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

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

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
