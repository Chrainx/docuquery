"""Tests for the FastAPI application endpoints."""

import io
import math
from unittest.mock import MagicMock

import fitz
import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app


@pytest.fixture(autouse=True)
def mock_embedder():
    """Inject a mock embedder so tests don't need the real model."""
    mock = MagicMock()
    mock.model_name = "all-MiniLM-L6-v2"
    mock.dimension = 384
    # Return a unit vector of length 384
    mock.embed.return_value = [[1.0 / (384**0.5)] * 384]
    main_module.embedder = mock
    yield mock
    main_module.embedder = None


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def sample_pdf() -> bytes:
    """Create a sample PDF for testing."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "The capital of France is Paris. It is known for the Eiffel Tower. "
        "Paris has a population of approximately 2.1 million people.",
        fontsize=12,
    )
    page2 = doc.new_page()
    page2.insert_text(
        (72, 72),
        "The Louvre Museum in Paris is the most visited art museum in the world. "
        "It houses the Mona Lisa painting by Leonardo da Vinci.",
        fontsize=12,
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class TestHealthEndpoint:
    """Tests for the /health endpoint."""

    def test_health_returns_status(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "model" in data
        assert "dimension" in data


class TestParseEndpoint:
    """Tests for the /parse endpoint."""

    def test_parse_valid_pdf(self, client, sample_pdf):
        response = client.post(
            "/parse",
            files={"file": ("test.pdf", io.BytesIO(sample_pdf), "application/pdf")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test.pdf"
        assert data["page_count"] == 2
        assert len(data["chunks"]) > 0

        # Each chunk should have page_numbers and text.
        for chunk in data["chunks"]:
            assert "text" in chunk
            assert "page_numbers" in chunk
            assert len(chunk["page_numbers"]) > 0
            assert "chunk_index" in chunk

    def test_parse_non_pdf_returns_400(self, client):
        response = client.post(
            "/parse",
            files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
        )
        assert response.status_code == 400

    def test_parse_empty_file_returns_400(self, client):
        response = client.post(
            "/parse",
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
        )
        assert response.status_code == 400


class TestEmbedEndpoint:
    """Tests for the /embed endpoint."""

    def test_embed_single_text(self, client, mock_embedder):
        mock_embedder.embed.return_value = [[1.0 / (384**0.5)] * 384]
        response = client.post("/embed", json={"texts": ["Hello, world!"]})
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert data["dimension"] == 384
        assert len(data["embeddings"]) == 1
        assert len(data["embeddings"][0]) == 384

    def test_embed_multiple_texts(self, client, mock_embedder):
        mock_embedder.embed.return_value = [[1.0 / (384**0.5)] * 384] * 3
        response = client.post(
            "/embed",
            json={"texts": ["First sentence.", "Second sentence.", "Third sentence."]},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 3
        assert len(data["embeddings"]) == 3

    def test_embed_empty_list_returns_422(self, client):
        response = client.post("/embed", json={"texts": []})
        assert response.status_code == 422

    def test_embeddings_are_normalized(self, client, mock_embedder):
        """Embeddings should be L2-normalized (unit vectors)."""
        mock_embedder.embed.return_value = [[1.0 / (384**0.5)] * 384]
        response = client.post("/embed", json={"texts": ["Test normalization"]})
        data = response.json()
        embedding = data["embeddings"][0]
        magnitude = math.sqrt(sum(x * x for x in embedding))
        assert abs(magnitude - 1.0) < 0.01, f"Embedding magnitude should be ~1.0, got {magnitude}"
