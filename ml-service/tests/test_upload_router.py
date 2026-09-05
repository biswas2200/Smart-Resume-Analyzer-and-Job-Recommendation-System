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


def test_analyze_file_runs_the_full_pipeline_on_extracted_text(monkeypatch):
    from app.models.schemas import AtsCheck, AtsScoreResponse, GapAnalysis, ResumeProfile, RoleMatch

    fake_extractor = _FakeExtractor("Jane Doe, Python developer")
    sentinel_profile = ResumeProfile(name="Jane Doe", skills=["Python"])
    sentinel_ats = AtsScoreResponse(
        score=50, max_score=70, checks=[AtsCheck(name="contact_email", passed=False, detail="none")]
    )
    sentinel_matches = [
        RoleMatch(role="Backend Software Engineer", score=0.9, matched_skills=["Python"], missing_skills=[])
    ]
    sentinel_gaps = [GapAnalysis(role="Backend Software Engineer", missing_skills=[])]

    monkeypatch.setattr(upload, "get_extractor_for_filename", lambda filename: fake_extractor)
    monkeypatch.setattr(upload, "parse_resume", lambda resume_text: sentinel_profile)
    monkeypatch.setattr(upload.ats_score, "score_resume", lambda resume_text: sentinel_ats)
    monkeypatch.setattr(
        upload.matcher, "match_roles", lambda skills, top_n: sentinel_matches
    )
    monkeypatch.setattr(upload.gap_analysis, "analyze_gaps", lambda matches: sentinel_gaps)
    monkeypatch.setattr(upload, "explain_results", lambda *args, **kwargs: "You're a strong match.")

    response = client.post(
        "/analyze-file",
        files={"file": ("resume.pdf", io.BytesIO(b"fake pdf bytes"), "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["name"] == "Jane Doe"
    assert body["ats_score"]["score"] == 50
    assert body["matches"][0]["role"] == "Backend Software Engineer"
    assert body["gaps"][0]["role"] == "Backend Software Engineer"
    assert body["explanation"] == "You're a strong match."
    assert fake_extractor.received_bytes == b"fake pdf bytes"


def test_analyze_file_rejects_unsupported_extension():
    response = client.post(
        "/analyze-file",
        files={"file": ("resume.docx", io.BytesIO(b"fake docx bytes"), "application/octet-stream")},
    )

    assert response.status_code == 415
