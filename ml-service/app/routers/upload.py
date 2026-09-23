"""Resume file upload -> parsed profile / full analysis. Kept as its own
router, separate from analyze.py, since file handling (this file) and
text-in analysis (analyze.py) are distinct concerns -- the two endpoints
below just extract text and then delegate to the exact same pipeline
functions analyze.py's text-based endpoints use.
"""

from fastapi import APIRouter, HTTPException, UploadFile

from app.models.schemas import AnalyzeResponse, ParseResponse
from app.services import ats_score, gap_analysis, matcher
from app.services.document_extraction.base import UnsupportedDocumentTypeError
from app.services.document_extraction.registry import get_extractor_for_filename
from app.services.explainer import explain_results
from app.services.parser import parse_resume

router = APIRouter()


async def _extract_text(file: UploadFile) -> str:
    try:
        extractor = get_extractor_for_filename(file.filename or "")
    except UnsupportedDocumentTypeError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error

    file_bytes = await file.read()
    return extractor.extract(file_bytes)


@router.post("/parse-file", responses={415: {"description": "Unsupported file type"}})
async def parse_file(file: UploadFile) -> ParseResponse:
    """Extract text from an uploaded resume file (PDF today; see
    document_extraction/registry.py for what's supported) and run it
    through the existing parse_resume() pipeline unchanged.
    """
    resume_text = await _extract_text(file)
    return ParseResponse(profile=parse_resume(resume_text))


@router.post("/analyze-file", responses={415: {"description": "Unsupported file type"}})
async def analyze_file(file: UploadFile, top_n: int = 3) -> AnalyzeResponse:
    """File-upload counterpart to POST /analyze: extract text the same way
    parse_file() does, then run the exact same profile/ATS/match/gap/
    explanation pipeline as analyze.py's analyze(), so a caller that only
    has the raw file (e.g. the backend, which never sees resume text) gets
    one round trip instead of extracting text itself.
    """
    resume_text = await _extract_text(file)
    profile = parse_resume(resume_text)
    ats = ats_score.score_resume(resume_text)
    matches = matcher.match_roles(profile.skills, top_n=top_n)
    gaps = gap_analysis.analyze_gaps(matches)
    explanation = explain_results(profile, ats, matches, gaps)

    return AnalyzeResponse(
        profile=profile,
        ats_score=ats,
        matches=matches,
        gaps=gaps,
        explanation=explanation,
    )
