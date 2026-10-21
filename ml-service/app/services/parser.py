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
import logging
import re

from app.config import get_settings
from app.models.schemas import ResumeProfile
from app.services.llm_client import LLMClient, get_llm_client
from app.services.local_ner_parser import parse_resume_local

log = logging.getLogger(__name__)

# Output tokens cost ~8x input tokens, so the prompt asks for exactly what
# is consumed and nothing more: the profile card shows title/organization/
# duration per job (never a description -- ExperienceEntry.description stays
# at its "" default, as it does on the local NER path), and the downstream
# stages (normalizer, matcher) read nothing but `skills`. Measured on
# gemini-2.5-flash, the description field alone was ~20% of the answer.
SYSTEM_PROMPT = (
    "You extract structured data from resume text. Respond with ONLY a JSON "
    "object matching this shape, no prose, no markdown fences:\n"
    "{\n"
    '  "name": string,\n'
    '  "email": string,\n'
    '  "phone": string,\n'
    '  "skills": string[],\n'
    '  "experience": [{"title": string, "organization": string, "duration": string}],\n'
    '  "education": [{"degree": string, "institution": string, "year": string}]\n'
    "}\n"
    "Use empty string/list for anything not present in the resume. Do not "
    "invent information that isn't in the text. Keep it compact: skills are "
    "short canonical names (\"Python\", not \"5 years of Python\"), each "
    "listed once; duration is the date range as written; no other fields."
)

_SPACE_RUN = re.compile(r"[ \t\f\v]+")
_BLANK_RUN = re.compile(r"\n{3,}")


def compact_resume_text(text: str, max_chars: int) -> str:
    """Whitespace-normalise extracted resume text and cap its length before
    it goes into a prompt. PDF/DOCX extraction leaves padded columns and
    runs of blank lines that tokenise to nothing useful; a cap (cut at a
    line boundary) keeps a pathological upload from costing ten resumes'
    worth of input. Pure function -- used by the LLM path only, the local
    NER path reads the original text.
    """
    return _truncate(_compact(text), max_chars)


def _compact(text: str) -> str:
    lines = [_SPACE_RUN.sub(" ", line).strip() for line in text.splitlines()]
    return _BLANK_RUN.sub("\n\n", "\n".join(lines)).strip()


def _truncate(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    cut = text.rfind("\n", 0, max_chars)
    if cut < max_chars // 2:
        cut = max_chars
    return text[:cut].rstrip()


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
    return stripped.strip()


def parse_resume(
    resume_text: str,
    client: LLMClient | None = None,
    backend: str | None = None,
    domain_name: str | None = None,
) -> ResumeProfile:
    """Parse resume_text into a ResumeProfile, routing to the local or LLM
    backend per `backend` (falling back to Settings.parser_backend).
    services/pipeline.py passes backend="llm" explicitly for domains whose
    engine is "llm" (data/domains.json), so a non-engineering Premium
    analysis uses the LLM extractor even though the service-wide default
    stays local. `client` and `domain_name` only matter for the LLM backend:
    the domain is added to the prompt so the model reads the resume with
    the right vocabulary (a nurse's "ACLS" is a skill, not noise).
    """
    resolved_backend = backend or get_settings().parser_backend
    if resolved_backend == "llm":
        return _parse_resume_llm(resume_text, client, domain_name)
    return parse_resume_local(resume_text)


def _parse_resume_llm(
    resume_text: str, client: LLMClient | None = None, domain_name: str | None = None
) -> ResumeProfile:
    """Parse resume_text by asking an LLM to return the ResumeProfile JSON
    directly. Only reached when the resolved backend is "llm".
    """
    settings = get_settings()
    llm = client or get_llm_client()
    system_prompt = SYSTEM_PROMPT
    if domain_name:
        system_prompt += (
            f"\nThe resume belongs to the {domain_name} field: list the skills, "
            "certifications, tools and licences that matter in that field."
        )
    compact = _compact(resume_text)
    prompt_text = _truncate(compact, settings.llm_max_input_chars)
    if len(prompt_text) < len(compact):
        log.warning("resume text cut from %d to %d chars for the extraction prompt",
                    len(compact), len(prompt_text))
    raw_response = llm.complete(
        system_prompt,
        prompt_text,
        purpose="extract",
        json_output=True,
        max_output_tokens=settings.llm_extract_max_output_tokens,
    )
    payload = json.loads(_strip_code_fence(raw_response))
    return ResumeProfile.model_validate(payload)
