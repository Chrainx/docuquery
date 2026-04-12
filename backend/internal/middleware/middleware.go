// Package middleware provides HTTP middleware for the API server.
package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CORS returns a configured CORS middleware.
func CORS() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}

// TokenForPassword derives the bearer token for a given password.
// The same deterministic value is used by both login and validation.
func TokenForPassword(password string) string {
	sum := sha256.Sum256([]byte("docuquery:" + password))
	return hex.EncodeToString(sum[:])
}

// BearerAuth returns a middleware that enforces token authentication.
// If password is empty, the middleware is a no-op (auth disabled).
func BearerAuth(password string) gin.HandlerFunc {
	if password == "" {
		return func(c *gin.Context) { c.Next() }
	}
	expected := TokenForPassword(password)
	return func(c *gin.Context) {
		// Check Authorization header first; fall back to ?token= query param (for EventSource).
		header := c.GetHeader("Authorization")
		token := strings.TrimPrefix(header, "Bearer ")
		if token == "" {
			token = c.Query("token")
		}
		if token != expected {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Next()
	}
}

// RequestLogger logs each incoming request with timing and status.
func RequestLogger(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := uuid.New().String()[:8]
		start := time.Now()

		c.Set("request_id", requestID)
		c.Header("X-Request-ID", requestID)

		c.Next()

		logger.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", requestID,
		)
	}
}
