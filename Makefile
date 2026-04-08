.PHONY: help up down infra dev-backend dev-frontend dev-embedding test lint db-reset setup clean

# =============================================================================
# DocuQuery — Developer Commands
# =============================================================================

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# -----------------------------------------------------------------------------
# Docker
# -----------------------------------------------------------------------------

up: ## Start all services
	docker compose up --build -d
	@echo "\n✅ DocuQuery is running at http://localhost:3000\n"

down: ## Stop all services
	docker compose down

infra: ## Start infrastructure only (PostgreSQL + volumes)
	docker compose up -d postgres
	@echo "\n✅ PostgreSQL is running on port 5432\n"

clean: ## Stop all services and remove volumes
	docker compose down -v
	@echo "\n🧹 All services stopped and volumes removed\n"

logs: ## Tail logs from all services
	docker compose logs -f

# -----------------------------------------------------------------------------
# Local Development (without Docker for app services)
# -----------------------------------------------------------------------------

setup: ## Install all dependencies for local development
	cd frontend && npm install
	cd embedding-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
	cd backend && go mod download
	@echo "\n✅ All dependencies installed\n"

dev-backend: ## Run Go backend with hot reload (requires air)
	cd backend && go run ./cmd/api

dev-frontend: ## Run Next.js frontend in dev mode
	cd frontend && npm run dev

dev-embedding: ## Run Python embedding service in dev mode
	cd embedding-service && .venv/bin/python -m uvicorn app.main:app --reload --port 8001

# -----------------------------------------------------------------------------
# Testing
# -----------------------------------------------------------------------------

test: test-backend test-frontend test-embedding ## Run all tests

test-backend: ## Run Go tests
	cd backend && go test -race -cover ./...

test-frontend: ## Run Next.js tests
	cd frontend && npm test

test-embedding: ## Run Python tests
	cd embedding-service && .venv/bin/python -m pytest tests/ -v

# -----------------------------------------------------------------------------
# Linting
# -----------------------------------------------------------------------------

lint: lint-backend lint-frontend lint-embedding ## Run all linters

lint-backend: ## Run Go linter
	cd backend && golangci-lint run ./...

lint-frontend: ## Run ESLint + Prettier check
	cd frontend && npm run lint

lint-embedding: ## Run Python linter
	cd embedding-service && .venv/bin/ruff check app/ tests/

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

db-reset: ## Drop and recreate the database
	docker compose exec postgres psql -U docuquery -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	docker compose exec postgres psql -U docuquery -c "CREATE EXTENSION IF NOT EXISTS vector;"
	cd backend && go run ./cmd/api --migrate-only
	@echo "\n✅ Database reset complete\n"

db-shell: ## Open psql shell
	docker compose exec postgres psql -U docuquery
