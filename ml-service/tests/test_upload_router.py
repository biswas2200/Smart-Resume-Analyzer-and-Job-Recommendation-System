"""Tests the /parse-file endpoint (routers/upload.py). Both seams -- the
document extractor and parse_resume -- are faked, so no real PDF file or
NER model is involved.
"""

import io

from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ResumeProfile
from app.routers import upload

client = TestClient(app)


class _FakeExtractor:
    def __init__(self, text: str) -> None:
        self.text = text
        self.received_bytes: bytes | None = None

    def extract(self, file_bytes: bytes) -> str:
        self.received_bytes = file_bytes
        return self.text


def test_parse_file_returns_profile_from_extracted_text(monkeypatch):
    fake_extractor = _FakeExtractor("Jane Doe, Python developer")
    sentinel_profile = ResumeProfile(name="Jane Doe")

    monkeypatch.setattr(upload, "get_extractor_for_filename", lambda filename: fake_extractor)
    monkeypatch.setattr(upload, "parse_resume", lambda resume_text: sentinel_profile)

    response = client.post(
        "/parse-file",
        files={"file": ("resume.pdf", io.BytesIO(b"fake pdf bytes"), "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json()["profile"]["name"] == "Jane Doe"
    assert fake_extractor.received_bytes == b"fake pdf bytes"


def test_parse_file_rejects_unsupported_extension():
    # No monkeypatching needed -- the registry itself has no heavy
    # dependencies, so this exercises the real UnsupportedDocumentTypeError
    # -> HTTP 415 mapping end to end.
    response = client.post(
        "/parse-file",
        files={"file": ("resume.docx", io.BytesIO(b"fake docx bytes"), "application/octet-stream")},
    )

    assert response.status_code == 415
