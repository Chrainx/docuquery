"""Tests for the text chunker."""

import pytest

from app.chunker import Chunk, chunk_pages
from app.pdf_parser import PageText


class TestChunkPages:
    """Tests for the chunk_pages function."""

    def test_single_short_page(self):
        """A single short page should produce one chunk."""
        pages = [PageText(page_number=1, text="This is a short sentence.")]
        chunks = chunk_pages(pages, chunk_size=512, chunk_overlap=64)

        assert len(chunks) == 1
        assert chunks[0].text == "This is a short sentence."
        assert chunks[0].page_numbers == [1]
        assert chunks[0].chunk_index == 0

    def test_multiple_pages_tracked(self):
        """Chunks spanning multiple pages should track all page numbers."""
        pages = [
            PageText(page_number=1, text="First page content here."),
            PageText(page_number=2, text="Second page content here."),
        ]
        # Use a very large chunk size so everything fits in one chunk.
        chunks = chunk_pages(pages, chunk_size=10000, chunk_overlap=0)

        assert len(chunks) == 1
        assert 1 in chunks[0].page_numbers
        assert 2 in chunks[0].page_numbers

    def test_chunk_indices_are_sequential(self):
        """Chunk indices should be 0, 1, 2, ..."""
        long_text = ". ".join(f"Sentence number {i}" for i in range(200))
        pages = [PageText(page_number=1, text=long_text)]
        chunks = chunk_pages(pages, chunk_size=50, chunk_overlap=10)

        assert len(chunks) > 1
        for i, chunk in enumerate(chunks):
            assert chunk.chunk_index == i

    def test_empty_pages_produce_no_chunks(self):
        """Empty page list should produce no chunks."""
        chunks = chunk_pages([], chunk_size=512, chunk_overlap=64)
        assert chunks == []

    def test_overlap_creates_shared_content(self):
        """With overlap, consecutive chunks should share some text."""
        sentences = [f"Sentence {i} is about topic {i}." for i in range(50)]
        text = " ".join(sentences)
        pages = [PageText(page_number=1, text=text)]

        chunks = chunk_pages(pages, chunk_size=30, chunk_overlap=10)

        if len(chunks) >= 2:
            # Check that there's some text overlap between consecutive chunks.
            words_0 = set(chunks[0].text.split())
            words_1 = set(chunks[1].text.split())
            overlap = words_0 & words_1
            assert len(overlap) > 0, "Consecutive chunks should share some words"
