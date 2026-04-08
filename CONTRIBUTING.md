# Contributing to DocuQuery

Thank you for considering contributing to DocuQuery! This document outlines the development workflow, coding standards, and submission process.

## Development Setup

1. Fork the repository and clone your fork
2. Install prerequisites: Docker, Docker Compose, Ollama, Go 1.22+, Node.js 20+, Python 3.11+
3. Copy `.env.example` to `.env`
4. Run `make setup` to install all dependencies
5. Run `make up` to start the full stack

## Branch Naming

Use the following prefixes:

- `feat/` — New features (e.g., `feat/multi-document-query`)
- `fix/` — Bug fixes (e.g., `fix/chunk-overlap-boundary`)
- `refactor/` — Code restructuring (e.g., `refactor/embedding-service-cleanup`)
- `docs/` — Documentation updates (e.g., `docs/api-reference`)
- `test/` — Test additions or fixes (e.g., `test/chunker-edge-cases`)
- `ci/` — CI/CD changes (e.g., `ci/add-python-lint`)

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Examples:

```
feat(backend): add document deletion endpoint
fix(embedding): handle empty PDF pages gracefully
test(chunker): add tests for overlapping chunk boundaries
docs(readme): update quick start instructions
ci(workflow): add Go race condition detection
```

## Pull Request Process

1. Create a feature branch from `main`
2. Write or update tests for your changes
3. Ensure all checks pass: `make lint && make test`
4. Open a pull request with a clear description
5. Link any related issues using `Closes #N` or `Fixes #N`
6. Request review from at least one maintainer

## Code Style

### Go (Backend)

- Follow [Effective Go](https://go.dev/doc/effective_go) guidelines
- Use `gofmt` and `golangci-lint`
- Group imports: stdlib, external, internal
- Write table-driven tests

### Python (Embedding Service)

- Follow PEP 8
- Use type hints for all function signatures
- Use `ruff` for linting and formatting
- Write pytest tests with descriptive names

### TypeScript (Frontend)

- Use strict TypeScript (no `any` unless absolutely necessary)
- Follow the existing component patterns
- Use `eslint` and `prettier`
- Prefer server components; use `"use client"` only when needed

## Testing

```bash
make test            # Run all tests
make test-backend    # Go tests only
make test-frontend   # Next.js tests only
make test-embedding  # Python tests only
```

## Questions?

Open a [Discussion](https://github.com/Chrainx/docuquery/discussions) or reach out via Issues.
