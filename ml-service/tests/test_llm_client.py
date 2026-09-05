"""Tests the provider-selection factory in llm_client.py -- verifies
get_llm_client() builds the right client class based on Settings.llm_provider,
without making any real network calls to Groq or Gemini.
"""

import pytest

from app.config import get_settings
from app.services import llm_client


class _FakeGroqSdkClient:
    """Stand-in for groq.Groq -- just needs to accept the constructor call
    GroqLLMClient makes, never actually used to complete a request here.
    """

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key


class _FakeGeminiSdkClient:
    """Stand-in for google.genai.Client -- just needs to accept the
    constructor call GeminiLLMClient makes.
    """

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key


@pytest.fixture(autouse=True)
def _reset_llm_client_caches():
    """get_settings() and get_llm_client() both cache their result at
    module scope, so every test must clear both -- otherwise whichever
    test runs first "wins" and later tests silently reuse its client
    instead of exercising provider selection themselves.
    """
    get_settings.cache_clear()
    llm_client._default_client = None
    yield
    get_settings.cache_clear()
    llm_client._default_client = None


def test_get_llm_client_defaults_to_groq(monkeypatch):
    # Force the provider explicitly rather than relying on env being unset,
    # since a developer's local .env could otherwise set LLM_PROVIDER.
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setattr("groq.Groq", _FakeGroqSdkClient)

    client = llm_client.get_llm_client()

    assert isinstance(client, llm_client.GroqLLMClient)


def test_get_llm_client_selects_gemini_when_configured(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setattr("google.genai.Client", _FakeGeminiSdkClient)

    client = llm_client.get_llm_client()

    assert isinstance(client, llm_client.GeminiLLMClient)


def test_get_llm_client_caches_the_same_instance_across_calls(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setattr("groq.Groq", _FakeGroqSdkClient)

    first = llm_client.get_llm_client()
    second = llm_client.get_llm_client()

    assert first is second
