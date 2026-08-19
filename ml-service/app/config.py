from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    embedding_model: str = "all-MiniLM-L6-v2"


@lru_cache
def get_settings() -> Settings:
    return Settings()
