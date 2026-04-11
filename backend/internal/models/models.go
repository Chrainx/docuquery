// Package models defines the core data structures used across the application.
package models

import (
	"time"

	"github.com/google/uuid"
)

// DocumentStatus represents the processing state of a document.
type DocumentStatus string

const (
	StatusProcessing DocumentStatus = "processing"
	StatusReady      DocumentStatus = "ready"
	StatusError      DocumentStatus = "error"
)

// Directory represents a named group of documents with shared query context.
type Directory struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description,omitempty"`
	DocumentCount int       `json:"document_count,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// CreateDirectoryRequest is the request body for creating a directory.
type CreateDirectoryRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description,omitempty"`
}

// AssignDirectoryRequest is the request body for assigning a document to a directory.
type AssignDirectoryRequest struct {
	DirectoryID *uuid.UUID `json:"directory_id"` // null to unassign
}

// UpdateDirectoryRequest is the request body for renaming/updating a directory.
type UpdateDirectoryRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description,omitempty"`
}

// Document represents an uploaded PDF document.
type Document struct {
	ID            uuid.UUID      `json:"id"`
	Filename      string         `json:"filename"`
	PageCount     int            `json:"page_count"`
	FileSizeBytes int64          `json:"file_size_bytes"`
	Status        DocumentStatus `json:"status"`
	ChunkCount    int            `json:"chunk_count,omitempty"`
	ErrorMessage  string         `json:"error_message,omitempty"`
	DirectoryID   *uuid.UUID     `json:"directory_id,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
}

// Chunk represents a text chunk from a document with its embedding.
type Chunk struct {
	ID          uuid.UUID `json:"id"`
	DocumentID  uuid.UUID `json:"document_id"`
	Content     string    `json:"content"`
	PageNumbers []int     `json:"page_numbers"`
	ChunkIndex  int       `json:"chunk_index"`
	Embedding   []float32 `json:"-"` // Never sent to clients
	CreatedAt   time.Time `json:"created_at"`
}

// QueryRequest is the request body for the query endpoint.
type QueryRequest struct {
	Question    string     `json:"question" binding:"required,min=3,max=1000"`
	DocumentID  *uuid.UUID `json:"document_id,omitempty"`
	DirectoryID *uuid.UUID `json:"directory_id,omitempty"`
	TopK        int        `json:"top_k,omitempty"`
}

// QueryResponse is the response from the query endpoint.
type QueryResponse struct {
	Answer  string        `json:"answer"`
	Sources []SourceChunk `json:"sources"`
}

// SourceChunk is a retrieved chunk included in the query response.
type SourceChunk struct {
	Content         string  `json:"content"`
	PageNumbers     []int   `json:"page_numbers"`
	SimilarityScore float64 `json:"similarity_score"`
	DocumentID      string  `json:"document_id"`
	Filename        string  `json:"filename"`
}
