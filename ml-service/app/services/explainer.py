"""LLM-scoped task: turn already-computed scores/matches into a readable
explanation. Coaching framing only — this never rewrites resume content,
matching the plan's positioning against AI-resume distrust.
"""

from app.models.schemas import AtsScoreResponse, GapAnalysis, ResumeProfile, RoleMatch
from app.services.llm_client import LLMClient, get_llm_client

SYSTEM_PROMPT = (
    "You are a career coach explaining resume analysis results to a "
    "candidate. You are given pre-computed scores, role matches, and skill "
    "gaps -- do not recompute or second-guess them, and do not rewrite any "
    "resume content. Write 2-4 short paragraphs: (1) what the ATS score "
    "means and the single biggest thing to fix about it, (2) the top "
    "matched role and why it fits, (3) the most impactful skill gaps to "
    "close next. Be specific, encouraging, and concise. Plain text only."
)


def _build_user_prompt(
    profile: ResumeProfile,
    ats_score: AtsScoreResponse,
    matches: list[RoleMatch],
    gaps: list[GapAnalysis],
) -> str:
    lines = [
        f"Candidate: {profile.name or 'Unknown'}",
        f"ATS score: {ats_score.score}/{ats_score.max_score}",
        "Failed ATS checks: "
        + (", ".join(c.name for c in ats_score.checks if not c.passed) or "none"),
        "",
        "Top role matches:",
    ]
    for m in matches:
        lines.append(
            f"- {m.role} (score {m.score}): matched {m.matched_skills}, "
            f"missing {m.missing_skills}"
        )
    lines.append("")
    lines.append("Skill gaps:")
    for g in gaps:
        lines.append(f"- {g.role}: missing {g.missing_skills}")
    return "\n".join(lines)


def explain_results(
    profile: ResumeProfile,
    ats_score: AtsScoreResponse,
    matches: list[RoleMatch],
    gaps: list[GapAnalysis],
    client: LLMClient | None = None,
) -> str:
    llm = client or get_llm_client()
    user_prompt = _build_user_prompt(profile, ats_score, matches, gaps)
    return llm.complete(SYSTEM_PROMPT, user_prompt).strip()
