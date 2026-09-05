"""Tests the layout-awareness logic in pdf_extractor.py. All tests target
_reorder_words_into_text() directly with hand-built word-position lists
(matching pdfplumber's extract_words() shape) -- no real PDF file or
pdfplumber I/O involved, so these run with no dependency on pdfplumber
being installed correctly for actual PDF parsing.
"""

from app.services.document_extraction.pdf_extractor import _reorder_words_into_text


def _word(text: str, x0: float, x1: float, top: float, bottom: float | None = None) -> dict:
    return {"text": text, "x0": x0, "x1": x1, "top": top, "bottom": bottom or top + 10}


def test_single_column_words_already_in_order_come_back_unchanged():
    words = [
        _word("Hello", x0=10, x1=50, top=10),
        _word("World", x0=60, x1=100, top=10),
        _word("Second", x0=10, x1=60, top=30),
        _word("Line", x0=70, x1=100, top=30),
    ]

    text = _reorder_words_into_text(words, page_width=200)

    assert text == "Hello World\nSecond Line"


def test_two_column_page_emits_left_column_then_right_column():
    # Page width 300: gutter strip checked is 120-180. Left column words
    # sit entirely below 120, right column words entirely above 180, so no
    # word crosses the gutter -- this should be detected as two columns.
    words = [
        _word("LeftTop", x0=10, x1=90, top=10),
        _word("LeftBottom", x0=10, x1=90, top=100),
        _word("RightTop", x0=190, x1=280, top=10),
        _word("RightBottom", x0=190, x1=280, top=100),
    ]

    text = _reorder_words_into_text(words, page_width=300)

    assert text == "LeftTop\nLeftBottom\n\nRightTop\nRightBottom"


def test_words_out_of_horizontal_order_within_a_line_get_sorted():
    words = [
        _word("World", x0=60, x1=100, top=10),
        _word("Hello", x0=10, x1=50, top=10),
    ]

    text = _reorder_words_into_text(words, page_width=200)

    assert text == "Hello World"


def test_lines_out_of_vertical_order_get_sorted_top_to_bottom():
    words = [
        _word("Second", x0=10, x1=60, top=30),
        _word("First", x0=10, x1=60, top=10),
    ]

    text = _reorder_words_into_text(words, page_width=200)

    assert text == "First\nSecond"


def test_empty_word_list_returns_empty_string():
    assert _reorder_words_into_text([], page_width=200) == ""


def test_single_sided_content_is_not_misdetected_as_two_columns():
    # All words on one side of the gutter strip -- must not be treated as
    # two columns just because there happens to be a gap somewhere.
    words = [
        _word("OnlyLeft", x0=10, x1=90, top=10),
        _word("StillLeft", x0=10, x1=90, top=30),
    ]

    text = _reorder_words_into_text(words, page_width=300)

    assert text == "OnlyLeft\nStillLeft"
