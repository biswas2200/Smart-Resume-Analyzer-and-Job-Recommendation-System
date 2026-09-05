"""PDF implementation of DocumentTextExtractor. Split into an "impure" layer
(PdfTextExtractor.extract, which does real file I/O via pdfplumber) and a
pure layer (_reorder_words_into_text and its helpers), so the actual
layout-awareness logic can be tested with hand-built word lists -- no real
PDF file needed -- mirroring the impure/pure split already used in
local_ner_parser.py.
"""

import io

# Words within this many PDF points of vertical difference are treated as
# being on the same line. 3.0 comfortably covers normal font-size line
# height variation without merging genuinely separate lines.
_LINE_TOP_TOLERANCE = 3.0

# The vertical strip (as a fraction of page width) checked for a column
# gutter. A resume with two columns (e.g. a skills sidebar next to the main
# content) almost always has a visible gap somewhere in the middle third of
# the page; a single-column resume has words spread across this whole
# strip.
_COLUMN_GUTTER_LEFT_FRACTION = 0.4
_COLUMN_GUTTER_RIGHT_FRACTION = 0.6

# If more than this fraction of a page's words cross the middle strip, the
# page is treated as single-column rather than two-column -- a real gutter
# should have very few, ideally zero, words overlapping it.
_MAX_GUTTER_OVERLAP_FRACTION = 0.05


class PdfTextExtractor:
    """DocumentTextExtractor for PDF files, using pdfplumber. Reorders each
    page's words into column-aware reading order before returning them as
    text, so a two-column resume's sections don't get interleaved -- see
    _reorder_words_into_text for the actual heuristic.
    """

    def extract(self, file_bytes: bytes) -> str:
        """Extract all pages' text from a PDF's raw bytes, column-aware."""
        # Imported lazily so pdfplumber only needs to be installed when a
        # PDF is actually being parsed, matching the lazy-import pattern
        # already used for the groq/google-genai/transformers SDKs.
        import pdfplumber

        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            page_texts = [
                _reorder_words_into_text(page.extract_words(), page.width)
                for page in pdf.pages
            ]
        return "\n\n".join(page_texts)


def _reorder_words_into_text(words: list[dict], page_width: float) -> str:
    """Pure function, no I/O -- reorders a page's words (pdfplumber
    extract_words() shape: {"text", "x0", "x1", "top", "bottom"}, plus
    whatever other keys pdfplumber includes, which are ignored here) into
    correct reading order.

    Kept as a simple, explainable heuristic rather than a full layout-
    detection model: detect whether the page looks like two columns (a
    largely-empty vertical strip near the page's middle, with words on both
    sides of it); if so, emit column 0 (left) in full, then column 1
    (right) in full, since a resume's side-by-side sections (e.g. a skills
    sidebar next to the main content) are independent reading sequences,
    not a left-then-right-per-line layout. Otherwise, treat the whole page
    as one column.
    """
    if not words:
        return ""

    if _looks_like_two_columns(words, page_width):
        split_x = page_width / 2
        left_words = [word for word in words if word["x0"] < split_x]
        right_words = [word for word in words if word["x0"] >= split_x]
        return _lines_from_words(left_words) + "\n\n" + _lines_from_words(right_words)

    return _lines_from_words(words)


def _looks_like_two_columns(words: list[dict], page_width: float) -> bool:
    """True if a vertical gutter is visible near the page's middle (few
    words overlap it) with real content on both sides of it.
    """
    gutter_left = page_width * _COLUMN_GUTTER_LEFT_FRACTION
    gutter_right = page_width * _COLUMN_GUTTER_RIGHT_FRACTION

    crossing_gutter = 0
    left_of_gutter = 0
    right_of_gutter = 0
    for word in words:
        if word["x0"] < gutter_right and word["x1"] > gutter_left:
            crossing_gutter += 1
        elif word["x1"] <= gutter_left:
            left_of_gutter += 1
        elif word["x0"] >= gutter_right:
            right_of_gutter += 1

    if left_of_gutter == 0 or right_of_gutter == 0:
        return False
    return (crossing_gutter / len(words)) < _MAX_GUTTER_OVERLAP_FRACTION


def _lines_from_words(words: list[dict]) -> str:
    """Group words into lines (by clustering close `top` values), sort each
    line's words left-to-right, sort lines top-to-bottom, and join into
    text. Returns "" for an empty word list (used for a page/column with no
    words in it).
    """
    if not words:
        return ""

    sorted_by_top = sorted(words, key=lambda word: word["top"])
    lines: list[list[dict]] = []
    for word in sorted_by_top:
        # Compared against the first word of the current line (not the
        # previous word) so small cumulative drift across a long line of
        # slightly-varying tops can't gradually merge it into the next
        # line.
        if lines and abs(word["top"] - lines[-1][0]["top"]) <= _LINE_TOP_TOLERANCE:
            lines[-1].append(word)
        else:
            lines.append([word])

    line_texts = []
    for line_words in lines:
        line_words.sort(key=lambda word: word["x0"])
        line_texts.append(" ".join(word["text"] for word in line_words))
    return "\n".join(line_texts)
