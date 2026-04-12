# DocuQuery API Reference

Base URL: `http://localhost:8080/api/v1`

---

## Health

### `GET /health`

Check service health.

**Response** `200 OK`
```json
{
  "status": "healthy"
}
```

**Response** `503 Service Unavailable`
```json
{
  "status": "unhealthy",
  "error": "database connection failed"
}
```

---

## Documents

### `POST /documents`

Upload a PDF document for processing.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | PDF file (max 50 MB) |
| `directory_id` | UUID | No | Assign document to a directory immediately on upload |

**Response** `202 Accepted`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "filename": "annual-report-2024.pdf",
  "status": "processing",
  "directory_id": "661e9511-f30c-52e5-b827-557766551111"
}
```

`directory_id` is `null` if not provided.

The document is processed asynchronously. Poll `GET /documents/:id` to check
when processing completes.

**Error Responses:**
- `400` — Not a PDF file
- `413` — File exceeds size limit

---

### `GET /documents`

List all documents. Optionally filter by directory.

**Query params:** `directory_id` (optional UUID) — return only documents in this directory.

**Response** `200 OK`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "annual-report-2024.pdf",
    "page_count": 42,
    "file_size_bytes": 2548736,
    "status": "ready",
    "chunk_count": 87,
    "directory_id": "661e9511-f30c-52e5-b827-557766551111",
    "created_at": "2024-06-15T10:30:00Z"
  }
]
```

---

### `GET /documents/:id`

Get a single document by ID.

**Response** `200 OK` — Same shape as list item above.

**Response** `404 Not Found`
```json
{
  "error": "document not found"
}
```

---

### `DELETE /documents/:id`

Delete a document and all its chunks.

**Response** `200 OK`
```json
{
  "deleted": true
}
```

---

### `PATCH /documents/:id`

Update a document's directory assignment and/or display name. All fields are optional.

**Request body**
```json
{
  "directory_id": "661e9511-f30c-52e5-b827-557766551111",
  "display_name": "Q3 Report"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `directory_id` | UUID \| null | Assign to a directory; `null` to unassign |
| `display_name` | string | Human-readable label shown instead of the filename; `""` to clear |

**Response** `200 OK`
```json
{
  "updated": true
}
```

---

## Directories

### `POST /directories`

Create a new directory.

**Request body**
```json
{
  "name": "Lecture Notes",
  "description": "CS3219 semester 2"
}
```

**Response** `201 Created`
```json
{
  "id": "661e9511-f30c-52e5-b827-557766551111",
  "name": "Lecture Notes",
  "description": "CS3219 semester 2",
  "document_count": 0,
  "created_at": "2024-06-15T10:30:00Z"
}
```

---

### `GET /directories`

List all directories with their document counts.

**Response** `200 OK`
```json
[
  {
    "id": "661e9511-f30c-52e5-b827-557766551111",
    "name": "Lecture Notes",
    "description": "CS3219 semester 2",
    "document_count": 5,
    "created_at": "2024-06-15T10:30:00Z"
  }
]
```

---

### `GET /directories/:id`

Get a single directory.

**Response** `200 OK` — Same shape as list item above.

**Response** `404 Not Found`

---

### `PATCH /directories/:id`

Rename or update the description of a directory.

**Request body**
```json
{
  "name": "New Name",
  "description": "Updated description"
}
```

**Response** `200 OK`
```json
{
  "updated": true
}
```

---

### `DELETE /directories/:id`

Delete a directory. Documents inside are **not** deleted — they are unassigned (their `directory_id` is set to null).

**Response** `200 OK`
```json
{
  "deleted": true
}
```

---

## Query

### `POST /query`

Ask a question and get an answer with citations (non-streaming).

**Request:** `application/json`
```json
{
  "question": "What were the key findings?",
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "top_k": 5
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `question` | string | Yes | — | The question (3-1000 chars) |
| `document_id` | UUID | No | — | Restrict search to one document |
| `directory_id` | UUID | No | — | Restrict search to all docs in a directory (shared context) |
| `top_k` | int | No | 5 | Number of chunks to retrieve (max 20) |

If both `document_id` and `directory_id` are omitted, all documents are searched. If `document_id` is set it takes precedence over `directory_id`.

**Response** `200 OK`
```json
{
  "answer": "The key findings include... [Page 7] ...",
  "sources": [
    {
      "content": "In our analysis, we found three major trends...",
      "page_numbers": [7],
      "similarity_score": 0.89,
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "annual-report-2024.pdf"
    }
  ]
}
```

---

### `POST /query/stream`

Ask a question and receive a streaming answer via Server-Sent Events.

**Request:** Same as `POST /query`.

**Response:** `text/event-stream`

The response is a stream of SSE events:

```
event: token
data: "The"

event: token
data: " key"

event: token
data: " findings"

event: sources
data: [{"content":"...","page_numbers":[7],"similarity_score":0.89,...}]

event: done
data: {}
```

**Event types:**

| Event | Data | Description |
|-------|------|-------------|
| `token` | JSON string | A single generated token |
| `sources` | JSON array | Source chunks with citations (sent after generation) |
| `done` | `{}` | Stream complete |
| `error` | `{"error":"..."}` | An error occurred during generation |

**Note:** If no relevant chunks are found, the endpoint falls back to a
standard JSON response (not SSE) with a "no content found" message.

---

## Embedding Service

Base URL: `http://localhost:8001`

These endpoints are internal — called by the Go backend, not by the frontend.

### `GET /health`

```json
{
  "status": "healthy",
  "model": "all-MiniLM-L6-v2",
  "dimension": 384
}
```

### `POST /parse`

Upload a PDF and receive chunked text with page numbers.

**Request:** `multipart/form-data` with `file` field.

**Response:**
```json
{
  "filename": "report.pdf",
  "page_count": 10,
  "chunks": [
    {
      "text": "Chapter 1: Introduction...",
      "page_numbers": [1],
      "chunk_index": 0
    }
  ]
}
```

### `POST /embed`

Generate embeddings for text.

**Request:**
```json
{
  "texts": ["First chunk text", "Second chunk text"]
}
```

**Response:**
```json
{
  "embeddings": [[0.023, -0.041, ...], [0.015, 0.032, ...]],
  "dimension": 384,
  "count": 2
}
```
