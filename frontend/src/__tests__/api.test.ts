/**
 * Tests for the API client utility.
 *
 * These tests mock fetch to verify the client sends correct requests
 * and handles responses/errors properly.
 */

import { listDocuments, uploadDocument, deleteDocument, checkHealth } from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkHealth", () => {
  it("returns health status on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "healthy" }),
    });

    const result = await checkHealth();
    expect(result.status).toBe("healthy");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/health"),
      expect.any(Object),
    );
  });
});

describe("listDocuments", () => {
  it("returns array of documents", async () => {
    const docs = [
      {
        id: "abc-123",
        filename: "test.pdf",
        page_count: 10,
        file_size_bytes: 1024,
        status: "ready",
        chunk_count: 20,
        created_at: "2024-01-01T00:00:00Z",
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => docs,
    });

    const result = await listDocuments();
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("test.pdf");
  });

  it("throws on server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ error: "database down" }),
    });

    await expect(listDocuments()).rejects.toThrow("database down");
  });
});

describe("uploadDocument", () => {
  it("sends file as multipart form data", async () => {
    const file = new File(["fake pdf content"], "report.pdf", {
      type: "application/pdf",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "new-id",
        filename: "report.pdf",
        status: "processing",
      }),
    });

    const result = await uploadDocument(file);
    expect(result.id).toBe("new-id");
    expect(result.status).toBe("processing");

    // Verify FormData was sent
    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe("POST");
    expect(call[1].body).toBeInstanceOf(FormData);
  });
});

describe("deleteDocument", () => {
  it("sends DELETE request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deleted: true }),
    });

    await deleteDocument("doc-id-123");

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain("/documents/doc-id-123");
    expect(call[1].method).toBe("DELETE");
  });
});
