from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables / a
    local .env file. Every field has a safe default so the service can
    start (and its tests can run) with no .env file present at all.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Which LLM provider llm_client.get_llm_client() should build: "groq"
    # (default) or "gemini". Kept as a plain string rather than an enum so a
    # new provider only needs a new branch in get_llm_client(), not a schema
    # change here.
    llm_provider: str = "groq"

    # Which backend parser.parse_resume() should use: "local" (default --
    # runs a resume-NER model fully offline, no API key or network needed)
    # or "llm" (routes through llm_provider; opt-in, since it costs money
    # and needs an API key + outbound network access).
    parser_backend: str = "local"
    # Hugging Face model id for the local NER parsing path. Kept as a plain
    # string (like groq_model/gemini_model below) so swapping in a
    # fine-tuned variant never requires a code change.
    ner_model_name: str = "yashpwr/resume-ner-bert-v2"

    groq_api_key: str = ""
    # Model id string passed straight through to the Groq API. Groq hosts
    # several open-weight model families (Llama, Gemma, ...) under one API,
    # so switching between them is just changing this value -- it never
    # requires a code change in GroqLLMClient.
    groq_model: str = "llama-3.3-70b-versatile"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"

    embedding_model: str = "all-MiniLM-L6-v2"


@lru_cache
def get_settings() -> Settings:
    return Settings()
