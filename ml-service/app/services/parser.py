"""Resume text -> structured JSON. Extraction only, no reasoning about fit
or quality — that happens in the deterministic stages downstream
(normalizer, matcher, ats_score, gap_analysis).

Two backends are available, selected by Settings.parser_backend:
"local" (default) runs a resume-NER model fully offline, no API key or
network call needed (see local_ner_parser.py); "llm" sends the resume text
to whichever provider llm_provider selects (Groq/Gemini) and asks it to
return the JSON directly. The LLM backend is opt-in since it costs money and
depends on outbound network access; it's kept for cases the local model
handles poorly (e.g. needing the free-text job description field, which the
local backend never fills in).
"""

import json

from app.config import get_settings
from app.models.schemas import ResumeProfile
from app.services.llm_client import LLMClient, get_llm_client
from app.services.local_ner_parser import parse_resume_local

SYSTEM_PROMPT = (
    "You extract structured data from resume text. Respond with ONLY a JSON "
    "object matching this shape, no prose, no markdown fences:\n"
    "{\n"
    '  "name": string,\n'
    '  "email": string,\n'
    '  "phone": string,\n'
    '  "skills": string[],\n'
    '  "experience": [{"title": string, "organization": string, '
    '"duration": string, "description": string}],\n'
    '  "education": [{"degree": string, "institution": string, "year": string}]\n'
    "}\n"
    "Use empty string/list for anything not present in the resume. Do not "
    "invent information that isn't in the text."
)


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
    return stripped.strip()


def parse_resume(resume_text: str, client: LLMClient | None = None) -> ResumeProfile:
    """Parse resume_text into a ResumeProfile, routing to the local or LLM
    backend per Settings.parser_backend. `client` is only meaningful for the
    LLM backend (it's ignored when the local backend is selected).
    """
    if get_settings().parser_backend == "llm":
        return _parse_resume_llm(resume_text, client)
    return parse_resume_local(resume_text)


def _parse_resume_llm(resume_text: str, client: LLMClient | None = None) -> ResumeProfile:
    """Parse resume_text by asking an LLM to return the ResumeProfile JSON
    directly. Only reached when Settings.parser_backend == "llm".
    """
    llm = client or get_llm_client()
    raw_response = llm.complete(SYSTEM_PROMPT, resume_text)
    payload = json.loads(_strip_code_fence(raw_response))
    return ResumeProfile.model_validate(payload)
