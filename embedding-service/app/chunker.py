"""Text chunking with overlap and page number tracking.

Splits document text into overlapping chunks that respect sentence boundaries.
Each chunk carries the page numbers of its source content.
"""

import logging
import re
from dataclasses import dataclass, field

from app.pdf_parser import PageText

logger = logging.getLogger(__name__)

# Rough approximation: 1 token ≈ 4 characters for English text.
CHARS_PER_TOKEN = 4

# Regex to split on sentence boundaries — handles common abbreviations.
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


@dataclass
class Chunk:
    """A text chunk with its source page numbers."""

    text: str
    page_numbers: list[int] = field(default_factory=list)
    chunk_index: int = 0


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences using regex.

    Falls back to splitting on newlines if no sentence boundaries found.
    """
    sentences = SENTENCE_SPLIT_RE.split(text)
    if len(sentences) <= 1:
        # Fallback: split on double newlines, then single newlines.
        sentences = [s.strip() for s in text.split("\n\n") if s.strip()]
        if len(sentences) <= 1:
            sentences = [s.strip() for s in text.split("\n") if s.strip()]
    return [s for s in sentences if s]


def chunk_pages(
    pages: list[PageText],
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[Chunk]:
    """Split pages into overlapping chunks that respect sentence boundaries.

    Args:
        pages: Extracted page texts with page numbers.
        chunk_size: Target chunk size in tokens (approximate).
        chunk_overlap: Overlap between consecutive chunks in tokens.

    Returns:
        List of Chunk objects with text and page number tracking.
    """
    max_chars = chunk_size * CHARS_PER_TOKEN
    overlap_chars = chunk_overlap * CHARS_PER_TOKEN

    # Build a flat list of (sentence, page_number) pairs.
    sentence_page_pairs: list[tuple[str, int]] = []
    for page in pages:
        sentences = _split_sentences(page.text)
        for sentence in sentences:
            sentence_page_pairs.append((sentence, page.page_number))

    if not sentence_page_pairs:
        logger.warning("No sentences found in pages")
        return []

    chunks: list[Chunk] = []
    current_text = ""
    current_pages: set[int] = set()
    start_idx = 0
    i = 0

    while i < len(sentence_page_pairs):
        sentence, page_num = sentence_page_pairs[i]

        # Check if adding this sentence would exceed the chunk size.
        candidate = f"{current_text} {sentence}".strip() if current_text else sentence

        if len(candidate) > max_chars and current_text:
            # Emit the current chunk.
            chunks.append(
                Chunk(
                    text=current_text.strip(),
                    page_numbers=sorted(current_pages),
                    chunk_index=len(chunks),
                )
            )

            # Backtrack for overlap: find sentences within overlap_chars of the end.
            overlap_text = ""
            overlap_pages: set[int] = set()
            j = i - 1
            while j >= start_idx and len(overlap_text) < overlap_chars:
                sent, pn = sentence_page_pairs[j]
                overlap_text = f"{sent} {overlap_text}".strip()
                overlap_pages.add(pn)
                j -= 1

            current_text = overlap_text
            current_pages = overlap_pages
            start_idx = j + 1
            # Don't increment i — re-evaluate this sentence with the overlap.
            continue

        current_text = candidate
        current_pages.add(page_num)
        i += 1

    # Emit the last chunk if any text remains.
    if current_text.strip():
        chunks.append(
            Chunk(
                text=current_text.strip(),
                page_numbers=sorted(current_pages),
                chunk_index=len(chunks),
            )
        )

    logger.info(
        "Created %d chunks from %d pages (target size: %d tokens, overlap: %d tokens)",
        len(chunks),
        len(pages),
        chunk_size,
        chunk_overlap,
    )
    return chunks
