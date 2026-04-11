package services

import (
	"strings"
	"testing"

	"github.com/Chrainx/docuquery/backend/internal/models"
)

func TestBuildPrompt(t *testing.T) {
	tests := []struct {
		name     string
		question string
		sources  []models.SourceChunk
		wantIn   []string // substrings that must appear in the prompt
	}{
		{
			name:     "basic prompt with single source",
			question: "What is the capital of France?",
			sources: []models.SourceChunk{
				{
					Content:     "France is a country in Europe. Its capital is Paris.",
					PageNumbers: []int{1},
				},
			},
			wantIn: []string{
				"What is the capital of France?",
				"[Page 1]",
				"France is a country in Europe",
				"Answer:",
			},
		},
		{
			name:     "multiple sources with multi-page chunk",
			question: "How many employees does the company have?",
			sources: []models.SourceChunk{
				{
					Content:     "The company was founded in 2010.",
					PageNumbers: []int{3},
				},
				{
					Content:     "As of 2024, the company has 500 employees across 10 offices.",
					PageNumbers: []int{7, 8},
				},
			},
			wantIn: []string{
				"[Page 3]",
				"[Page 7, 8]",
				"How many employees",
			},
		},
		{
			name:     "prompt contains safety instructions",
			question: "Anything",
			sources: []models.SourceChunk{
				{Content: "Some content.", PageNumbers: []int{1}},
			},
			wantIn: []string{
				"ONLY",
				"cite the page number",
				"could not find the answer",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prompt := BuildPrompt(tt.question, tt.sources, nil)

			for _, want := range tt.wantIn {
				if !strings.Contains(prompt, want) {
					t.Errorf("prompt missing expected substring %q\n\nFull prompt:\n%s", want, prompt)
				}
			}
		})
	}
}

func TestBuildPrompt_WithHistory(t *testing.T) {
	history := []models.HistoryMessage{
		{Role: "user", Content: "What is this document about?"},
		{Role: "assistant", Content: "It is about machine learning."},
	}
	prompt := BuildPrompt("Can you elaborate?", []models.SourceChunk{
		{Content: "ML is a field of AI.", PageNumbers: []int{1}},
	}, history)
	if !strings.Contains(prompt, "What is this document about?") {
		t.Error("prompt should contain history user message")
	}
	if !strings.Contains(prompt, "It is about machine learning.") {
		t.Error("prompt should contain history assistant message")
	}
	if !strings.Contains(prompt, "Can you elaborate?") {
		t.Error("prompt should contain the current question")
	}
}

func TestBuildPrompt_EmptySources(t *testing.T) {
	prompt := BuildPrompt("test question", nil, nil)
	if !strings.Contains(prompt, "test question") {
		t.Error("prompt should contain the question even with no sources")
	}
	if !strings.Contains(prompt, "Context:") {
		t.Error("prompt should still contain the Context section header")
	}
}
