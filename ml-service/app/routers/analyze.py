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


@router.post("/parse", response_model=ParseResponse)
def parse(request: ParseRequest) -> ParseResponse:
    profile = parse_resume(request.resume_text)
    return ParseResponse(profile=profile)


@router.post("/match", response_model=MatchResponse)
def match(request: MatchRequest) -> MatchResponse:
    matches = matcher.match_roles(request.skills, top_n=request.top_n)
    return MatchResponse(matches=matches)


@router.post("/ats-score", response_model=AtsScoreResponse)
def score(request: AtsScoreRequest) -> AtsScoreResponse:
    return ats_score.score_resume(request.resume_text, request.target_keywords)


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
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
