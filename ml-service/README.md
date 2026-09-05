# ML service

FastAPI service implementing the resume analysis pipeline: parsing,
skill normalization, embedding-based role matching, ATS scoring, gap
analysis, and explanation generation. Design notes and setup instructions
also live in the separate `docs/` project (see the repo root README).

Resume parsing runs fully offline by default (a local NER model, no API key
or network call needed) -- see `PARSER_BACKEND` in `.env.example`. Only
explanation generation (`explainer.py`) requires an LLM API key.

Quick start:

```bash
python -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu  # CPU-only, much smaller than the CUDA default
pip install -r requirements.txt
cp .env.example .env   # fill in GROQ_API_KEY (only needed for explanations -- parsing is offline by default)
pytest tests/          # no API key/network needed, LLM calls and the NER model are mocked
uvicorn app.main:app --reload
```
