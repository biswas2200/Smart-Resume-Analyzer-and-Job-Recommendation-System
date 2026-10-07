"""DocxTextExtractor: the pure line-assembly rules with hand-built lines, plus
one real round trip through python-docx on a document built in memory (no
fixture file needed) covering paragraphs, a two-column table and a header.
"""

import io

from docx import Document

from app.services.document_extraction.docx_extractor import DocxTextExtractor, _lines_to_text
from app.services.document_extraction.registry import get_extractor_for_filename


def test_lines_to_text_drops_blank_lines_and_strips_whitespace():
    assert _lines_to_text(["  Jane Doe ", "", "   ", "Experience", "Engineer at Acme"]) == (
        "Jane Doe\nExperience\nEngineer at Acme"
    )


def test_extract_reads_paragraphs_tables_and_headers_in_document_order():
    document = Document()
    document.sections[0].header.paragraphs[0].text = "Confidential"
    document.add_paragraph("Jane Doe")
    document.add_paragraph("Experience")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Skills: Python, SQL"
    table.cell(0, 1).text = "Backend Engineer, Acme, 2020-2024"
    document.add_paragraph("Education")
    buffer = io.BytesIO()
    document.save(buffer)

    text = DocxTextExtractor().extract(buffer.getvalue())

    lines = text.split("\n")
    assert lines[:2] == ["Jane Doe", "Experience"]
    assert lines.index("Skills: Python, SQL") < lines.index("Backend Engineer, Acme, 2020-2024")
    assert lines.index("Backend Engineer, Acme, 2020-2024") < lines.index("Education")
    assert "Confidential" in lines


def test_registry_maps_docx_to_the_docx_extractor():
    assert isinstance(get_extractor_for_filename("resume.DOCX"), DocxTextExtractor)
