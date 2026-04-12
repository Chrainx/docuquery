// Package main is the entrypoint for the DocuQuery API server.
package main

import (
	"context"
	"embed"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Chrainx/docuquery/backend/internal/config"
	"github.com/Chrainx/docuquery/backend/internal/handlers"
	"github.com/Chrainx/docuquery/backend/internal/middleware"
	"github.com/Chrainx/docuquery/backend/internal/services"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func main() {
	// Load config.
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration error: %v\n", err)
		os.Exit(1)
	}

	// Set up structured logging.
	var logLevel slog.Level
	switch strings.ToLower(cfg.LogLevel) {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))

	// Connect to database.
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	logger.Info("connected to database")

	// Run migrations.
	if err := runMigrations(ctx, pool, logger); err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	// Check for --migrate-only flag.
	for _, arg := range os.Args[1:] {
		if arg == "--migrate-only" {
			logger.Info("migrations complete, exiting (--migrate-only)")
			os.Exit(0)
		}
	}

	// Initialize service clients.
	embeddingClient := services.NewEmbeddingClient(cfg.EmbeddingServiceURL)
	ollamaClient := services.NewOllamaClient(cfg.OllamaURL, cfg.OllamaModel)

	// Initialize handlers.
	h := handlers.NewHandler(pool, embeddingClient, ollamaClient, cfg.MaxUploadSizeMB, logger)

	// Set up Gin router.
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.CORS())
	r.Use(middleware.RequestLogger(logger))

	// Routes.
	api := r.Group("/api/v1")
	{
		api.GET("/health", h.Health)

		api.POST("/documents", h.UploadDocument)
		api.GET("/documents", h.ListDocuments)
		api.GET("/documents/:id", h.GetDocument)
		api.DELETE("/documents/:id", h.DeleteDocument)
		api.PATCH("/documents/:id", h.UpdateDocument)

		api.POST("/directories", h.CreateDirectory)
		api.GET("/directories", h.ListDirectories)
		api.GET("/directories/:id", h.GetDirectory)
		api.PATCH("/directories/:id", h.UpdateDirectory)
		api.DELETE("/directories/:id", h.DeleteDirectory)

		api.POST("/query", h.Query)
		api.POST("/query/stream", h.QueryStream)
	}

	// Start server with graceful shutdown.
	srv := &http.Server{
		Addr:         cfg.Addr(),
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("server starting", "addr", cfg.Addr())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("server forced shutdown", "error", err)
	}

	logger.Info("server stopped")
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		// Embedded FS unavailable — fall back to reading from disk.
		return runMigrationsFromDisk(ctx, pool, logger)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		content, err := migrationsFS.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", entry.Name(), err)
		}

		logger.Info("running migration", "file", entry.Name())
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("executing migration %s: %w", entry.Name(), err)
		}
	}

	return nil
}

func runMigrationsFromDisk(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	entries, err := os.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("reading migrations directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		content, err := os.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", entry.Name(), err)
		}

		logger.Info("running migration", "file", entry.Name())
		if _, err := pool.Exec(ctx, string(content)); err != nil {
			return fmt.Errorf("executing migration %s: %w", entry.Name(), err)
		}
	}

	return nil
}
