from pydantic import BaseModel, Field


class ExperienceEntry(BaseModel):
    title: str
    organization: str = ""
    duration: str = ""
    description: str = ""


class EducationEntry(BaseModel):
    degree: str
    institution: str = ""
    year: str = ""


class ResumeProfile(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)


class ParseRequest(BaseModel):
    resume_text: str


class ParseResponse(BaseModel):
    profile: ResumeProfile


class MatchRequest(BaseModel):
    skills: list[str]
    top_n: int = 5


class RoleMatch(BaseModel):
    role: str
    score: float
    matched_skills: list[str]
    missing_skills: list[str]


class MatchResponse(BaseModel):
    matches: list[RoleMatch]


class AtsCheck(BaseModel):
    name: str
    passed: bool
    detail: str


class AtsScoreRequest(BaseModel):
    resume_text: str
    target_keywords: list[str] = Field(default_factory=list)


class AtsScoreResponse(BaseModel):
    score: float
    max_score: float
    checks: list[AtsCheck]


class GapAnalysis(BaseModel):
    role: str
    missing_skills: list[str]


class AnalyzeRequest(BaseModel):
    resume_text: str
    top_n: int = 3


class AnalyzeResponse(BaseModel):
    profile: ResumeProfile
    ats_score: AtsScoreResponse
    matches: list[RoleMatch]
    gaps: list[GapAnalysis]
    explanation: str
