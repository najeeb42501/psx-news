"""PDF/image text extraction on real PSX files (OCR tests skip if Tesseract is missing)."""
from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.adapters.parsers.pdf_ocr import PdfOcrParser, find_tesseract
from pipeline.core.models import RawItem

FIX = Path(__file__).parent / "fixtures"
needs_tesseract = pytest.mark.skipif(find_tesseract() is None, reason="Tesseract not installed")


def _raw(**kw) -> RawItem:
    return RawItem(source_id="t", external_id="x", url="https://example.com", title="Title", **kw)


@needs_tesseract
def test_scanned_pdf_is_ocrd() -> None:
    doc = PdfOcrParser().extract_text(
        _raw(content=(FIX / "psx_284352_dividend_scanned.pdf").read_bytes(), content_type="application/pdf")
    )
    assert doc.used_ocr
    assert "Credit of Final Cash Dividend" in doc.text
    assert "Rs. 10/- per share" in doc.text
    assert "100%" in doc.text


@needs_tesseract
def test_notice_image_is_ocrd() -> None:
    doc = PdfOcrParser().extract_text(
        _raw(content=(FIX / "psx_284362_board_meeting.gif").read_bytes(), content_type="image/gif")
    )
    assert doc.used_ocr
    assert "Board Meeting In Progress" in doc.text
    assert "2026-10-02" in doc.text


def test_no_attachment_uses_title_and_summary() -> None:
    doc = PdfOcrParser().extract_text(_raw(summary="SBP keeps policy rate unchanged."))
    assert doc.text == "Title\n\nSBP keeps policy rate unchanged."
    assert not doc.used_ocr


def test_unknown_content_rejected() -> None:
    with pytest.raises(ValueError):
        PdfOcrParser().extract_text(_raw(content=b"<html>", content_type="text/html"))
