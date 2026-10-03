"""Text from PDFs (pdfplumber) with Tesseract OCR for scanned pages and images."""
from __future__ import annotations

import io
import os
import shutil
from pathlib import Path

import pdfplumber
import pytesseract
from PIL import Image, ImageSequence

from pipeline.core.models import ParsedDoc, RawItem

WINDOWS_DEFAULT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")


def find_tesseract(explicit: str | None = None) -> str | None:
    """Explicit setting, then TESSERACT_CMD, then PATH, then the Windows installer default."""
    configured = explicit or os.environ.get("TESSERACT_CMD")
    if configured:
        return configured
    on_path = shutil.which("tesseract")
    if on_path:
        return on_path
    return str(WINDOWS_DEFAULT) if WINDOWS_DEFAULT.exists() else None


class PdfOcrParser:
    """
    - PDFs: text layer via pdfplumber; pages with almost no text are OCR'd.
    - Images (the portal's GIF of a notice): OCR'd.
    - Feed items: title + feed description.
    Limits keep the free database small: long annual reports are cut off,
    which is fine because results and notices put the key facts first.
    """

    def __init__(
        self,
        tesseract_cmd: str | None = None,
        langs: str = "eng",
        urdu_langs: str = "urd+eng",
        max_pages: int = 15,
        max_ocr_pages: int = 6,
        max_chars: int = 40_000,
        min_page_chars: int = 40,
        dpi: int = 300,
    ) -> None:
        self.tesseract_cmd = find_tesseract(tesseract_cmd)
        if self.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = self.tesseract_cmd
        self.langs = langs
        self.urdu_langs = urdu_langs
        self.max_pages = max_pages
        self.max_ocr_pages = max_ocr_pages
        self.max_chars = max_chars
        self.min_page_chars = min_page_chars
        self.dpi = dpi

    def extract_text(self, raw: RawItem) -> ParsedDoc:
        if raw.content is None:
            text = "\n\n".join(p for p in (raw.title, raw.summary) if p)
            return ParsedDoc(text=text[: self.max_chars])
        if raw.content[:4] == b"%PDF" or raw.content_type == "application/pdf":
            return self._pdf(raw.content)
        if (raw.content_type or "").startswith("image/") or raw.content[:3] in (b"GIF", b"\x89PN", b"\xff\xd8\xff"):
            return ParsedDoc(text=self._ocr_image(Image.open(io.BytesIO(raw.content)))[: self.max_chars], used_ocr=True)
        raise ValueError(f"unsupported content type {raw.content_type!r}")

    def _pdf(self, data: bytes) -> ParsedDoc:
        parts: list[str] = []
        used_ocr = False
        ocr_done = 0
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages[: self.max_pages]:
                text = (page.extract_text() or "").strip()
                if len(text) < self.min_page_chars and ocr_done < self.max_ocr_pages:
                    image = page.to_image(resolution=self.dpi).original
                    text = self._ocr_image(image)
                    used_ocr = True
                    ocr_done += 1
                parts.append(text)
                if sum(len(p) for p in parts) >= self.max_chars:
                    break
        return ParsedDoc(text="\n\n".join(parts)[: self.max_chars], used_ocr=used_ocr)

    def _ocr_image(self, image: Image.Image) -> str:
        if not self.tesseract_cmd:
            raise RuntimeError("Tesseract is not installed; set TESSERACT_CMD (see README)")
        texts = []
        for frame in ImageSequence.Iterator(image):
            gray = frame.convert("L")
            lang = self.urdu_langs if self._is_arabic_script(gray) else self.langs
            texts.append(pytesseract.image_to_string(gray, lang=lang).strip())
        return "\n\n".join(t for t in texts if t)

    @staticmethod
    def _is_arabic_script(image: Image.Image) -> bool:
        """Mixing Urdu into English OCR turns some digits into Urdu ones ("4th" -> "4۴"),
        which would corrupt numbers, so Urdu is only used on pages written in Urdu."""
        try:
            osd = pytesseract.image_to_osd(image)
        except pytesseract.TesseractError:
            return False  # too little text to tell; English is the safe default
        return "Script: Arabic" in osd
