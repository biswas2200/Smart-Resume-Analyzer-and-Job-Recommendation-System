"""DOCX implementation of DocumentTextExtractor, via python-docx. Same
impure/pure split as pdf_extractor.py: DocxTextExtractor.extract opens the
file, _document_lines walks it, and _lines_to_text (pure) turns the walked
lines into text so the assembly rules can be tested without a .docx file.

Reading order: body paragraphs and tables in document order (a resume's
two-column layouts are usually tables -- each row's cells are emitted left to
right, one line per cell, so a skills sidebar ends up next to, not inside,
the content it sits beside), then every header and footer once. python-docx
exposes paragraphs and tables as separate collections, so document order is
recovered by walking the body element's children directly.
"""

import io
from collections.abc import Iterable


class DocxTextExtractor:
    """DocumentTextExtractor for .docx (Office Open XML) files."""

    def extract(self, file_bytes: bytes) -> str:
        # Imported lazily so python-docx only has to be importable when a DOCX
        # is actually uploaded, matching pdf_extractor's pattern.
        from docx import Document

        document = Document(io.BytesIO(file_bytes))
        return _lines_to_text(_document_lines(document))


def _document_lines(document) -> Iterable[str]:
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    body = document.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            yield Paragraph(child, document).text
        elif tag == "tbl":
            for row in Table(child, document).rows:
                seen_cells = set()
                for cell in row.cells:
                    # Merged cells repeat the same underlying element.
                    if id(cell._tc) in seen_cells:
                        continue
                    seen_cells.add(id(cell._tc))
                    for paragraph in cell.paragraphs:
                        yield paragraph.text

    for section in document.sections:
        for part in (section.header, section.footer):
            if part is None or part.is_linked_to_previous:
                continue
            for paragraph in part.paragraphs:
                yield paragraph.text


def _lines_to_text(lines: Iterable[str]) -> str:
    """Joins lines with newlines, dropping blank runs so section headings the
    sectioner looks for ("Experience" alone on a line) stay on their own
    line while empty spacer paragraphs don't pad the word count."""
    kept = [line.strip() for line in lines]
    return "\n".join(line for line in kept if line)
