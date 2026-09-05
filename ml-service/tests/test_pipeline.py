"""Tests parser.py and explainer.py -- the two LLM-touching modules -- with
a mocked LLMClient, so the suite needs no network access or GROQ_API_KEY.

parse_resume() defaults to the local NER backend (see
test_local_ner_parser.py for that path), so every test here that exercises
the LLM-based parsing path must explicitly opt in via
PARSER_BACKEND=llm -- otherwise parse_resume() would ignore the injected
FakeLLMClient and try to build the real NER pipeline instead.
"""

import json

import pytest

from app.config import get_settings
from app.models.schemas import AtsScoreResponse, GapAnalysis, ResumeProfile, RoleMatch
from app.services import parser
from app.services.explainer import explain_results
from app.services.parser import parse_resume


class FakeLLMClient:
    def __init__(self, response: str) -> None:
        self.response = response
        self.last_system_prompt: str | None = None
        self.last_user_prompt: str | None = None

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        self.last_system_prompt = system_prompt
        self.last_user_prompt = user_prompt
        return self.response


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """Settings.parser_backend is read via get_settings(), which is
    @lru_cache'd -- without clearing it, whichever test runs first "wins"
    and every later test silently reuses its PARSER_BACKEND instead of the
    one it set itself.
    """
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_parse_resume_returns_profile_from_mocked_llm(monkeypatch):
    monkeypatch.setenv("PARSER_BACKEND", "llm")

    payload = {
        "name": "Jane Doe",
        "email": "jane@example.com",
        "phone": "555-1234",
        "skills": ["Python", "SQL"],
        "experience": [],
        "education": [],
    }
    client = FakeLLMClient(json.dumps(payload))

    profile = parse_resume("some resume text", client=client)

    assert profile.name == "Jane Doe"
    assert profile.skills == ["Python", "SQL"]
    assert client.last_user_prompt == "some resume text"


def test_parse_resume_strips_markdown_code_fence(monkeypatch):
    monkeypatch.setenv("PARSER_BACKEND", "llm")

    payload = {"name": "Jane", "email": "", "phone": "", "skills": [], "experience": [], "education": []}
    client = FakeLLMClient(f"```json\n{json.dumps(payload)}\n```")

    profile = parse_resume("resume text", client=client)

    assert profile.name == "Jane"


def test_parse_resume_defaults_to_local_backend(monkeypatch):
    # No PARSER_BACKEND set -- should use the local NER path, and never
    # touch the LLM client at all (asserted by never providing one: if
    # parse_resume tried the LLM path here, get_llm_client() would attempt
    # to build a real GroqLLMClient and fail on a missing API key/network).
    sentinel_profile = ResumeProfile(name="Local Parse Sentinel")
    monkeypatch.setattr(parser, "parse_resume_local", lambda resume_text: sentinel_profile)

    profile = parse_resume("some resume text")

    assert profile is sentinel_profile


def test_parse_resume_routes_to_llm_when_configured(monkeypatch):
    def _fail_if_called(resume_text: str) -> ResumeProfile:
        raise AssertionError("local backend should not run when PARSER_BACKEND=llm")

    monkeypatch.setenv("PARSER_BACKEND", "llm")
    monkeypatch.setattr(parser, "parse_resume_local", _fail_if_called)
    payload = {"name": "Jane", "email": "", "phone": "", "skills": [], "experience": [], "education": []}
    client = FakeLLMClient(json.dumps(payload))

    profile = parse_resume("resume text", client=client)

    assert profile.name == "Jane"


def test_explain_results_returns_llm_text():
    client = FakeLLMClient("This is a coaching explanation.")
    profile = ResumeProfile(name="Jane Doe", skills=["Python"])
    ats = AtsScoreResponse(score=70, max_score=100, checks=[])
    matches = [RoleMatch(role="Data Scientist", score=0.8, matched_skills=["Python"], missing_skills=["Statistics"])]
    gaps = [GapAnalysis(role="Data Scientist", missing_skills=["Statistics"])]

    explanation = explain_results(profile, ats, matches, gaps, client=client)

    assert explanation == "This is a coaching explanation."
    assert "Data Scientist" in client.last_user_prompt
    assert "Statistics" in client.last_user_prompt
