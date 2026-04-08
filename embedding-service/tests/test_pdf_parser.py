"""Tests for the PDF parser."""

import pytest
import fitz  # PyMuPDF

from app.pdf_parser import extract_pages


def _make_pdf(pages_text: list[str]) -> bytes:
    """Create a minimal in-memory PDF with the given page texts."""
    doc = fitz.open()
    for text in pages_text:
        page = doc.new_page()
        if text:
            page.insert_text((72, 72), text, fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class TestExtractPages:
    """Tests for the extract_pages function."""

    def test_single_page(self):
        pdf = _make_pdf(["Hello, world!"])
        pages = extract_pages(pdf)

        assert len(pages) == 1
        assert pages[0].page_number == 1
        assert "Hello, world!" in pages[0].text

    def test_multiple_pages(self):
        pdf = _make_pdf(["Page one content", "Page two content", "Page three content"])
        pages = extract_pages(pdf)

        assert len(pages) == 3
        assert pages[0].page_number == 1
        assert pages[1].page_number == 2
        assert pages[2].page_number == 3

    def test_empty_pages_skipped(self):
        pdf = _make_pdf(["Content here", "", "More content"])
        pages = extract_pages(pdf)

        assert len(pages) == 2
        assert pages[0].page_number == 1
        assert pages[1].page_number == 3

    def test_all_empty_pages_raises(self):
        pdf = _make_pdf(["", "", ""])
        with pytest.raises(ValueError, match="no extractable text"):
            extract_pages(pdf)

    def test_invalid_pdf_raises(self):
        with pytest.raises(ValueError, match="Failed to open PDF"):
            extract_pages(b"this is not a pdf")

    def test_empty_bytes_raises(self):
        with pytest.raises(ValueError):
            extract_pages(b"")

    def test_page_numbers_are_1_indexed(self):
        pdf = _make_pdf(["First", "Second"])
        pages = extract_pages(pdf)
        assert pages[0].page_number == 1
        assert pages[1].page_number == 2
