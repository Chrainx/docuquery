// Package handlers contains the HTTP request handlers for the API.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Chrainx/docuquery/backend/internal/models"
	"github.com/Chrainx/docuquery/backend/internal/services"
)

// Handler holds dependencies for all HTTP handlers.
type Handler struct {
	db              *pgxpool.Pool
	embeddingClient *services.EmbeddingClient
	ollamaClient    *services.OllamaClient
	maxUploadBytes  int64
	logger          *slog.Logger
}

// NewHandler creates a new Handler with all dependencies.
func NewHandler(
	db *pgxpool.Pool,
	embeddingClient *services.EmbeddingClient,
	ollamaClient *services.OllamaClient,
	maxUploadMB int,
	logger *slog.Logger,
) *Handler {
	return &Handler{
		db:              db,
		embeddingClient: embeddingClient,
		ollamaClient:    ollamaClient,
		maxUploadBytes:  int64(maxUploadMB) * 1024 * 1024,
		logger:          logger,
	}
}

// Health returns service health status.
func (h *Handler) Health(c *gin.Context) {
	err := h.db.Ping(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "unhealthy",
			"error":   "database connection failed",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

// UploadDocument handles PDF upload, parsing, embedding, and storage.
func (h *Handler) UploadDocument(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	if header.Size > h.maxUploadBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{
			"error": fmt.Sprintf("file exceeds maximum size of %d MB", h.maxUploadBytes/(1024*1024)),
		})
		return
	}

	pdfData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}

	// Validate it's a PDF (check magic bytes).
	if len(pdfData) < 4 || string(pdfData[:4]) != "%PDF" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file must be a PDF"})
		return
	}

	// Create document record.
	docID := uuid.New()
	_, err = h.db.Exec(c.Request.Context(),
		`INSERT INTO documents (id, filename, page_count, file_size_bytes, status)
		 VALUES ($1, $2, 0, $3, $4)`,
		docID, header.Filename, header.Size, models.StatusProcessing,
	)
	if err != nil {
		h.logger.Error("failed to insert document", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create document"})
		return
	}

	// Return immediately with 202 — process in background.
	c.JSON(http.StatusAccepted, gin.H{
		"id":       docID,
		"filename": header.Filename,
		"status":   models.StatusProcessing,
	})

	// Process asynchronously.
	go h.processDocument(context.Background(), docID, header.Filename, pdfData)
}

