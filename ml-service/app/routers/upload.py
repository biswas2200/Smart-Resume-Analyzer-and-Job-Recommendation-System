"""Resume file upload -> parsed profile. Kept as its own router, separate
from analyze.py, since file handling (this file) and text-in analysis
(analyze.py) are distinct concerns.
"""

from fastapi import APIRouter, HTTPException, UploadFile

from app.models.schemas import ParseResponse
from app.services.document_extraction.base import UnsupportedDocumentTypeError
from app.services.document_extraction.registry import get_extractor_for_filename
from app.services.parser import parse_resume

router = APIRouter()


@router.post("/parse-file", response_model=ParseResponse)
async def parse_file(file: UploadFile) -> ParseResponse:
    """Extract text from an uploaded resume file (PDF today; see
    document_extraction/registry.py for what's supported) and run it
    through the existing parse_resume() pipeline unchanged.
    """
    try:
        extractor = get_extractor_for_filename(file.filename or "")
    except UnsupportedDocumentTypeError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error

    file_bytes = await file.read()
    resume_text = extractor.extract(file_bytes)
    return ParseResponse(profile=parse_resume(resume_text))
