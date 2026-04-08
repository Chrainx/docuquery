package handlers

import (
	"testing"
)

func TestPgvectorString(t *testing.T) {
	tests := []struct {
		name     string
		input    []float32
		expected string
	}{
		{
			name:     "empty vector",
			input:    []float32{},
			expected: "[]",
		},
		{
			name:     "single element",
			input:    []float32{0.5},
			expected: "[0.500000]",
		},
		{
			name:     "multiple elements",
			input:    []float32{0.1, 0.2, 0.3},
			expected: "[0.100000,0.200000,0.300000]",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := pgvectorString(tt.input)
			if result != tt.expected {
				t.Errorf("pgvectorString(%v) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestJsonEscape(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello", `"hello"`},
		{"line1\nline2", `"line1\nline2"`},
		{`say "hi"`, `"say \"hi\""`},
		{"tab\there", `"tab\there"`},
	}

	for _, tt := range tests {
		result := jsonEscape(tt.input)
		if result != tt.expected {
			t.Errorf("jsonEscape(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}