// processDocument handles the async work: parse → embed → store.
func (h *Handler) processDocument(ctx context.Context, docID uuid.UUID, filename string, pdfData []byte) {
	log := h.logger.With("document_id", docID, "filename", filename)
	log.Info("processing document")

	updateStatus := func(status models.DocumentStatus, errMsg string) {
		_, err := h.db.Exec(ctx,
			`UPDATE documents SET status = $1, error_message = $2 WHERE id = $3`,
			status, errMsg, docID,
		)
		if err != nil {
			log.Error("failed to update document status", "error", err)
		}
	}

	// 1. Parse PDF into chunks.
	parsed, err := h.embeddingClient.ParsePDF(ctx, filename, pdfData)
	if err != nil {
		log.Error("failed to parse PDF", "error", err)
		updateStatus(models.StatusError, fmt.Sprintf("PDF parsing failed: %v", err))
		return
	}

	// Update page count.
	_, _ = h.db.Exec(ctx, `UPDATE documents SET page_count = $1 WHERE id = $2`, parsed.PageCount, docID)

	if len(parsed.Chunks) == 0 {
		log.Warn("no chunks extracted from PDF")
		updateStatus(models.StatusError, "no text content found in PDF")
		return
	}

	// 2. Generate embeddings.
	texts := make([]string, len(parsed.Chunks))
	for i, chunk := range parsed.Chunks {
		texts[i] = chunk.Text
	}

	embedResp, err := h.embeddingClient.Embed(ctx, texts)
	if err != nil {
		log.Error("failed to generate embeddings", "error", err)
		updateStatus(models.StatusError, fmt.Sprintf("embedding failed: %v", err))
		return
	}

	// 3. Store chunks with embeddings.
	for i, chunk := range parsed.Chunks {
		chunkID := uuid.New()
		_, err := h.db.Exec(ctx,
			`INSERT INTO chunks (id, document_id, content, page_numbers, chunk_index, embedding)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			chunkID, docID, chunk.Text, chunk.PageNumbers, chunk.ChunkIndex,
			pgvectorString(embedResp.Embeddings[i]),
		)
		if err != nil {
			log.Error("failed to insert chunk", "chunk_index", i, "error", err)
			updateStatus(models.StatusError, fmt.Sprintf("chunk storage failed: %v", err))
			return
		}
	}

	updateStatus(models.StatusReady, "")
	log.Info("document processed successfully", "chunks", len(parsed.Chunks))
}

// ListDocuments returns all documents.
func (h *Handler) ListDocuments(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(),
		`SELECT d.id, d.filename, d.page_count, d.file_size_bytes, d.status, d.created_at,
		        COALESCE(d.error_message, ''),
		        COUNT(c.id) as chunk_count
		 FROM documents d
		 LEFT JOIN chunks c ON c.document_id = d.id
		 GROUP BY d.id
		 ORDER BY d.created_at DESC`,
	)
	if err != nil {
		h.logger.Error("failed to query documents", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list documents"})
		return
	}
	defer rows.Close()

	docs := []models.Document{}
	for rows.Next() {
		var doc models.Document
		err := rows.Scan(&doc.ID, &doc.Filename, &doc.PageCount, &doc.FileSizeBytes,
			&doc.Status, &doc.CreatedAt, &doc.ErrorMessage, &doc.ChunkCount)
		if err != nil {
			h.logger.Error("failed to scan document row", "error", err)
			continue
		}
		docs = append(docs, doc)
	}

	c.JSON(http.StatusOK, docs)
}

// GetDocument returns a single document by ID.
func (h *Handler) GetDocument(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document ID"})
		return
	}

	var doc models.Document
	err = h.db.QueryRow(c.Request.Context(),
		`SELECT d.id, d.filename, d.page_count, d.file_size_bytes, d.status, d.created_at,
		        COALESCE(d.error_message, ''),
		        COUNT(c.id) as chunk_count
		 FROM documents d
		 LEFT JOIN chunks c ON c.document_id = d.id
		 WHERE d.id = $1
		 GROUP BY d.id`,
		id,
	).Scan(&doc.ID, &doc.Filename, &doc.PageCount, &doc.FileSizeBytes,
		&doc.Status, &doc.CreatedAt, &doc.ErrorMessage, &doc.ChunkCount)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	c.JSON(http.StatusOK, doc)
}

// DeleteDocument removes a document and all its chunks.
func (h *Handler) DeleteDocument(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document ID"})
		return
	}

	result, err := h.db.Exec(c.Request.Context(), `DELETE FROM documents WHERE id = $1`, id)
	if err != nil {
		h.logger.Error("failed to delete document", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete document"})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// Query handles the RAG query: embed question → vector search → LLM generate.
func (h *Handler) Query(c *gin.Context) {
	var req models.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TopK <= 0 || req.TopK > 20 {
		req.TopK = 5
	}

	// 1. Embed the question.
	embedResp, err := h.embeddingClient.Embed(c.Request.Context(), []string{req.Question})
	if err != nil {
		h.logger.Error("failed to embed question", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process question"})
		return
	}

	queryVector := pgvectorString(embedResp.Embeddings[0])

	// 2. Vector search.
	sources, err := h.vectorSearch(c.Request.Context(), queryVector, req.DocumentID, req.TopK)
	if err != nil {
		h.logger.Error("vector search failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	if len(sources) == 0 {
		c.JSON(http.StatusOK, models.QueryResponse{
			Answer:  "No relevant content found. Please upload a document first.",
			Sources: []models.SourceChunk{},
		})
		return
	}

	// 3. Build prompt and generate answer.
	prompt := services.BuildPrompt(req.Question, sources)

	answer, err := h.ollamaClient.Generate(c.Request.Context(), prompt)
	if err != nil {
		h.logger.Error("LLM generation failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate answer"})
		return
	}

	c.JSON(http.StatusOK, models.QueryResponse{
		Answer:  answer,
		Sources: sources,
	})
}

// QueryStream handles the RAG query with Server-Sent Events streaming.
// The client receives tokens as they are generated by the LLM, then a final
// event with the source citations.
func (h *Handler) QueryStream(c *gin.Context) {
	var req models.QueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TopK <= 0 || req.TopK > 20 {
		req.TopK = 5
	}

	// 1. Embed the question.
	embedResp, err := h.embeddingClient.Embed(c.Request.Context(), []string{req.Question})
	if err != nil {
		h.logger.Error("failed to embed question", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process question"})
		return
	}

	queryVector := pgvectorString(embedResp.Embeddings[0])

	// 2. Vector search.
	sources, err := h.vectorSearch(c.Request.Context(), queryVector, req.DocumentID, req.TopK)
	if err != nil {
		h.logger.Error("vector search failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "search failed"})
		return
	}

	if len(sources) == 0 {
		c.JSON(http.StatusOK, models.QueryResponse{
			Answer:  "No relevant content found. Please upload a document first.",
			Sources: []models.SourceChunk{},
		})
		return
	}

	// 3. Set SSE headers and stream the LLM response.
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.Flush()

	prompt := services.BuildPrompt(req.Question, sources)

	err = h.ollamaClient.GenerateStream(c.Request.Context(), prompt, func(token string) error {
		// Send each token as an SSE "token" event.
		fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", jsonEscape(token))
		c.Writer.Flush()
		return nil
	})

	if err != nil {
		h.logger.Error("LLM streaming failed", "error", err)
		fmt.Fprintf(c.Writer, "event: error\ndata: {\"error\": \"generation failed\"}\n\n")
		c.Writer.Flush()
		return
	}

	// Send sources as the final event.
	sourcesJSON, _ := json.Marshal(sources)
	fmt.Fprintf(c.Writer, "event: sources\ndata: %s\n\n", string(sourcesJSON))
	fmt.Fprintf(c.Writer, "event: done\ndata: {}\n\n")
	c.Writer.Flush()
}

// vectorSearch extracts the common vector search logic used by both Query and QueryStream.
func (h *Handler) vectorSearch(ctx context.Context, queryVector string, documentID *uuid.UUID, topK int) ([]models.SourceChunk, error) {
	var query string
	var args []interface{}

	if documentID != nil {
		query = `SELECT c.content, c.page_numbers, 1 - (c.embedding <=> $1::vector) as similarity,
		                d.id, d.filename
		         FROM chunks c
		         JOIN documents d ON d.id = c.document_id
		         WHERE c.document_id = $2 AND d.status = 'ready'
		         ORDER BY c.embedding <=> $1::vector
		         LIMIT $3`
		args = []interface{}{queryVector, *documentID, topK}
	} else {
		query = `SELECT c.content, c.page_numbers, 1 - (c.embedding <=> $1::vector) as similarity,
		                d.id, d.filename
		         FROM chunks c
		         JOIN documents d ON d.id = c.document_id
		         WHERE d.status = 'ready'
		         ORDER BY c.embedding <=> $1::vector
		         LIMIT $2`
		args = []interface{}{queryVector, topK}
	}

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []models.SourceChunk
	for rows.Next() {
		var src models.SourceChunk
		if err := rows.Scan(&src.Content, &src.PageNumbers, &src.SimilarityScore,
			&src.DocumentID, &src.Filename); err != nil {
			h.logger.Error("failed to scan search result", "error", err)
			continue
		}
		sources = append(sources, src)
	}
	return sources, nil
}

// jsonEscape escapes a string for safe inclusion in a JSON value within SSE data lines.
func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// pgvectorString converts a float32 slice to pgvector's text format: [0.1,0.2,0.3].
func pgvectorString(v []float32) string {
	s := "["
	for i, f := range v {
		if i > 0 {
			s += ","
		}
		s += fmt.Sprintf("%f", f)
	}
	s += "]"
	return s
}
