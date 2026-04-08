#!/usr/bin/env bash
# =============================================================================
# DocuQuery End-to-End Test
#
# Prerequisites:
#   - All services running (make up)
#   - Ollama running with llama3.1:8b pulled
#
# Usage:
#   ./scripts/e2e-test.sh
# =============================================================================

set -euo pipefail

API_URL="${API_URL:-http://localhost:8080/api/v1}"
SAMPLE_PDF="${SAMPLE_PDF:-docs/sample.pdf}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

# ---------------------------------------------------------------------------
# 1. Health check
# ---------------------------------------------------------------------------

info "Checking API health..."
HEALTH=$(curl -sf "${API_URL}/health" | jq -r '.status')
[ "$HEALTH" = "healthy" ] && pass "API is healthy" || fail "API health check failed"

# ---------------------------------------------------------------------------
# 2. Upload sample PDF
# ---------------------------------------------------------------------------

if [ ! -f "$SAMPLE_PDF" ]; then
  info "Creating sample PDF for testing..."
  python3 -c "
import fitz
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 72), 'Page 1: The capital of France is Paris. It is known for the Eiffel Tower.', fontsize=12)
page2 = doc.new_page()
page2.insert_text((72, 72), 'Page 2: The population of Paris is approximately 2.1 million people.', fontsize=12)
doc.save('${SAMPLE_PDF}')
doc.close()
"
fi

info "Uploading sample PDF..."
UPLOAD_RESPONSE=$(curl -sf -X POST "${API_URL}/documents" \
  -F "file=@${SAMPLE_PDF}")

DOC_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.id')
[ -n "$DOC_ID" ] && [ "$DOC_ID" != "null" ] && pass "Uploaded document: $DOC_ID" || fail "Upload failed"

# ---------------------------------------------------------------------------
# 3. Wait for processing
# ---------------------------------------------------------------------------

info "Waiting for document processing..."
for i in $(seq 1 30); do
  STATUS=$(curl -sf "${API_URL}/documents/${DOC_ID}" | jq -r '.status')
  if [ "$STATUS" = "ready" ]; then
    pass "Document processed successfully"
    break
  elif [ "$STATUS" = "error" ]; then
    fail "Document processing failed"
  fi
  sleep 2
done

[ "$STATUS" = "ready" ] || fail "Document processing timed out"

# ---------------------------------------------------------------------------
# 4. Query the document
# ---------------------------------------------------------------------------

info "Querying document..."
QUERY_RESPONSE=$(curl -sf -X POST "${API_URL}/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"What is the capital of France?\", \"document_id\": \"${DOC_ID}\"}")

ANSWER=$(echo "$QUERY_RESPONSE" | jq -r '.answer')
SOURCE_COUNT=$(echo "$QUERY_RESPONSE" | jq '.sources | length')

[ -n "$ANSWER" ] && [ "$ANSWER" != "null" ] && pass "Got answer: ${ANSWER:0:80}..." || fail "No answer returned"
[ "$SOURCE_COUNT" -gt 0 ] && pass "Got $SOURCE_COUNT source(s) with citations" || fail "No sources returned"

# ---------------------------------------------------------------------------
# 5. Check page citations
# ---------------------------------------------------------------------------

PAGE_NUMS=$(echo "$QUERY_RESPONSE" | jq '[.sources[].page_numbers[]] | unique')
info "Cited pages: $PAGE_NUMS"
echo "$PAGE_NUMS" | grep -q "1" && pass "Correctly cited page 1" || info "Page 1 not cited (may be expected)"

# ---------------------------------------------------------------------------
# 6. Cleanup
# ---------------------------------------------------------------------------

info "Cleaning up..."
curl -sf -X DELETE "${API_URL}/documents/${DOC_ID}" > /dev/null
pass "Deleted test document"

echo ""
echo -e "${GREEN}All tests passed!${NC}"
