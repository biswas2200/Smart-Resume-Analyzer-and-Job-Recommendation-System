# Tech Stack

Per-layer breakdown, built vs. planned. Source: repo root `README.md` and SRS Table 3 (§4.3).

| Layer | Stack | Status |
|---|---|---|
| **Frontend** | Angular 22 (standalone components, TypeScript), Vitest for unit tests | **Implemented** — `frontend/` |
| **Backend** | Java 21, Spring Boot 3.x, Spring Security (JWT), PostgreSQL 15+ | Planned |
| **ML service** | Python 3.12, FastAPI, `sentence-transformers` (`all-MiniLM-L6-v2`), local NER (`yashpwr/resume-ner-bert-v2`), Groq API (`llama-3.3-70b-versatile`) / Gemini API (`gemini-2.5-flash-lite`) | **Implemented** — `ml-service/` |
| **Database** | PostgreSQL 15+ | Planned |
| **Object storage** | MinIO (S3-compatible) for uploaded resume files — `resume.ResumeStorageService`; no separate NoSQL store, see [LLD §7.3](lld.md) | **Implemented** — `backend/` |
| **Resume parsing backend** | Local NER model (`yashpwr/resume-ner-bert-v2`, fully offline, no API key) — default; LLM (Groq/Gemini) — opt-in, selectable via `PARSER_BACKEND` | **Implemented** — both backends, `parser.py` / `local_ner_parser.py` |
| **Resume file upload** | `pdfplumber` (PDF text + word-position extraction, column-aware reordering); format dispatch via a `DocumentTextExtractor` adapter interface (`document_extraction/`) — PDF only today, DOCX planned | **Implemented** — `POST /parse-file`, `document_extraction/` |
| **LLM provider** | Groq API (chat completions, also hosts Gemma models under the same API) and Gemini API (Google's own hosted API), selectable via `LLM_PROVIDER`. Used for explanation generation always, and for parsing only when `PARSER_BACKEND=llm` | **Implemented** — both providers, `llm_client.py` |
| **Deployment (demo)** | Docker containers; GCP free-tier credits | Planned |
| **Docs** | MkDocs + Material, static HTML, hosted separately from the code repo | This folder |

## ML service dependencies (implemented, `ml-service/requirements.txt`)

| Package | Version constraint | Purpose |
|---|---|---|
| `fastapi` | `>=0.115,<1.0` | HTTP framework / router |
| `uvicorn[standard]` | `>=0.30,<1.0` | ASGI server |
| `pydantic` | `>=2.7,<3.0` | Request/response schemas |
| `pydantic-settings` | `>=2.3,<3.0` | `.env`-backed configuration |
| `sentence-transformers` | `>=3.0,<4.0` | Embedding model (`all-MiniLM-L6-v2`) |
| `transformers` | `>=4.40,<5.0` | Local resume-NER model (`yashpwr/resume-ner-bert-v2`), default parsing backend |
| `pdfplumber` | `>=0.11,<1.0` | PDF text + word-position extraction for `POST /parse-file` |
| `python-multipart` | `>=0.0.9,<1.0` | Required by FastAPI/Starlette to parse `UploadFile`/multipart form data |
| `numpy` | `>=1.26,<2.0` | Vector math (cosine similarity) |
| `groq` | `>=0.9,<1.0` | Groq LLM API client |
| `google-genai` | `>=1.0,<2.0` | Gemini LLM API client (alternate provider, `LLM_PROVIDER=gemini`) |
| `python-dotenv` | `>=1.0,<2.0` | `.env` loading |
| `pytest` | `>=8.2,<9.0` | Test runner |
| `httpx` | `>=0.27,<1.0` | Test client / async HTTP |

`sentence-transformers` pulls in `torch`; the project README recommends installing the CPU-only wheel first (`pip install torch --index-url https://download.pytorch.org/whl/cpu`) since the project has no CUDA/GPU requirement.

## Build order (from repo root README)

1. **ML pipeline** (current focus) — deterministic scoring/matching + narrow LLM tasks, validated standalone before anything depends on it.
2. **Backend** — wraps the ML service, adds persistence and the temporal EMA-weighted recommendation loop.
3. **Frontend** — consumes the backend API.

## Related documents

- [System Architecture](architecture.md)
- [High-Level Design](hld.md)
