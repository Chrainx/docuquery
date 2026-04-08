# Troubleshooting

Common issues and how to fix them.

---

## Ollama

### "failed to generate answer" or "Ollama returned 404"

The model hasn't been pulled yet:

```bash
ollama pull llama3.2:1b
```

Verify it's available:

```bash
ollama list
```

### "connection refused" to Ollama

Ollama isn't running. Start it:

```bash
ollama serve
```

If running inside Docker, the backend connects to `host.docker.internal:11434`.
On Linux, you may need to add `--add-host=host.docker.internal:host-gateway`
to the Docker run command, or set `OLLAMA_URL` to your machine's local IP.

### Responses are very slow

The 8B model needs ~8 GB RAM. If your machine is swapping:

1. Close other applications to free memory.
2. Try a smaller model: `ollama pull llama3.2:3b` and update `OLLAMA_MODEL`
   in your `.env`.
3. If you have an NVIDIA GPU, ensure Ollama is using it (check `nvidia-smi`).

---

## Database

### "pgvector extension not found"

The standard PostgreSQL image doesn't include pgvector. Use the pgvector image:

```bash
docker pull pgvector/pgvector:pg16
```

The `docker-compose.yml` already uses this image.

### "relation 'documents' does not exist"

Migrations haven't run. The backend runs them on startup. Check the logs:

```bash
docker compose logs backend | grep migration
```

To manually reset:

```bash
make db-reset
```

### Connection refused to PostgreSQL

Check if the database is running:

```bash
docker compose ps postgres
```

If it shows "unhealthy", check logs:

```bash
docker compose logs postgres
```

---

## Embedding Service

### Model download is slow on first start

The `all-MiniLM-L6-v2` model (~80 MB) downloads on first startup. This is
cached in a Docker volume (`model-cache`), so subsequent starts are instant.

If you're behind a corporate proxy, set `HTTP_PROXY` and `HTTPS_PROXY`
environment variables in the `embedding-service` section of `docker-compose.yml`.

### "CUDA out of memory" or similar GPU errors

The embedding model runs on CPU by default. If you have GPU issues:

1. The sentence-transformers library auto-detects GPUs. To force CPU:
   ```bash
   CUDA_VISIBLE_DEVICES="" make dev-embedding
   ```

2. Or add to `docker-compose.yml` under `embedding-service.environment`:
   ```yaml
   CUDA_VISIBLE_DEVICES: ""
   ```

---

## Frontend

### "Failed to fetch" errors in the browser

The frontend can't reach the backend. Check:

1. Is the backend running? `docker compose ps backend`
2. Is `NEXT_PUBLIC_API_URL` correct in `.env`?
3. Are there CORS errors in the browser console? The backend only allows
   `http://localhost:3000` by default.

### Document stuck in "processing" state

Check the backend logs for errors:

```bash
docker compose logs backend | grep "processing document"
```

Common causes:
- Embedding service is down
- PDF is corrupt or contains only images (no extractable text)
- PDF is password-protected

Delete the stuck document and re-upload:

```bash
curl -X DELETE http://localhost:8080/api/v1/documents/DOCUMENT_ID
```

---

## General

### Port already in use

Another service is using the port. Either stop it or change the port in `.env`:

```bash
# Find what's using port 8080
lsof -i :8080

# Change ports in .env
BACKEND_PORT=8081
POSTGRES_PORT=5433
EMBEDDING_PORT=8002
```

### Resetting everything

To start completely fresh:

```bash
make clean    # Stops services and removes all volumes (data is deleted)
make up       # Rebuild and start
```

### Checking service health

```bash
# All services
curl http://localhost:8080/api/v1/health   # Backend
curl http://localhost:8001/health           # Embedding service
docker compose exec postgres pg_isready    # PostgreSQL
ollama list                                 # Ollama
```
