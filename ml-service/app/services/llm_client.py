"""Thin, swappable interface over whichever LLM provider is configured.
parser.py and explainer.py depend on the LLMClient Protocol below rather
than any specific SDK directly, so tests can inject a mock and run with no
network access or API key, and so adding a new provider never requires
touching the two files that actually use one.
"""

from typing import Protocol

from app.config import get_settings


class LLMClient(Protocol):
    """Anything that can turn a (system prompt, user prompt) pair into a
    single text completion. The narrow shape lets parser.py/explainer.py
    stay provider-agnostic and lets tests supply a fake implementation.
    """

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Return the model's text completion for the given prompts."""
        ...


class GroqLLMClient:
    """LLMClient backed by the Groq API. Groq hosts several open-weight
    model families (Llama, Gemma, ...) behind one API, so which family is
    actually used is controlled entirely by Settings.groq_model -- this
    class never needs to change to swap models.
    """

    def __init__(self) -> None:
        # Imported lazily so the `groq` package only needs to be installed
        # (and importable) when this provider is actually selected.
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


class GeminiLLMClient:
    """LLMClient backed by Google's Gemini API, via the google-genai SDK.
    Kept as a fully separate class from GroqLLMClient (rather than a shared
    base) because the two SDKs have unrelated request/response shapes --
    the only thing they share is the LLMClient Protocol.
    """

    def __init__(self) -> None:
        # Imported lazily so google-genai only needs to be installed when
        # this provider is actually selected, matching the Groq client's
        # lazy-import pattern above.
        from google import genai

        settings = get_settings()
        self._client = genai.Client(api_key=settings.gemini_api_key)
        self._model = settings.gemini_model

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents=user_prompt,
            config={"system_instruction": system_prompt},
        )
        return response.text or ""


_default_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """Return the process-wide LLMClient singleton, building it from the
    configured provider (Settings.llm_provider) on first use. Cached so
    each provider's SDK client (and any connection it holds) is created
    once per process, not once per request.
    """
    global _default_client
    if _default_client is None:
        settings = get_settings()
        if settings.llm_provider == "gemini":
            _default_client = GeminiLLMClient()
        else:
            _default_client = GroqLLMClient()
    return _default_client
