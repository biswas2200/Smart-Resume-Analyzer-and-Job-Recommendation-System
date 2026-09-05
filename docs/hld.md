# High-Level Design (HLD)

Companion to [System Architecture](architecture.md). Where that document explains *why* the system is shaped this way, this one specifies each layer's responsibility, its interfaces to neighboring layers, and the key design decisions locked in at this level. Grounded in SRS §6 ("System Architecture Overview") and the SRS's layer-responsibility table.

## 1. Layers and responsibilities

| Layer | Responsibility | Status |
|---|---|---|
| **Client** (React/Angular SPA) | Resume upload, dashboard rendering (profile, matches, gaps, ATS score), JD-match screen, feedback controls. No business logic — pure presentation + API calls. | Planned |
| **Spring Boot Backend** | Authentication (JWT), request orchestration, REST API surface exposed to the client, persistence coordination, the temporal EMA skill-vector update loop. | Planned |
| **PostgreSQL** | Durable storage: users, resumes (versioned), parsed profiles, roles, the versioned skill-vector store, recommendations, feedback. | Planned |
| **Python ML Service** | PDF text extraction (column-aware), embedding generation, skill normalization, cosine-similarity role matching, deterministic ATS scoring, gap analysis, structured-field extraction (local NER model by default), and one narrowly-scoped LLM call (explanation, always; extraction, only if opted into). | **Implemented** (`ml-service/`) |
| **LLM API (Groq or Gemini)** | External inference provider, selectable via `LLM_PROVIDER`. Used unconditionally for natural-language explanation generation, and optionally for resume-text extraction (`PARSER_BACKEND=llm`) — never for scoring or ranking. | Implemented (integration point) |

## 2. Component responsibilities (ML Service — implemented today)

This is the layer with real code, so its responsibilities map 1:1 to modules in `ml-service/app/`:

| Module | Responsibility | LLM? |
|---|---|---|
| `routers/analyze.py` | HTTP surface: `POST /parse`, `/match`, `/ats-score`, `/analyze`. Thin — delegates immediately to services. | No |
| `routers/upload.py` | HTTP surface: `POST /parse-file`. Dispatches to a `DocumentTextExtractor` by file extension, then calls `parser.parse_resume()` unchanged. | No |
| `services/document_extraction/` | `DocumentTextExtractor` Protocol (`base.py`) + `PdfTextExtractor` (`pdf_extractor.py`, via `pdfplumber`) + `registry.py` (extension → extractor). Reorders a PDF's words into column-aware reading order before returning text, so a multi-column resume's sections aren't interleaved. Adding a new format (DOCX, etc.) is one new class + one registry entry. | No |
| `services/parser.py` | Resume text → `ResumeProfile`. Routes to the local NER backend (default) or the LLM backend (`PARSER_BACKEND=llm`), per `Settings.parser_backend`. | **Opt-in** |
| `services/local_ner_parser.py` | Default parsing backend: runs `yashpwr/resume-ner-bert-v2` (via `transformers`) fully offline, chunks long resumes (512-token model limit), clusters flat NER entity spans into `ExperienceEntry`/`EducationEntry` records, regex email/phone/date extraction. No API key, no network call. | No |
| `services/normalizer.py` | Raw skill string → canonical taxonomy entry, via a variant→canonical lookup built from `data/skill_taxonomy.json`. Unknown skills pass through unchanged (title case preserved) rather than being dropped. | No |
| `services/embeddings.py` | Thin wrapper over `sentence-transformers` (`all-MiniLM-L6-v2`, lazily loaded and cached via `lru_cache`). Provides `embed()` and `cosine_similarity()`. | No (local model, not an LLM) |
| `services/matcher.py` | Embeds the candidate's normalized skill set and each curated role's skill set (`data/role_skills.json`), ranks roles by cosine similarity, partitions each role's skills into matched/missing. | No |
| `services/ats_score.py` | Rule-based ATS compatibility score: contact info regex checks, required section headers, minimum word count, optional keyword coverage against target keywords. Every point is traceable to one named `AtsCheck`. | No |
| `services/gap_analysis.py` | Derives `GapAnalysis` rows directly from the matcher's `missing_skills` — no independent computation. | No |
| `services/explainer.py` | Turns the four computed outputs (profile, ATS score, matches, gaps) into 2–4 coaching paragraphs. System prompt explicitly forbids recomputing/second-guessing the scores or rewriting resume content. | **Yes** |
| `services/llm_client.py` | `LLMClient` Protocol + `GroqLLMClient`/`GeminiLLMClient` implementations, selected by `Settings.llm_provider`. Both `parser.py` (opt-in path) and `explainer.py` depend on the Protocol, not a concrete SDK — this is what makes them unit-testable with a `FakeLLMClient` and no network access (see `tests/test_pipeline.py`, `tests/test_llm_client.py`). | — (abstraction) |
| `config.py` | `pydantic-settings`-based config: `PARSER_BACKEND`, `NER_MODEL_NAME`, `LLM_PROVIDER`, `GROQ_API_KEY`/`GROQ_MODEL`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `EMBEDDING_MODEL`, loaded from `.env`. | — |

