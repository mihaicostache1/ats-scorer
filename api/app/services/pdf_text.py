"""Text extraction from a PDF: PyMuPDF first, Tesseract OCR for pages with little text.

Everything here is pure (bytes in, text out) so it can run in a worker thread and be
tested without a database or a queue.
"""

import io
import re
from collections.abc import Callable
from dataclasses import dataclass

import pymupdf
import pytesseract
from PIL import Image

from app.core.config import settings

# MuPDF prints repair messages for damaged files to stderr; failures are reported
# through exceptions instead.
pymupdf.TOOLS.mupdf_display_errors(False)  # type: ignore[no-untyped-call]

# Takes a page rendered as PNG and returns the text found on it.
OcrFunction = Callable[[bytes], str]

# A page with fewer non-space characters than this is treated as scanned and sent to OCR.
MIN_CHARS_PER_PAGE = 50
# A CV is short. A long document is refused so that one job cannot run for minutes.
MAX_PAGES = 50
_OCR_DPI = 300

# Column detection (see _find_gutter).
_GUTTER_SEARCH_RANGE = (0.2, 0.8)
_GUTTER_STEP = 2.0
_MIN_COLUMN_TEXT = 0.10
_MAX_SPANNING_TEXT = 0.25
# Blocks whose tops are this close (in points) count as being on the same line.
_LINE_TOLERANCE = 3.0


