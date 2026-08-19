"""Tests parser.py and explainer.py -- the two LLM-touching modules -- with
a mocked LLMClient, so the suite needs no network access or GROQ_API_KEY.
"""

import json

from app.models.schemas import AtsScoreResponse, GapAnalysis, ResumeProfile, RoleMatch
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


def test_parse_resume_returns_profile_from_mocked_llm():
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


def test_parse_resume_strips_markdown_code_fence():
    payload = {"name": "Jane", "email": "", "phone": "", "skills": [], "experience": [], "education": []}
    client = FakeLLMClient(f"```json\n{json.dumps(payload)}\n```")

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
