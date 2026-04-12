// Package handlers contains the HTTP request handlers for the API.
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Chrainx/docuquery/backend/internal/middleware"
	"github.com/Chrainx/docuquery/backend/internal/models"
	"github.com/Chrainx/docuquery/backend/internal/services"
)

// LoginRequest is the body for POST /auth/login.
type LoginRequest struct {
	Password string `json:"password" binding:"required"`
}

// Handler holds dependencies for all HTTP handlers.
type Handler struct {
	db              *pgxpool.Pool
	embeddingClient *services.EmbeddingClient
	ollamaClient    *services.OllamaClient
	maxUploadBytes  int64
	uploadsDir      string
	authPassword    string
	logger          *slog.Logger
	progress        *ProgressBroker
}

// NewHandler creates a new Handler with all dependencies.
func NewHandler(
	db *pgxpool.Pool,
	embeddingClient *services.EmbeddingClient,
	ollamaClient *services.OllamaClient,
	maxUploadMB int,
	uploadsDir string,
	authPassword string,
	logger *slog.Logger,
) *Handler {
	return &Handler{
		db:              db,
		embeddingClient: embeddingClient,
		ollamaClient:    ollamaClient,
		maxUploadBytes:  int64(maxUploadMB) * 1024 * 1024,
		uploadsDir:      uploadsDir,
		authPassword:    authPassword,
		logger:          logger,
		progress:        newProgressBroker(),
	}
}

// Health returns service health status.
func (h *Handler) Health(c *gin.Context) {
	err := h.db.Ping(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status": "unhealthy",
			"error":  "database connection failed",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

// Login validates a password and returns a bearer token.
// When auth is disabled (AUTH_PASSWORD unset), always returns a token.
func (h *Handler) Login(c *gin.Context) {
	if h.authPassword == "" {
		c.JSON(http.StatusOK, gin.H{"token": "", "auth_enabled": false})
		return
	}
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password is required"})
		return
	}
	if req.Password != h.authPassword {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "incorrect password"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": middleware.TokenForPassword(h.authPassword), "auth_enabled": true})
}

// AuthConfig returns whether authentication is enabled (used by the frontend on startup).
func (h *Handler) AuthConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"auth_enabled": h.authPassword != ""})
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

	// Optional: assign to a directory on upload.
	var directoryID *uuid.UUID
	if dirIDStr := c.Request.FormValue("directory_id"); dirIDStr != "" {
		parsed, err := uuid.Parse(dirIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory_id"})
			return
		}
		directoryID = &parsed
	}

	// Create document record.
	docID := uuid.New()
	_, err = h.db.Exec(c.Request.Context(),
		`INSERT INTO documents (id, filename, page_count, file_size_bytes, status, directory_id)
		 VALUES ($1, $2, 0, $3, $4, $5)`,
		docID, header.Filename, header.Size, models.StatusProcessing, directoryID,
	)
	if err != nil {
		h.logger.Error("failed to insert document", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create document"})
		return
	}

	// Persist PDF to disk for later viewing.
	if err := h.savePDF(docID, pdfData); err != nil {
		h.logger.Warn("failed to save PDF to disk", "error", err)
		// Non-fatal — viewing will be unavailable but RAG still works.
	}

	// Return immediately with 202 — process in background.
	c.JSON(http.StatusAccepted, gin.H{
		"id":           docID,
		"filename":     header.Filename,
		"status":       models.StatusProcessing,
		"directory_id": directoryID,
	})

	// Process asynchronously.
	go h.processDocument(context.Background(), docID, header.Filename, pdfData)
}

// processDocument handles the async work: parse → embed → store.
func (h *Handler) processDocument(ctx context.Context, docID uuid.UUID, filename string, pdfData []byte) {
	log := h.logger.With("document_id", docID, "filename", filename)
	log.Info("processing document")

	emit := func(stage, message string) {
		h.progress.Publish(docID, models.ProgressEvent{Stage: stage, Message: message})
	}

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
	emit("parsing", "Extracting text from PDF…")
	parsed, err := h.embeddingClient.ParsePDF(ctx, filename, pdfData)
	if err != nil {
		log.Error("failed to parse PDF", "error", err)
		updateStatus(models.StatusError, fmt.Sprintf("PDF parsing failed: %v", err))
		emit("error", fmt.Sprintf("PDF parsing failed: %v", err))
		return
	}

	// Update page count (best-effort — processing continues even if this fails).
	if _, err := h.db.Exec(ctx, `UPDATE documents SET page_count = $1 WHERE id = $2`, parsed.PageCount, docID); err != nil {
		log.Warn("failed to update page count", "error", err)
	}

	if len(parsed.Chunks) == 0 {
		log.Warn("no chunks extracted from PDF")
		updateStatus(models.StatusError, "no text content found in PDF")
		emit("error", "no text content found in PDF")
		return
	}

	// 2. Generate embeddings.
	emit("embedding", fmt.Sprintf("Generating embeddings for %d chunks…", len(parsed.Chunks)))
	texts := make([]string, len(parsed.Chunks))
	for i, chunk := range parsed.Chunks {
		texts[i] = chunk.Text
	}

	embedResp, err := h.embeddingClient.Embed(ctx, texts)
	if err != nil {
		log.Error("failed to generate embeddings", "error", err)
		updateStatus(models.StatusError, fmt.Sprintf("embedding failed: %v", err))
		emit("error", fmt.Sprintf("embedding failed: %v", err))
		return
	}

	// 3. Store chunks with embeddings.
	emit("storing", fmt.Sprintf("Storing %d chunks…", len(parsed.Chunks)))
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
			emit("error", fmt.Sprintf("chunk storage failed: %v", err))
			return
		}
	}

	updateStatus(models.StatusReady, "")
	emit("ready", "Document is ready")
	log.Info("document processed successfully", "chunks", len(parsed.Chunks))
}