## 3. Key design decisions

### 3.1 Deterministic core, narrow LLM footprint
Every score or ranking the user sees is computed by plain code. Structured-field extraction from resume text runs on a local model by default — no LLM at all. The LLM's only unconditional job is turning structured results into prose; it remains available as an opt-in alternative for extraction. This directly implements SRS §2.5's constraint ("core matching and scoring logic must be deterministic and explainable") and is the system's answer to the comparable-systems gap cited in SRS §1.4 (static, unreproducible LLM-only matching) — and goes further than originally scoped, since even extraction no longer requires an LLM by default.

### 3.2 LLM access behind a Protocol, not a concrete SDK
`LLMClient` is a `typing.Protocol` with one method, `complete(system_prompt, user_prompt) -> str`. `explainer.py` (always) and `parser.py` (only when `PARSER_BACKEND=llm`) take an optional `client` parameter that defaults to `get_llm_client()` (a cached singleton, built as `GroqLLMClient` or `GeminiLLMClient` per `Settings.llm_provider`). This means: (a) the provider can be swapped without touching business logic, and (b) the full test suite runs with zero network access and no API key, using a `FakeLLMClient`.

### 3.2b Local resume parsing behind the same kind of seam
`parser.parse_resume()` routes to `local_ner_parser.parse_resume_local()` (default) or the LLM path (`PARSER_BACKEND=llm`), mirroring 3.2's provider-behind-an-abstraction shape one level up: the *backend* for an entire capability (parsing), not just the LLM SDK within it, is swappable via config. `local_ner_parser.py` itself splits further into an impure layer (the real `transformers` NER pipeline, lazily built) and a pure layer (`_entities_to_profile`, the entity-clustering/assembly logic), so the clustering heuristics are unit-testable with hand-built entity lists and no model download (see `tests/test_local_ner_parser.py`).

### 3.2c File-format extraction behind an adapter interface
`DocumentTextExtractor` (`document_extraction/base.py`) is a `Protocol` with one method, `extract(file_bytes) -> str`, implemented today by `PdfTextExtractor` and dispatched by file extension via `registry.py`. This is the same Open/Closed shape as 3.2/3.2b, applied to input file formats: adding DOCX support later is one new class implementing the Protocol plus one registry entry, never a change to `routers/upload.py` or the parsing pipeline downstream of it. Codified as a standing rule in the repo's `CLAUDE.md` ("Design principles"), not just followed once here.

