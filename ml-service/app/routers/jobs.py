"""Job recommendation endpoints (services/job_rank.py). The backend stores
the postings; this service only reads their text and ranks them."""

from fastapi import APIRouter

from app.models.schemas import ExtractJobSkillsRequest, ExtractJobSkillsResponse, RankJobsRequest, RankJobsResponse
from app.services import job_rank
from app.services.fingerprint import engine_fingerprint

router = APIRouter()


@router.post("/extract-job-skills")
def extract_job_skills(request: ExtractJobSkillsRequest) -> ExtractJobSkillsResponse:
    """The canonical skills each job posting asks for -- run once per
    posting when the backend stores it, and kept for every later ranking."""
    return ExtractJobSkillsResponse(
        jobs=job_rank.extract_job_skills(request.jobs), engine_fingerprint=engine_fingerprint()
    )


@router.post("/rank-jobs")
def rank_jobs(request: RankJobsRequest) -> RankJobsResponse:
    """Rank jobs (with their stored skills) against a resume's skills and its
    best-matched roles; every result carries its reasons. Deterministic, no LLM."""
    ranked = job_rank.rank_jobs(request.skills, request.roles, request.jobs, top_n=request.top_n)
    return RankJobsResponse(jobs=ranked, engine_fingerprint=engine_fingerprint())
