"""Embedding generation using sentence-transformers.

Loads the model once at module level and exposes a simple interface
for generating embeddings from text.
"""

import logging
import time

import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class Embedder:
    """Wraps a sentence-transformers model for embedding generation."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        logger.info("Loading embedding model: %s", model_name)
        start = time.time()
        self.model = SentenceTransformer(model_name)
        self.model_name = model_name
        self.dimension = self.model.get_sentence_embedding_dimension()
        elapsed = time.time() - start
        logger.info(
            "Model loaded in %.2fs (dimension: %d)", elapsed, self.dimension
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed.

        Returns:
            List of embedding vectors as float lists.
        """
        if not texts:
            return []

        logger.debug("Embedding %d texts", len(texts))
        start = time.time()

        embeddings: np.ndarray = self.model.encode(
            texts,
            batch_size=32,
            show_progress_bar=False,
            normalize_embeddings=True,
        )

        elapsed = time.time() - start
        logger.debug(
            "Embedded %d texts in %.3fs (%.1f texts/sec)",
            len(texts),
            elapsed,
            len(texts) / elapsed if elapsed > 0 else 0,
        )

        return embeddings.tolist()