### 3.3 Two-stage skill matching: normalize, then embed
Rather than embedding raw free-text skills directly, skills are first normalized against a canonical taxonomy (`skill_taxonomy.json`, currently ~variant-to-canonical mappings for common tech skills) and *then* embedded. This means "ReactJS", "React.js", and "reactjs" collapse to one canonical "React" before similarity is computed, and matched/missing-skill lists are computed as exact-string set operations against the canonical form — not fuzzy embedding distance — so the "why" behind a match is a literal list, not a black box.

### 3.4 Role vectors as the mean of per-skill embeddings
`matcher.py` represents both a candidate and a role as the mean of the embedding vectors of their (normalized) skill lists, then ranks by cosine similarity between the two mean vectors. This is a simple, explainable content-based filtering approach — see [LLD](lld.md) §Matching algorithm for the exact computation and its complexity.

### 3.5 Backend as orchestrator, not a second scoring engine
The planned Spring Boot backend does not re-implement matching or scoring. Its job is auth, persistence, and calling the ML service — keeping the deterministic logic in exactly one place (NFR-5.1: "deterministic matching/scoring logic and the LLM-invocation logic shall be implemented as separable modules to allow independent testing").

### 3.6 Temporal skill-vector store (planned)
Static cosine-similarity matching — the exact limitation the SRS calls out in comparable systems (§1.4) — is addressed by versioning each role's skill-weight vector and updating it with an exponential moving average (`new_weight = α × new_signal + (1 − α) × old_weight`) whenever new job-market data or "helpful/not helpful" user feedback arrives. Prior versions are retained for auditability. See [Database Schema](database-schema.md) for the table design and [Process Flow](process-flow.md) for the update sequence.

### 3.7 Graceful LLM degradation
NFR-3.1: with the default configuration, an LLM outage doesn't affect parsing at all — `/parse`, `/parse-file`, `/match`, and `/ats-score` never call the LLM, so only `explainer.py`'s output is at risk. `/analyze` can be adapted to catch an `explainer` failure and return the rest of the payload with `explanation` empty. (If `PARSER_BACKEND=llm` is explicitly opted into, parsing itself becomes dependent on the LLM again — a deliberate tradeoff for whoever needs that path's extra accuracy on some fields.)

## 4. Interfaces between layers

| From → To | Protocol | Payload | Auth |
|---|---|---|---|
| Client → Backend | HTTPS / REST | JSON | JWT bearer token |
| Backend → ML Service | HTTP / REST (internal network) | JSON | none (internal, planned) |
| Backend → PostgreSQL | JDBC | SQL | DB credentials (env/secrets) |
| ML Service → PostgreSQL | Python DB driver (planned, once ML service reads taxonomy/roles from DB instead of JSON files) | SQL | DB credentials (env/secrets) |
| ML Service → LLM API (Groq or Gemini) | HTTPS / REST | JSON (chat completion) | API key (env var, never committed) |

## 5. Non-functional design targets

Carried straight from SRS §5 into the design so they stay traceable:

- **Performance:** resume parsing ≤ 15s for a file up to 5 MB (NFR-1.1); recommendation computation over ≤ 100 roles ≤ 2s (NFR-1.2).
- **Security:** JWT sessions ≤ 24h (NFR-2.1); passwords salted+hashed, e.g. bcrypt (NFR-2.2); HTTPS/TLS everywhere (NFR-2.3); secrets via env vars only (NFR-2.4) — already followed in `ml-service/.env.example`.
- **Scalability:** backend stateless where feasible (NFR-4.1).
- **Maintainability:** deterministic logic and LLM-invocation logic in separable, independently testable modules (NFR-5.1) — already true of `ml-service/app/services/*`.
- **Usability:** first upload-to-recommendation view in ≤ 3 user actions (NFR-6.1).
- **Privacy:** resumes contain PII; not used to train third-party models beyond the scoped API calls; users can request deletion (NFR-7.1, NFR-7.2).

## Related documents

- [System Architecture](architecture.md)
- [Low-Level Design](lld.md)
- [Abstraction Overview](abstraction-overview.md)
- [Tech Stack](tech-stack.md)
