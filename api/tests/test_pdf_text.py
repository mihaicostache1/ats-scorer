"""PDF text extraction tests: reading order, OCR fallback and unreadable files.

These need neither a database nor Redis. OCR is replaced by a fake everywhere except
one test, which runs real Tesseract when it is installed.
"""

import os
import shutil
from pathlib import Path

import pymupdf
import pytesseract
import pytest

from app.core.config import settings
from app.services import pdf_text
from app.services.pdf_text import (
    MAX_PAGES,
    OcrUnavailableError,
    PdfExtractionError,
    extract_text,
    tesseract_ocr,
)

# One CV per layout from the L-5 generator (seed 42).
FIXTURES = Path(__file__).parent / "fixtures" / "cvs"
CLASSIC, TWO_COLUMN, TABLE, PLAIN = "C001.pdf", "C002.pdf", "C003.pdf", "C005.pdf"

TESSERACT_INSTALLED = bool(settings.TESSERACT_CMD or shutil.which("tesseract"))


def _fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _scanned(source: bytes, dpi: int = 72) -> bytes:
    """Turn the first page of a PDF into an image-only PDF, like a scanner would."""
    with pymupdf.open(stream=source, filetype="pdf") as original:
        pixmap = original[0].get_pixmap(dpi=dpi)
    with pymupdf.open() as document:
        page = document.new_page(width=595, height=842)
        page.insert_image(page.rect, pixmap=pixmap)
        data: bytes = document.tobytes(deflate=True)
    return data


def _no_ocr_expected(png: bytes) -> str:
    raise AssertionError("OCR must not run on a page that has embedded text")


def _ocr_missing(png: bytes) -> str:
    raise OcrUnavailableError("Tesseract is not installed")


def _positions(text: str, *phrases: str) -> list[int]:
    positions = [text.find(phrase) for phrase in phrases]
    assert -1 not in positions, [p for p in phrases if p not in text]
    return positions


@pytest.mark.parametrize("name", [CLASSIC, TWO_COLUMN, TABLE, PLAIN])
def test_every_l5_layout_produces_text(name: str) -> None:
    """Each L-5 layout yields its text from the PDF itself, without OCR."""
    result = extract_text(_fixture(name), ocr=_no_ocr_expected)

    assert len(result.text) > 500
    assert result.page_count == 1
    assert result.ocr_pages == 0
    assert result.ocr_used is False
    assert "@example." in result.text
    assert "\x00" not in result.text


def test_all_generated_l5_cvs_produce_text() -> None:
    """With the full L-5 dataset generated locally, every CV in it produces text."""
    dataset = Path(__file__).parents[2] / "ml" / "synthetic" / "output" / "cvs"
    pdfs = sorted(dataset.glob("*.pdf"))
    if len(pdfs) < 50:
        pytest.skip("full L-5 dataset not generated (run ml/synthetic/generate.py)")
    for path in pdfs:
        assert len(extract_text(path.read_bytes(), ocr=_no_ocr_expected).text) > 300, path.name


def test_two_column_cv_is_read_column_by_column() -> None:
    """The sidebar is written to the file first, but the main column is read first."""
    data = _fixture(TWO_COLUMN)
    text = extract_text(data, ocr=None).text

    # Left (main) column top to bottom, then the right (sidebar) column top to bottom.
    main = ["Gary Vaughan", "About Me", "Career History", "Maintained a shared component"]
    sidebar = ["Contact", "Skills", "Education", "Courses & Certificates"]
    positions = _positions(text, *main, *sidebar)
    assert positions == sorted(positions)
    assert text.startswith("Gary Vaughan")

    # The order stored in the file is the other way round, so this is the sorting at work.
    with pymupdf.open(stream=data, filetype="pdf") as document:
        file_order = document[0].get_text()
    assert file_order.find("Contact") < file_order.find("Gary Vaughan")