// ListDocuments returns all documents, optionally filtered by directory.
func (h *Handler) ListDocuments(c *gin.Context) {
	var args []interface{}
	query := `SELECT d.id, d.filename, COALESCE(d.display_name, ''), d.page_count, d.file_size_bytes,
			         d.status, d.created_at, COALESCE(d.error_message, ''), COUNT(c.id) as chunk_count, d.directory_id
			  FROM documents d
			  LEFT JOIN chunks c ON c.document_id = d.id`

	if dirIDStr := c.Query("directory_id"); dirIDStr != "" {
		dirID, err := uuid.Parse(dirIDStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory_id"})
			return
		}
		query += ` WHERE d.directory_id = $1`
		args = append(args, dirID)
	}

	query += ` GROUP BY d.id ORDER BY d.created_at DESC`

	rows, err := h.db.Query(c.Request.Context(), query, args...)
	if err != nil {
		h.logger.Error("failed to query documents", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list documents"})
		return
	}
	defer rows.Close()

	docs := []models.Document{}
	for rows.Next() {
		var doc models.Document
		err := rows.Scan(&doc.ID, &doc.Filename, &doc.DisplayName, &doc.PageCount, &doc.FileSizeBytes,
			&doc.Status, &doc.CreatedAt, &doc.ErrorMessage, &doc.ChunkCount, &doc.DirectoryID)
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
		`SELECT d.id, d.filename, COALESCE(d.display_name, ''), d.page_count, d.file_size_bytes,
		        d.status, d.created_at, COALESCE(d.error_message, ''), COUNT(c.id) as chunk_count, d.directory_id
		 FROM documents d
		 LEFT JOIN chunks c ON c.document_id = d.id
		 WHERE d.id = $1
		 GROUP BY d.id`,
		id,
	).Scan(&doc.ID, &doc.Filename, &doc.DisplayName, &doc.PageCount, &doc.FileSizeBytes,
		&doc.Status, &doc.CreatedAt, &doc.ErrorMessage, &doc.ChunkCount, &doc.DirectoryID)
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

	// Remove PDF from disk (best-effort).
	_ = os.Remove(h.pdfPath(id))

	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

// UpdateDocument handles PATCH /documents/:id.
// Supports updating directory_id (assign/unassign) and display_name (rename).
func (h *Handler) UpdateDocument(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document ID"})
		return
	}

	var req models.UpdateDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.db.Exec(c.Request.Context(),
		`UPDATE documents
		 SET directory_id  = COALESCE($1, directory_id),
		     display_name  = $2
		 WHERE id = $3`,
		req.DirectoryID, req.DisplayName, id,
	)
	if err != nil {
		h.logger.Error("failed to update document", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update document"})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"updated": true})
}

// CreateDirectory creates a new directory.
func (h *Handler) CreateDirectory(c *gin.Context) {
	var req models.CreateDirectoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dir := models.Directory{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
	}

	_, err := h.db.Exec(c.Request.Context(),
		`INSERT INTO directories (id, name, description) VALUES ($1, $2, $3)`,
		dir.ID, dir.Name, dir.Description,
	)
	if err != nil {
		h.logger.Error("failed to create directory", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create directory"})
		return
	}

	c.JSON(http.StatusCreated, dir)
}

// ListDirectories returns all directories with document counts.
func (h *Handler) ListDirectories(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(),
		`SELECT d.id, d.name, COALESCE(d.description, ''), d.created_at,
		        COUNT(doc.id) as document_count
		 FROM directories d
		 LEFT JOIN documents doc ON doc.directory_id = d.id
		 GROUP BY d.id
		 ORDER BY d.created_at DESC`,
	)
	if err != nil {
		h.logger.Error("failed to query directories", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list directories"})
		return
	}
	defer rows.Close()

	dirs := []models.Directory{}
	for rows.Next() {
		var dir models.Directory
		if err := rows.Scan(&dir.ID, &dir.Name, &dir.Description, &dir.CreatedAt, &dir.DocumentCount); err != nil {
			h.logger.Error("failed to scan directory row", "error", err)
			continue
		}
		dirs = append(dirs, dir)
	}

	c.JSON(http.StatusOK, dirs)
}

// GetDirectory returns a single directory with its documents.
func (h *Handler) GetDirectory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory ID"})
		return
	}

	var dir models.Directory
	err = h.db.QueryRow(c.Request.Context(),
		`SELECT d.id, d.name, COALESCE(d.description, ''), d.created_at,
		        COUNT(doc.id) as document_count
		 FROM directories d
		 LEFT JOIN documents doc ON doc.directory_id = d.id
		 WHERE d.id = $1
		 GROUP BY d.id`,
		id,
	).Scan(&dir.ID, &dir.Name, &dir.Description, &dir.CreatedAt, &dir.DocumentCount)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "directory not found"})
		return
	}

	c.JSON(http.StatusOK, dir)
}

