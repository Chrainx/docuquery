package config

import (
	"os"
	"testing"
)

func TestLoad_RequiresDatabaseURL(t *testing.T) {
	// Ensure DATABASE_URL is not set.
	os.Unsetenv("DATABASE_URL")

	_, err := Load()
	if err == nil {
		t.Error("expected error when DATABASE_URL is missing")
	}
}

func TestLoad_Defaults(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://test@localhost/test")
	defer os.Unsetenv("DATABASE_URL")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "8080" {
		t.Errorf("expected default port 8080, got %s", cfg.Port)
	}
	if cfg.OllamaModel != "llama3.1:8b" {
		t.Errorf("expected default model llama3.1:8b, got %s", cfg.OllamaModel)
	}
	if cfg.MaxUploadSizeMB != 50 {
		t.Errorf("expected default max upload 50 MB, got %d", cfg.MaxUploadSizeMB)
	}
	if cfg.EmbeddingServiceURL != "http://localhost:8001" {
		t.Errorf("expected default embedding URL, got %s", cfg.EmbeddingServiceURL)
	}
}

func TestLoad_CustomValues(t *testing.T) {
	os.Setenv("DATABASE_URL", "postgres://custom@db/mydb")
	os.Setenv("BACKEND_PORT", "9090")
	os.Setenv("OLLAMA_MODEL", "mistral:7b")
	os.Setenv("MAX_UPLOAD_SIZE_MB", "100")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("BACKEND_PORT")
		os.Unsetenv("OLLAMA_MODEL")
		os.Unsetenv("MAX_UPLOAD_SIZE_MB")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != "9090" {
		t.Errorf("expected port 9090, got %s", cfg.Port)
	}
	if cfg.OllamaModel != "mistral:7b" {
		t.Errorf("expected model mistral:7b, got %s", cfg.OllamaModel)
	}
	if cfg.MaxUploadSizeMB != 100 {
		t.Errorf("expected max upload 100 MB, got %d", cfg.MaxUploadSizeMB)
	}
}

func TestAddr(t *testing.T) {
	cfg := &Config{Host: "0.0.0.0", Port: "8080"}
	if cfg.Addr() != "0.0.0.0:8080" {
		t.Errorf("expected 0.0.0.0:8080, got %s", cfg.Addr())
	}
}