class PdfExtractionError(Exception):
    """The document cannot be turned into text. Retrying will not help."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class OcrUnavailableError(Exception):
    """OCR could not run on a page: Tesseract is missing or timed out."""


@dataclass(frozen=True)
class ExtractionResult:
    """Text of a whole document, pages separated by a blank line."""

    text: str
    page_count: int
    ocr_pages: int

    @property
    def ocr_used(self) -> bool:
        return self.ocr_pages > 0


@dataclass(frozen=True)
class _Block:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str

    @property
    def height(self) -> float:
        return self.y1 - self.y0


def tesseract_ocr(png: bytes) -> str:
    """Run Tesseract on a rendered page."""
    if settings.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    try:
        with Image.open(io.BytesIO(png)) as image:
            text: str = pytesseract.image_to_string(
                image, lang=settings.OCR_LANGUAGE, timeout=settings.OCR_PAGE_TIMEOUT_SECONDS
            )
    except pytesseract.TesseractNotFoundError as exc:
        raise OcrUnavailableError("Tesseract is not installed") from exc
    except (pytesseract.TesseractError, RuntimeError) as exc:
        # pytesseract raises RuntimeError when the page timeout is reached.
        raise OcrUnavailableError(f"Tesseract failed: {exc}") from exc
    return text


def _find_gutter(blocks: list[_Block], width: float, height: float) -> float | None:
    """Return the x position of the gap between two text columns, or None.

    A vertical line is a gutter when a real amount of text lies wholly on each side of
    it and little text crosses it. Amounts are block heights. The first condition keeps
    a few right-aligned header lines from counting as a column; the second keeps a
    table, whose rows run across the page, from being split.
    """
    total = sum(block.height for block in blocks)
    candidates: list[tuple[float, float]] = []
    x = width * _GUTTER_SEARCH_RANGE[0]
    while x <= width * _GUTTER_SEARCH_RANGE[1]:
        left = sum(block.height for block in blocks if block.x1 <= x)
        right = sum(block.height for block in blocks if block.x0 >= x)
        spanning = total - left - right
        if (
            left >= height * _MIN_COLUMN_TEXT
            and right >= height * _MIN_COLUMN_TEXT
            and spanning <= (left + right) * _MAX_SPANNING_TEXT
        ):
            candidates.append((spanning, x))
        x += _GUTTER_STEP
    if not candidates:
        return None
    least_spanning = min(spanning for spanning, _ in candidates)
    positions = [x for spanning, x in candidates if spanning == least_spanning]
    return positions[len(positions) // 2]


def _line_order(block: _Block) -> tuple[int, float]:
    return (round(block.y0 / _LINE_TOLERANCE), block.x0)


def _reading_order(blocks: list[_Block], width: float, height: float) -> list[_Block]:
    """Sort blocks the way a person reads the page.

    The order of text inside a PDF file is arbitrary: a sidebar is often written before
    the main column. One column is read top to bottom. Two columns are read left then
    right, and a block that spans both (a header, a footer) is read where it stands,
    after the parts of the columns above it.
    """
    gutter = _find_gutter(blocks, width, height)
    if gutter is None:
        return sorted(blocks, key=_line_order)

    ordered: list[_Block] = []
    left: list[_Block] = []
    right: list[_Block] = []
    for block in sorted(blocks, key=lambda b: b.y0):
        if block.x1 <= gutter:
            left.append(block)
        elif block.x0 >= gutter:
            right.append(block)
        else:
            ordered += sorted(left, key=_line_order) + sorted(right, key=_line_order)
            ordered.append(block)
            left, right = [], []
    return ordered + sorted(left, key=_line_order) + sorted(right, key=_line_order)


def _page_text(page: pymupdf.Page) -> str:
    """Return the embedded text of a page in reading order."""
    blocks = [
        _Block(x0, y0, x1, y1, text.strip())
        for x0, y0, x1, y1, text, _number, block_type in page.get_text("blocks")  # type: ignore[no-untyped-call]
        if block_type == 0 and text.strip()
    ]
    ordered = _reading_order(blocks, page.rect.width, page.rect.height)
    return "\n".join(block.text for block in ordered)


def _clean(text: str) -> str:
    """Drop characters PostgreSQL cannot store and tidy the whitespace."""
    text = text.replace("\x00", "")
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _visible_chars(text: str) -> int:
    return sum(1 for char in text if not char.isspace())


def extract_text(data: bytes, ocr: OcrFunction | None = tesseract_ocr) -> ExtractionResult:
    """Extract the text of a PDF, using OCR for pages that carry little embedded text.

    Raises PdfExtractionError with a stable ``code`` when no text can be produced:
    ``invalid_pdf``, ``encrypted_pdf``, ``too_many_pages``, ``ocr_unavailable`` or
    ``no_text_found``.
    """
    try:
        document = pymupdf.open(stream=data, filetype="pdf")  # type: ignore[no-untyped-call]
    except Exception as exc:
        raise PdfExtractionError(
            "invalid_pdf", "The file is damaged and could not be opened as a PDF."
        ) from exc

    with document:
        if document.needs_pass:
            raise PdfExtractionError(
                "encrypted_pdf", "The PDF is password-protected and cannot be read."
            )
        page_count = document.page_count
        if page_count == 0:
            raise PdfExtractionError("invalid_pdf", "The PDF contains no pages.")
        if page_count > MAX_PAGES:
            raise PdfExtractionError(
                "too_many_pages",
                f"The PDF has {page_count} pages; the limit is {MAX_PAGES}.",
            )

        pages: list[str] = []
        ocr_pages = 0
        ocr_failed = False
        try:
            for number in range(page_count):
                page = document.load_page(number)  # type: ignore[no-untyped-call]
                text = _clean(_page_text(page))
                if ocr is not None and _visible_chars(text) < MIN_CHARS_PER_PAGE:
                    try:
                        recognised = _clean(ocr(page.get_pixmap(dpi=_OCR_DPI).tobytes("png")))
                    except OcrUnavailableError:
                        ocr_failed = True
                    else:
                        if _visible_chars(recognised) > _visible_chars(text):
                            text = recognised
                            ocr_pages += 1
                if text:
                    pages.append(text)
        except Exception as exc:
            raise PdfExtractionError(
                "invalid_pdf", "The PDF is damaged and its pages could not be read."
            ) from exc

    if not pages:
        if ocr_failed:
            raise PdfExtractionError(
                "ocr_unavailable",
                "The PDF has no embedded text (it looks scanned) and OCR could not be run.",
            )
        raise PdfExtractionError("no_text_found", "No text was found in the PDF.")
    return ExtractionResult(text="\n\n".join(pages), page_count=page_count, ocr_pages=ocr_pages)
