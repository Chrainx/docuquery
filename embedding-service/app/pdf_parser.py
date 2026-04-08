"""PDF text extraction with page-level tracking using PyMuPDF."""

import logging
from dataclasses import dataclass

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


@dataclass
class PageText:
    """Text content extracted from a single PDF page."""

    page_number: int  # 1-indexed
    text: str


def extract_pages(pdf_bytes: bytes) -> list[PageText]:
    """Extract text from each page of a PDF.

    Args:
        pdf_bytes: Raw PDF file content.

    Returns:
        List of PageText objects, one per non-empty page.

    Raises:
        ValueError: If the file is not a valid PDF or contains no text.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Failed to open PDF: {e}") from e

    pages: list[PageText] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text").strip()

        if text:
            pages.append(PageText(page_number=page_num + 1, text=text))
        else:
            logger.debug("Skipping empty page %d", page_num + 1)

    total_pages = len(doc)
    doc.close()

    if not pages:
        raise ValueError("PDF contains no extractable text")

    logger.info("Extracted text from %d/%d pages", len(pages), total_pages)
    return pages
