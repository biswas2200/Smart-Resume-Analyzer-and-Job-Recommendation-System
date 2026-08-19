"""LLM-scoped task: resume text -> structured JSON. Extraction only, no
reasoning about fit or quality — that happens in the deterministic stages
downstream (normalizer, matcher, ats_score, gap_analysis).
"""

import json

from app.models.schemas import ResumeProfile
from app.services.llm_client import LLMClient, get_llm_client

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
    llm = client or get_llm_client()
    raw_response = llm.complete(SYSTEM_PROMPT, resume_text)
    payload = json.loads(_strip_code_fence(raw_response))
    return ResumeProfile.model_validate(payload)
