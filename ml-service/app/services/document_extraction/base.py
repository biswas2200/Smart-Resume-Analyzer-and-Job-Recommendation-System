"""Shared contract for turning a resume file's raw bytes into plain text.
One concrete implementation per file format (see pdf_extractor.py), picked
at runtime by registry.py -- follows the same Protocol-based, Open/Closed
shape as LLMClient in llm_client.py (see CLAUDE.md, "Design principles").
"""

from typing import Protocol


class DocumentTextExtractor(Protocol):
    """Anything that can turn a resume file's raw bytes into plain text, in
    correct reading order. Implemented once per supported file format.
    """

    def extract(self, file_bytes: bytes) -> str:
        """Return the file's text content, reordered into correct reading
        order where the format's structure requires it (e.g. multi-column
        PDFs).
        """
        ...


class UnsupportedDocumentTypeError(Exception):
    """Raised by registry.get_extractor_for_filename() when no extractor is
    registered for a given file's extension (e.g. .docx, until a DOCX
    extractor is added).
    """