// UpdateDirectory renames or updates the description of a directory.
func (h *Handler) UpdateDirectory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory ID"})
		return
	}

	var req models.UpdateDirectoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.db.Exec(c.Request.Context(),
		`UPDATE directories SET name = $1, description = $2 WHERE id = $3`,
		req.Name, req.Description, id,
	)
	if err != nil {
		h.logger.Error("failed to update directory", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update directory"})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "directory not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"updated": true})
}

// DeleteDirectory removes a directory. Documents in it are unassigned, not deleted.
func (h *Handler) DeleteDirectory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid directory ID"})
		return
	}

	result, err := h.db.Exec(c.Request.Context(), `DELETE FROM directories WHERE id = $1`, id)
	if err != nil {
		h.logger.Error("failed to delete directory", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete directory"})
		return
	}
	if result.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "directory not found"})
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
	sources, err := h.vectorSearch(c.Request.Context(), queryVector, req.DocumentID, req.DirectoryID, req.TopK)
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
	prompt := services.BuildPrompt(req.Question, sources, req.History)

	answer, err := h.ollamaClient.Generate(c.Request.Context(), prompt, req.Model)
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
	sources, err := h.vectorSearch(c.Request.Context(), queryVector, req.DocumentID, req.DirectoryID, req.TopK)
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

	prompt := services.BuildPrompt(req.Question, sources, req.History)

	err = h.ollamaClient.GenerateStream(c.Request.Context(), prompt, req.Model, func(token string) error {
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

	sourcesJSON, _ := json.Marshal(sources)
	fmt.Fprintf(c.Writer, "event: sources\ndata: %s\n\n", string(sourcesJSON))
	fmt.Fprintf(c.Writer, "event: done\ndata: {}\n\n")
	c.Writer.Flush()
}

// vectorSearch runs cosine similarity search, optionally scoped to a document or directory.
func (h *Handler) vectorSearch(ctx context.Context, queryVector string, documentID *uuid.UUID, directoryID *uuid.UUID, topK int) ([]models.SourceChunk, error) {
	var query string
	var args []interface{}

	switch {
	case documentID != nil:
		query = `SELECT c.content, c.page_numbers, 1 - (c.embedding <=> $1::vector) as similarity,
		                d.id, d.filename
		         FROM chunks c
		         JOIN documents d ON d.id = c.document_id
		         WHERE c.document_id = $2 AND d.status = 'ready'
		         ORDER BY c.embedding <=> $1::vector
		         LIMIT $3`
		args = []interface{}{queryVector, *documentID, topK}
	case directoryID != nil:
		query = `SELECT c.content, c.page_numbers, 1 - (c.embedding <=> $1::vector) as similarity,
		                d.id, d.filename
		         FROM chunks c
		         JOIN documents d ON d.id = c.document_id
		         WHERE d.directory_id = $2 AND d.status = 'ready'
		         ORDER BY c.embedding <=> $1::vector
		         LIMIT $3`
		args = []interface{}{queryVector, *directoryID, topK}
	default:
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

// pdfPath returns the disk path for a document's stored PDF.
func (h *Handler) pdfPath(docID uuid.UUID) string {
	return filepath.Join(h.uploadsDir, docID.String()+".pdf")
}

// savePDF writes raw PDF bytes to the uploads directory.
func (h *Handler) savePDF(docID uuid.UUID, data []byte) error {
	if err := os.MkdirAll(h.uploadsDir, 0o755); err != nil {
		return fmt.Errorf("creating uploads dir: %w", err)
	}
	return os.WriteFile(h.pdfPath(docID), data, 0o644)
}

// ServeDocumentFile streams the stored PDF for a document.
func (h *Handler) ServeDocumentFile(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document ID"})
		return
	}

	path := h.pdfPath(id)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "inline")
	c.File(path)
}

// ListModels returns the list of models available on the Ollama server.
func (h *Handler) ListModels(c *gin.Context) {
	models, err := h.ollamaClient.ListModels(c.Request.Context())
	if err != nil {
		h.logger.Warn("failed to list Ollama models", "error", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Ollama unavailable"})
		return
	}
	c.JSON(http.StatusOK, models)
}

// DocumentProgress streams processing progress events for a document via SSE.
func (h *Handler) DocumentProgress(c *gin.Context) {
	idStr := c.Param("id")
	docID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document id"})
		return
	}

	ch, cleanup := h.progress.Subscribe(docID)
	defer cleanup()

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(event)
			fmt.Fprintf(c.Writer, "event: progress\ndata: %s\n\n", data)
			c.Writer.Flush()
			if event.Stage == "ready" || event.Stage == "error" {
				return
			}
		}
	}
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
