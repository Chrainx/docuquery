package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Chrainx/docuquery/backend/internal/models"
)

// OllamaClient communicates with the local Ollama instance.
type OllamaClient struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

// NewOllamaClient creates a new Ollama client.
func NewOllamaClient(baseURL, model string) *OllamaClient {
	return &OllamaClient{
		baseURL: baseURL,
		model:   model,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// ollamaRequest is the request body for Ollama's /api/generate endpoint.
type ollamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

// ollamaStreamChunk is a single chunk from Ollama's streaming response.
type ollamaStreamChunk struct {
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

// BuildPrompt constructs the RAG prompt from retrieved chunks, conversation history, and the user question.
func BuildPrompt(question string, sources []models.SourceChunk, history []models.HistoryMessage) string {
	var sb strings.Builder

	sb.WriteString(`You are a helpful assistant that answers questions based ONLY on the provided context.
Rules:
- Answer the question using ONLY the context below.
- Always cite the page number(s) where you found the information, like [Page 3].
- If the context does not contain the answer, say "I could not find the answer in the provided document."
- Be concise and accurate.

Context:
`)

	for _, src := range sources {
		pages := make([]string, len(src.PageNumbers))
		for i, p := range src.PageNumbers {
			pages[i] = fmt.Sprintf("%d", p)
		}
		sb.WriteString(fmt.Sprintf("[Page %s] %s\n\n", strings.Join(pages, ", "), src.Content))
	}

	if len(history) > 0 {
		sb.WriteString("\nConversation so far:\n")
		for _, msg := range history {
			switch msg.Role {
			case "user":
				sb.WriteString(fmt.Sprintf("User: %s\n", msg.Content))
			case "assistant":
				sb.WriteString(fmt.Sprintf("Assistant: %s\n", msg.Content))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString(fmt.Sprintf("Question: %s\n\nAnswer:", question))

	return sb.String()
}

// Generate sends a prompt to Ollama and returns the full response (non-streaming).
func (c *OllamaClient) Generate(ctx context.Context, prompt string) (string, error) {
	reqBody, err := json.Marshal(ollamaRequest{
		Model:  c.model,
		Prompt: prompt,
		Stream: false,
	})
	if err != nil {
		return "", fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/generate", bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("calling Ollama: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("Ollama returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decoding Ollama response: %w", err)
	}

	return result.Response, nil
}

// GenerateStream sends a prompt to Ollama and streams the response token by token.
// The callback is called for each token. Return an error from the callback to stop.
func (c *OllamaClient) GenerateStream(ctx context.Context, prompt string, callback func(token string) error) error {
	reqBody, err := json.Marshal(ollamaRequest{
		Model:  c.model,
		Prompt: prompt,
		Stream: true,
	})
	if err != nil {
		return fmt.Errorf("marshaling request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/generate", bytes.NewReader(reqBody))
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("calling Ollama: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Ollama returned %d: %s", resp.StatusCode, string(body))
	}

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		var chunk ollamaStreamChunk
		if err := json.Unmarshal(scanner.Bytes(), &chunk); err != nil {
			continue
		}
		if chunk.Done {
			break
		}
		if err := callback(chunk.Response); err != nil {
			return err
		}
	}

	return scanner.Err()
}
