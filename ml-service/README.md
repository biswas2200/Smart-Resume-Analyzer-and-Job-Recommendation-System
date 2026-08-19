# ML service

FastAPI service implementing the resume analysis pipeline: parsing,
skill normalization, embedding-based role matching, ATS scoring, gap
analysis, and explanation generation. Design notes and setup instructions
also live in the separate `docs/` project (see the repo root README).

Quick start:

```bash
python -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu  # CPU-only, much smaller than the CUDA default
pip install -r requirements.txt
cp .env.example .env   # fill in GROQ_API_KEY
pytest tests/          # no API key needed, LLM calls are mocked
uvicorn app.main:app --reload
```
