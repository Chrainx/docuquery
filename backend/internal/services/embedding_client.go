// Package services contains business logic and external service integrations.
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

// EmbeddingClient communicates with the Python embedding service.
type EmbeddingClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewEmbeddingClient creates a new client for the embedding service.
func NewEmbeddingClient(baseURL string) *EmbeddingClient {
	return &EmbeddingClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// ParsedChunk is a chunk returned by the embedding service /parse endpoint.
type ParsedChunk struct {
	Text        string `json:"text"`
	PageNumbers []int  `json:"page_numbers"`
	ChunkIndex  int    `json:"chunk_index"`
}

// ParseResponse is the response from the embedding service /parse endpoint.
type ParseResponse struct {
	Filename  string        `json:"filename"`
	PageCount int           `json:"page_count"`
	Chunks    []ParsedChunk `json:"chunks"`
}

// ParsePDF uploads a PDF to the embedding service and returns parsed chunks.
func (c *EmbeddingClient) ParsePDF(ctx context.Context, filename string, pdfData []byte) (*ParseResponse, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("creating form file: %w", err)
	}
	if _, err := part.Write(pdfData); err != nil {
		return nil, fmt.Errorf("writing PDF data: %w", err)
	}
	writer.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/parse", body)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling embedding service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding service returned %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed ParseResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return &parsed, nil
}

// EmbedRequest is the request body for the /embed endpoint.
type EmbedRequest struct {
	Texts []string `json:"texts"`
}

// EmbedResponse is the response from the /embed endpoint.
type EmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
	Dimension  int         `json:"dimension"`
	Count      int         `json:"count"`
}

// Embed generates embeddings for the given texts.
func (c *EmbeddingClient) Embed(ctx context.Context, texts []string) (*EmbedResponse, error) {
	reqBody, err := json.Marshal(EmbedRequest{Texts: texts})
	if err != nil {
		return nil, fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/embed", bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calling embedding service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding service returned %d: %s", resp.StatusCode, string(respBody))
	}

	var embedResp EmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&embedResp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return &embedResp, nil
}
