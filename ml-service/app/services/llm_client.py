"""Thin, swappable interface over the Groq client. parser.py and
explainer.py depend on this Protocol rather than the groq SDK directly, so
tests can inject a mock and run with no network access or API key.
"""

from typing import Protocol

from app.config import get_settings


class LLMClient(Protocol):
    def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Return the model's text completion for the given prompts."""
        ...


class GroqLLMClient:
    def __init__(self) -> None:
        from groq import Groq

        settings = get_settings()
        self._client = Groq(api_key=settings.groq_api_key)
        self._model = settings.groq_model

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""


_default_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    global _default_client
    if _default_client is None:
        _default_client = GroqLLMClient()
    return _default_client
