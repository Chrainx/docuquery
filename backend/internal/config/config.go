// Package config loads application configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all application configuration.
type Config struct {
	// Server
	Port string
	Host string

	// Database
	DatabaseURL string

	// External services
	EmbeddingServiceURL string
	OllamaURL           string
	OllamaModel         string

	// Limits
	MaxUploadSizeMB int

	// Logging
	LogLevel string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		Port:                getEnv("BACKEND_PORT", "8080"),
		Host:                getEnv("BACKEND_HOST", "0.0.0.0"),
		DatabaseURL:         getEnv("DATABASE_URL", ""),
		EmbeddingServiceURL: getEnv("EMBEDDING_SERVICE_URL", "http://localhost:8001"),
		OllamaURL:           getEnv("OLLAMA_URL", "http://localhost:11434"),
		OllamaModel:         getEnv("OLLAMA_MODEL", "llama3.1:8b"),
		MaxUploadSizeMB:     getEnvInt("MAX_UPLOAD_SIZE_MB", 50),
		LogLevel:            getEnv("LOG_LEVEL", "debug"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	return cfg, nil
}

// Addr returns the listen address in host:port format.
func (c *Config) Addr() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
