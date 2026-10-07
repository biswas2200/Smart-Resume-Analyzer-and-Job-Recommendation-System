# Tech stack

Each layer's stack and whether it is built or planned. Sources: the repo root `README.md`, [SRS v2.0 §2.4](srs.md#24-operating-environment), the service manifests (`backend/pom.xml`, `ml-service/requirements.txt`) and, since the frontend has no dependency manifest, its Bootstrap `<link>` tags (`frontend/src/*.html`).

| Layer | Stack | Status |
|---|---|---|
| Frontend | HTML5, Bootstrap 5.3, vanilla JavaScript (ES modules, no build step); tests via `node --test`; static files served by nginx | Implemented (`frontend/`) |
| Backend | Java 21, Spring Boot 3.3, Spring Security (JWT, method security), Spring Data JPA, Flyway, springdoc-openapi | Implemented (`backend/`) |
| Database | PostgreSQL 15 (Docker Compose locally), schema managed by Flyway (`V1__init_schema.sql`), `ddl-auto: validate` | Implemented |
| Object storage | MinIO (S3-compatible) for uploaded resume files (`resume.ResumeStorageService`); no separate NoSQL store (see [LLD §7.3](lld.md)) | Implemented |
| ML service / core engine | Python 3.12, FastAPI, `sentence-transformers` (`all-MiniLM-L6-v2`), `transformers` (local NER `yashpwr/resume-ner-bert`, pinned commit), `pdfplumber` | Implemented (`ml-service/`) |
| Inference runtime | PyTorch CPU today; ONNX Runtime (CPU) with pinned, hashed model exports planned for the core engine | Planned (step 1) |
| Resume parsing backend | Local NER model (offline, no API key) by default; LLM (Groq/Gemini) opt-in via `PARSER_BACKEND` | Implemented |
| Section segmentation + dictionary skills | Heading regex sectioner; Aho-Corasick (`pyahocorasick`) or spaCy `PhraseMatcher` over the taxonomy | Planned (step 2) |
| Precomputed vectors | `scripts/precompute_vectors.py` → `app/data/skill_vectors.npy`, `role_vectors.npy`, `vectors.sha256` | Planned (step 2) |
| Explanation | Template (deterministic, default), implemented. LLM narrative via Gemini on Vertex AI (`gemini-2.5-flash-lite` by default, Application Default Credentials, no API key; thinking off, JSON mode, per-call usage ledger), implemented, Premium only. Groq optional via `LLM_PROVIDER=groq` | Implemented |
| Domain detection + tiers | `domain_classifier.py` (dictionary + MiniLM, deterministic) over `domains.json`; engineering → local/free, other domains → Gemini/premium | Implemented |
| Cloud tiers | Cloud Web Free, Cloud Web Premium (hosted on GCP). The offline Community Edition is archived in [`docs/archive/community-edition.md`](archive/community-edition.md) | Implemented MVP |
| Packaging and hosting | Docker Compose on a GCP Compute Engine VM (Option A) funded by the $300 credit; Cloud Run serverless option (planned hybrid) | Compose implemented; GCP planned |
| Model training | Cloud-based training on a GCP GPU instance / Vertex AI Workbench; HF `Trainer` (NER distillation), `SentenceTransformerTrainer` (embedder) | Planned (step 7), `ml-service/training/` |
| CI | Golden parity suite run against the deployed engine API; `scripts/bench.py` for latency/RSS | Planned (step 6) |
| Docs | MkDocs + Material, content under `docs/`, config `mkdocs.yml` at the repo root | This folder |

## ML service runtime dependencies (`ml-service/requirements.txt`)

| Package | Constraint | Purpose |
|---|---|---|
| `fastapi` | `>=0.115,<1.0` | HTTP framework / router |
| `uvicorn[standard]` | `>=0.30,<1.0` | ASGI server |
| `pydantic` | `>=2.7,<3.0` | Request/response schemas |
| `pydantic-settings` | `>=2.3,<3.0` | `.env`-backed configuration |
| `sentence-transformers` | `>=3.0,<4.0` | Embedding model (runtime today; build-time only once vectors are precomputed) |
| `transformers` | `>=4.40,<5.0` | Local resume-NER model, default parsing backend |
| `pdfplumber` | `>=0.11,<1.0` | PDF text + word-position extraction |
| `python-multipart` | `>=0.0.9,<1.0` | Multipart upload parsing |
| `numpy` | `>=1.26,<2.0` | Vector math |
| `google-genai` | `>=1.0,<2.0` | Gemini on Vertex AI, authenticated with ADC (default provider, Premium paths only) |
| `groq` | `>=0.9,<1.0` | Groq LLM client (optional alternative provider) |
| `python-docx` | `>=1.1,<2.0` | DOCX text extraction |
| `python-dotenv` | `>=1.0,<2.0` | `.env` loading |
| `pytest`, `httpx` | (none) | Tests |

Planned additions for steps 1 and 2: `onnxruntime`, `optimum[onnxruntime]` (export), `pyahocorasick`. The planned training-only set (`requirements-train.txt`, never in the runtime image) is `torch` (GPU build), `datasets`, `accelerate`, `evaluate` and `seqeval`.

`sentence-transformers` pulls in `torch`; install the CPU-only wheel first (`pip install torch --index-url https://download.pytorch.org/whl/cpu`). The Community image will use `onnxruntime` instead, cutting the image from ≈ 1.5 GB to ≈ 0.7 GB.

## Model artifacts

| Artifact | Size | Notes |
|---|---|---|
| `yashpwr/resume-ner-bert` (BERT-base, 25 BIO labels; 49 % token F1 on the 220 annotated DataTurks resumes; with the parser's fallbacks, 60 % field macro F1 on the held-out half and 64 % on 20 unseen LiveCareer resumes; see `supporting-docs/ml-pipeline.md`, section "NER model baseline") | 431 MB fp32 / 108 MB int8 | Pinned to commit `3ea6ecf`; distillation target ≈ 130 MB (step 7) |
| `all-MiniLM-L6-v2` (22.7M params, 384-dim) | ≈ 90 MB | Used at build time to precompute vectors; at runtime only for out-of-taxonomy skills |
| `skill_vectors.npy`, `role_vectors.npy` | < 1 MB | Shipped constants; part of the engine fingerprint |
| `skill_taxonomy.json`, `role_skills.json`, `weights_snapshot.json` | < 1 MB | Part of the engine fingerprint |

## Build order

1. ML pipeline: deterministic scoring/matching and narrow LLM tasks, validated standalone. Done.
2. Backend: wraps the ML service and adds persistence and the EMA recommendation loop. Done.
3. Frontend: consumes the backend API. Done.
4. Core-engine parity and Community Edition: steps 1 to 6 in [Editions & Parity §7](editions-and-parity.md#7-implementation-order). Next.
5. Training pipeline: step 7.

## Related documents

- [System Architecture](architecture.md)
- [High-Level Design](hld.md)
- [Editions & Parity](editions-and-parity.md)