def test_table_cv_keeps_rows_together() -> None:
    """A table is not mistaken for columns: each job's dates stay with its description."""
    text = extract_text(_fixture(TABLE), ocr=None).text

    positions = _positions(
        text,
        "2024 - Present",
        "Bluepeak Systems",
        "2020 - 2024",
        "Saffron Street Bank",
        "2017 - 2020",
        "Ferrowind Technologies",
        "Technical Skills",
    )
    assert positions == sorted(positions)
    # The first job's bullets sit between its heading and the next job.
    first_bullet = text.find("Presented findings")
    assert positions[1] < first_bullet < positions[2]
    # A few right-aligned contact lines in the header do not make a column.
    assert text.find("nathalie.lefevre@example.org") < text.find("About Me")


def test_columns_and_spanning_blocks() -> None:
    """Columns are read left then right; a full-width block is read where it stands."""
    with pymupdf.open() as document:
        page = document.new_page(width=600, height=800)
        # Deliberately written in an unhelpful order: right column first, header last.
        page.insert_textbox((320, 300, 560, 400), "RIGHT-LOWER " * 12)
        page.insert_textbox((320, 100, 560, 200), "RIGHT-UPPER " * 12)
        page.insert_textbox((40, 300, 280, 400), "LEFT-LOWER " * 12)
        page.insert_textbox((40, 500, 560, 540), "FOOTER " * 8)
        page.insert_textbox((40, 100, 280, 200), "LEFT-UPPER " * 12)
        page.insert_textbox((40, 40, 560, 80), "HEADER " * 8)
        data = document.tobytes()

    text = extract_text(data, ocr=None).text
    order = ["HEADER", "LEFT-UPPER", "LEFT-LOWER", "RIGHT-UPPER", "RIGHT-LOWER", "FOOTER"]
    positions = _positions(text, *order)
    assert positions == sorted(positions)
    # Each column is contiguous: no right-column text before the left column ends.
    assert text.rfind("LEFT-LOWER") < text.find("RIGHT-UPPER")


def test_single_column_is_read_top_to_bottom() -> None:
    """Without columns, blocks are read by position, whatever their order in the file."""
    with pymupdf.open() as document:
        page = document.new_page(width=600, height=800)
        page.insert_textbox((40, 500, 560, 560), "THIRD " * 20)
        page.insert_textbox((40, 100, 560, 160), "FIRST " * 20)
        page.insert_textbox((40, 300, 560, 360), "SECOND " * 20)
        data = document.tobytes()

    positions = _positions(extract_text(data, ocr=None).text, "FIRST", "SECOND", "THIRD")
    assert positions == sorted(positions)


def test_scanned_page_falls_back_to_ocr() -> None:
    """A page without embedded text is rendered and sent to OCR."""
    received: list[bytes] = []

    def fake_ocr(png: bytes) -> str:
        received.append(png)
        return "Louise Vincent\nSenior Engineer with a long scanned history\n" * 3

    result = extract_text(_scanned(_fixture(CLASSIC)), ocr=fake_ocr)

    assert result.ocr_pages == 1
    assert result.ocr_used is True
    assert result.text.startswith("Louise Vincent")
    assert len(received) == 1
    assert received[0].startswith(b"\x89PNG")


def test_only_pages_with_little_text_are_sent_to_ocr() -> None:
    """In a mixed document the text page is read directly and only the scan is OCRed."""
    calls = 0

    def fake_ocr(png: bytes) -> str:
        nonlocal calls
        calls += 1
        return "TEXT FROM THE SCANNED SECOND PAGE, long enough to count as real content."

    with pymupdf.open(stream=_fixture(CLASSIC), filetype="pdf") as document:
        with pymupdf.open(stream=_scanned(_fixture(TABLE)), filetype="pdf") as scan:
            document.insert_pdf(scan)
        data = document.tobytes()

    result = extract_text(data, ocr=fake_ocr)

    assert result.page_count == 2
    assert calls == 1
    assert result.ocr_pages == 1
    first, second = _positions(result.text, "@example.", "TEXT FROM THE SCANNED SECOND PAGE")
    assert first < second


def test_ocr_result_is_used_only_when_it_finds_more() -> None:
    """A page with a few real characters keeps them when OCR finds nothing better."""
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "Short page")
        data = document.tobytes()

    result = extract_text(data, ocr=lambda png: "")
    assert result.text == "Short page"
    assert result.ocr_pages == 0

    # The same page still produces its text when OCR is missing altogether.
    assert extract_text(data, ocr=_ocr_missing).text == "Short page"


