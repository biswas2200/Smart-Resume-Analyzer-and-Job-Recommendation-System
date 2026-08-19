from fastapi import FastAPI

from app.routers.analyze import router as analyze_router

app = FastAPI(
    title="Intelligent Resume Analyser — ML Service",
    description=(
        "Resume parsing, skill normalization, embedding-based role matching, "
        "ATS scoring, gap analysis, and explanation generation."
    ),
)

app.include_router(analyze_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
