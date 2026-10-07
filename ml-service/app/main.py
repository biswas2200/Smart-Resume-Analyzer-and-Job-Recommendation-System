from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.models.schemas import HealthResponse
from app.routers.analyze import router as analyze_router
from app.routers.llm_usage import router as llm_usage_router
from app.routers.upload import router as upload_router
from app.services.fingerprint import engine_fingerprint
from app.services.llm_client import LLMUnavailableError

app = FastAPI(
    title="Intelligent Resume Analyser — ML Service",
    description=(
        "Resume parsing, skill normalization, embedding-based role matching, "
        "ATS scoring, gap analysis, and explanation generation."
    ),
)

app.include_router(analyze_router)
app.include_router(upload_router)
app.include_router(llm_usage_router)


@app.exception_handler(LLMUnavailableError)
def llm_unavailable(_: Request, exc: LLMUnavailableError) -> JSONResponse:
    """Only the Premium extraction path can surface this (the explainer
    falls back to the template on its own): a 503 with the reason, so the
    backend can tell the user "try again later" rather than a generic 502.
    """
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/health")
def health() -> HealthResponse:
    """Liveness probe that also reports engine_fingerprint (FR-11.2) -- the
    value a Community user compares against a web deployment's to prove
    they're running the same core engine.
    """
    return HealthResponse(status="ok", engine_fingerprint=engine_fingerprint())