def test_scanned_pdf_without_usable_ocr_is_an_error() -> None:
    """No embedded text and no OCR result is reported with a specific reason."""
    scanned = _scanned(_fixture(CLASSIC))

    with pytest.raises(PdfExtractionError) as missing:
        extract_text(scanned, ocr=_ocr_missing)
    assert missing.value.code == "ocr_unavailable"
    assert "OCR could not be run" in missing.value.message

    for ocr in (None, lambda png: "   \n"):
        with pytest.raises(PdfExtractionError) as empty:
            extract_text(scanned, ocr=ocr)
        assert empty.value.code == "no_text_found"


@pytest.mark.parametrize(
    "data",
    [
        b"%PDF-1.4\n" + os.urandom(2000) + b"\n%%EOF\n",
        b"%PDF-1.4\n%%EOF\n",
        b"%PDF-1.4\nthis only pretends to be a PDF\n%%EOF\n",
        b"",
    ],
    ids=["random-bytes", "header-only", "text-with-pdf-markers", "empty"],
)
def test_corrupt_pdf_is_reported_not_raised_as_a_crash(data: bytes) -> None:
    """A damaged file raises the extraction error, never a PyMuPDF internal one."""
    with pytest.raises(PdfExtractionError) as error:
        extract_text(data, ocr=None)
    assert error.value.code == "invalid_pdf"
    assert error.value.message


def test_damaged_page_content_is_reported() -> None:
    """A real PDF with its middle overwritten is rejected as damaged."""
    good = _fixture(CLASSIC)
    data = good[:400] + b"\x00" * (len(good) - 800) + good[-400:]

    with pytest.raises(PdfExtractionError) as error:
        extract_text(data, ocr=None)
    assert error.value.code == "invalid_pdf"


def test_password_protected_pdf_is_reported() -> None:
    with pymupdf.open(stream=_fixture(CLASSIC), filetype="pdf") as document:
        data = document.tobytes(
            encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="owner"
        )

    with pytest.raises(PdfExtractionError) as error:
        extract_text(data, ocr=None)
    assert error.value.code == "encrypted_pdf"


def test_page_limit() -> None:
    """A document over the page limit is refused; one at the limit is processed."""
    with pymupdf.open() as document:
        for number in range(MAX_PAGES):
            document.new_page().insert_text((72, 72), f"Page {number + 1} of a long document")
        at_limit = document.tobytes()
        document.new_page()
        over_limit = document.tobytes()

    assert extract_text(at_limit, ocr=None).page_count == MAX_PAGES
    with pytest.raises(PdfExtractionError) as error:
        extract_text(over_limit, ocr=None)
    assert error.value.code == "too_many_pages"
    assert str(MAX_PAGES + 1) in error.value.message


def test_text_is_cleaned_for_storage() -> None:
    """NUL characters (which PostgreSQL rejects) and stray whitespace are removed."""
    assert pdf_text._clean("A\x00B  \n\n\n\n\nC \n") == "AB\n\nC"


def test_tesseract_missing_is_reported_as_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without the Tesseract binary, OCR raises the error the extractor knows how to handle."""
    monkeypatch.setattr(settings, "TESSERACT_CMD", "")
    monkeypatch.setattr(pytesseract.pytesseract, "tesseract_cmd", "no-such-tesseract-binary")
    with pymupdf.open(stream=_fixture(CLASSIC), filetype="pdf") as document:
        png = document[0].get_pixmap(dpi=72).tobytes("png")

    with pytest.raises(OcrUnavailableError):
        tesseract_ocr(png)


@pytest.mark.skipif(not TESSERACT_INSTALLED, reason="Tesseract is not installed")
def test_real_tesseract_reads_a_scanned_l5_cv() -> None:
    """End to end with real Tesseract: a scanned L-5 CV comes back as readable text."""
    result = extract_text(_scanned(_fixture(CLASSIC), dpi=200))

    assert result.ocr_pages == 1
    assert len(result.text) > 500
    lowered = result.text.lower()
    assert "louise" in lowered
    assert "experience" in lowered or "skills" in lowered
