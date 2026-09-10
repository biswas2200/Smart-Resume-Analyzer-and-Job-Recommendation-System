"""Text-in analysis endpoints: the caller already has resume text (not a raw
file), so each endpoint here skips straight to its pipeline stage. Kept as
its own router, separate from upload.py, since file handling (upload.py) and
text-in analysis (this file) are distinct concerns -- upload.py's endpoints
just extract text and then delegate to the exact same pipeline functions
used below.
"""

from fastapi import APIRouter

from app.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    AtsScoreRequest,
    AtsScoreResponse,
    MatchRequest,
    MatchResponse,
    ParseRequest,
    ParseResponse,
)
from app.services import ats_score, gap_analysis, matcher
from app.services.explainer import explain_results
from app.services.parser import parse_resume

router = APIRouter()


@router.post("/parse")
def parse(request: ParseRequest) -> ParseResponse:
    """Extract a structured profile from raw resume text via the configured
    parsing backend (local NER by default, LLM if PARSER_BACKEND=llm)."""
    profile = parse_resume(request.resume_text)
    return ParseResponse(profile=profile)


@router.post("/match")
def match(request: MatchRequest) -> MatchResponse:
    """Rank roles against an already-known skill list by embedding cosine
    similarity (see matcher.py) -- for a caller that has skills but not raw
    resume text, e.g. a profile-edit flow."""
    matches = matcher.match_roles(request.skills, top_n=request.top_n)
    return MatchResponse(matches=matches)


@router.post("/ats-score")
def score(request: AtsScoreRequest) -> AtsScoreResponse:
    """Deterministic ATS compatibility score for raw resume text (see
    ats_score.py) -- no parsing or matching, just the rule-based checks."""
    return ats_score.score_resume(request.resume_text, request.target_keywords)


@router.post("/analyze")
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    """Full pipeline in one call: parse, ATS-score, match roles, find skill
    gaps, and generate an explanation -- the text-in counterpart to
    upload.py's analyze_file(), for a caller that already has resume text."""
    profile = parse_resume(request.resume_text)
    ats = ats_score.score_resume(request.resume_text)
    matches = matcher.match_roles(profile.skills, top_n=request.top_n)
    gaps = gap_analysis.analyze_gaps(matches)
    explanation = explain_results(profile, ats, matches, gaps)

    return AnalyzeResponse(
        profile=profile,
        ats_score=ats,
        matches=matches,
        gaps=gaps,
        explanation=explanation,
    )
