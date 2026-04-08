# =============================================================================
# Build stage
# =============================================================================
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache ca-certificates git

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /build/api ./cmd/api

# =============================================================================
# Runtime stage
# =============================================================================
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder /build/api .
COPY --from=builder /build/migrations ./migrations

RUN mkdir -p /app/uploads && chown -R app:app /app

USER app

EXPOSE 8080

ENTRYPOINT ["./api"]
