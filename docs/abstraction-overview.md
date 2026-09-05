# Abstraction Overview

This document sits above [Architecture](architecture.md) and [HLD](hld.md): instead of describing components, it describes the *abstractions* the system is built from — the boundaries that make it possible to reason about, test, and extend each piece in isolation. Understanding these abstractions is the fastest way to understand why the codebase is organized the way it is.

## 1. The market gap this project targets

Per the SRS (§1.4, §2.1), this project exists because of a specific, named gap in comparable systems:

- **Recruiter-facing AI screening platforms** (HireVue, Eightfold AI, iCIMS) solve a different problem for a different user — employers screening candidates at scale, not a candidate improving their own materials.
- **Academic "resume analyser" projects** typically wrap a single chat-style LLM prompt around the entire task. The result: one pass, no reproducibility (ask twice, get two different scores), no explainability (there's no way to point at *why* a number is what it is), and no mechanism to improve as the job market changes — a limitation explicitly documented in "An AI-Driven Resume Analyser with Job Recommender and Portfolio Code Generator" (IJRASET, April 2026), cited in the SRS as the direct point of comparison.

This system's answer is two abstractions, described below: a **deterministic core / narrow-LLM boundary**, and a **temporal, versioned weight store** instead of a static one.

## 2. Abstraction 1 — The deterministic core / LLM boundary

The system is understood as **three** kinds of computation now, not two — a local ML model sits between the deterministic core and the LLM boundary, handling structured extraction without either hand-written rules or an external API:

```mermaid
flowchart LR
    subgraph Det["Deterministic core\n(pure functions over data)"]
        d1["f(resume_text) -> ats_score\nsame input, same output, always"]
        d2["f(skills, roles) -> ranked matches\nsame input, same output, always"]
    end
    subgraph LocalML["Local ML — default extraction\n(no external API, no LLM)"]
        m1["f(resume_text) -> structured JSON\nlocal NER model, offline"]
    end
    subgraph LLMB["LLM-scoped boundary\n(behind LLMClient Protocol)"]
        l1["f(resume_text) -> structured JSON\nextraction, opt-in alternative to LocalML"]
        l2["f(scores) -> prose\nexplanation only, cannot alter scores"]
    end
    Det -. "LLM never appears\nin this box's logic" .-> Det
    LocalML -. "no network call,\nno API key needed" .-> LocalML
    LLMB -. "LLM output is data,\nnever a decision" .-> LLMB
```

The abstraction boundary is enforced two ways in the actual code, not just by convention:

1. **Module boundary.** `normalizer.py`, `matcher.py`, `ats_score.py`, and `gap_analysis.py` have zero imports of `llm_client.py`, `local_ner_parser.py`, or any LLM/NER SDK. `explainer.py` is the only module that unconditionally touches an `LLMClient`; `parser.py` touches `local_ner_parser.py` by default and `llm_client.py` only when `PARSER_BACKEND=llm`.
2. **Interface boundary.** `LLMClient` is a `typing.Protocol` — `parser.py`'s opt-in path and `explainer.py` depend on an abstract `.complete(system_prompt, user_prompt) -> str` shape, not on a concrete SDK's types (`GroqLLMClient`/`GeminiLLMClient` both implement it). This is what lets the test suite (`tests/test_pipeline.py`, `tests/test_llm_client.py`) substitute a `FakeLLMClient` and run fully offline. `local_ner_parser.py` uses the same seam at a smaller scale: `parse_resume_local()` takes an injectable pipeline callable, so its entity-clustering logic (`tests/test_local_ner_parser.py`) is testable without downloading the real model either.

**Why this matters as an abstraction, not just an implementation detail:** it means the *cost* of using an LLM (non-determinism, latency, external dependency, price) is paid, by default, for exactly one task — writing readable prose from already-computed numbers. Structured extraction, despite being a genuinely NLP task, is handled by a local model instead, so the *only* thing that still costs money/network/an API key by default is explanation generation. The LLM remains available as an opt-in extraction path for cases the local model handles poorly.

## 3. Abstraction 2 — Skills as a normalized, versioned vector space

Rather than treating "skills" as free text everywhere, the system funnels all skill data through one canonical representation before it's ever compared:

```mermaid
flowchart LR
    raw["Raw text\n'ReactJS', 'react.js', 'REACT'"] -->|normalizer.py\nlookup table| canon["Canonical skill\n'React'"]
    canon -->|embeddings.py\nsentence-transformers| vec["Embedding vector\n(384-dim, all-MiniLM-L6-v2)"]
    vec -->|matcher.py\ncosine similarity| score["Match score\n(explainable: matched/missing\nare exact-string set ops)"]
```

Two sub-abstractions stack here:

- **Canonicalization** (`normalizer.py`) collapses spelling/casing variance *before* anything numeric happens, so matched/missing-skill lists stay exact and human-readable rather than "similar-ish embedding distance."
- **Vectorization** (`embeddings.py`) is the only place floating-point, model-dependent computation enters the pipeline — isolated behind two functions (`embed`, `cosine_similarity`) so the underlying model could be swapped without touching `matcher.py`'s ranking logic.

**Temporal extension (planned):** today a role's skill vector is the mean of its (static) curated skill list's embeddings, recomputed fresh each time. The planned `SkillVector` table (see [Database Schema](database-schema.md)) turns this into a **versioned, time-decayed store** — each role's weight vector persists across requests and updates via EMA (`new_weight = α·new_signal + (1−α)·old_weight`) as new market data or feedback arrives, with every prior version retained. This is the abstraction that makes matching improve over time instead of staying frozen at whatever the curated dataset looked like on day one.

## 4. Abstraction 3 — File format behind an adapter interface

`POST /parse-file` needs to turn a resume *file* (PDF today, other formats later) into the same plain text the rest of the pipeline already consumes. Rather than special-casing PDF logic inside the router, that responsibility sits behind `DocumentTextExtractor` (`document_extraction/base.py`), a `typing.Protocol` with one method (`extract(file_bytes) -> str`), implemented today by `PdfTextExtractor` and dispatched by file extension via `registry.py`.

```mermaid
flowchart LR
    router["upload.py\nPOST /parse-file"] -->|file bytes, filename| registry["registry.py\nget_extractor_for_filename()"]
    registry -->|".pdf"| pdf["PdfTextExtractor\n(pdfplumber, column-aware)"]
    registry -.->|".docx" (not yet registered)| future["future DocxTextExtractor"]
    pdf -->|text, correct reading order| parser["parser.py\n(unchanged)"]
```

This is the same interface-boundary pattern as `LLMClient` (Abstraction 1), applied one layer earlier in the pipeline: adding a new file format means writing one new class that implements `DocumentTextExtractor` and adding one line to the registry's dictionary — `routers/upload.py` and everything downstream of text extraction never change. It's why the PDF-specific complexity (detecting and correcting for multi-column layouts, so a resume's sections don't get interleaved before parsing ever sees the text) is fully contained inside `pdf_extractor.py` and invisible to the rest of the system. This pattern is now a standing project rule, not a one-off choice — see `CLAUDE.md`, "Design principles".

## 5. Abstraction 4 — Layered request handling

Standard three-tier separation, but worth stating explicitly since it's what keeps the ML service testable without a running server or database:

| Layer | Knows about | Does not know about |
|---|---|---|
| **Router** (`routers/analyze.py`, `routers/upload.py`) | HTTP request/response shapes (Pydantic models), which service to call | How any service computes its result |
| **Service** (`services/*.py`) | Its one job (parse, normalize, match, score, explain) | HTTP, FastAPI, request/response wrapping |
| **Schema** (`models/schemas.py`) | Field names, types, defaults — the data contract | Any business logic |
| **Data** (`data/*.json`, planned DB) | Static/persisted values | How they're used |

A consequence worth naming: every service function in `ml-service/app/services/` can be called directly in a test with plain Python values — no FastAPI `TestClient`, no HTTP round-trip required (see how `tests/test_ats_score.py`, `test_matcher.py`, `test_normalizer.py` all import and call service functions directly).

## 6. Where the abstractions end and the roadmap begins

The abstractions above hold for what's built (`ml-service/`). A few things are explicitly deferred, and knowing this boundary matters for anyone extending the system:

- **Persistence abstraction:** there is currently no repository/DAO layer — `normalizer.py` and `matcher.py` read JSON files directly via `DATA_DIR`. Once the backend exists, this should move behind a repository interface so the ML service can read from PostgreSQL without its callers changing.
- **Orchestration abstraction:** today, `routers/analyze.py` *is* the orchestrator — it calls all five services directly in sequence. Once the Spring Boot backend exists, orchestration for anything involving persistence (resume versioning, recommendation storage, feedback-linked EMA updates) moves there, and the ML service becomes a stateless computation service the backend calls into — exactly matching the deployment view in [Architecture §4](architecture.md#4-deployment-view-demonstration-target).
- **File-format coverage:** the adapter interface (Abstraction 3) is ready for more formats, but only `PdfTextExtractor` exists — DOCX and any richer upload validation/versioning (format/size checks, storage) remain backend-side, planned work.

## Related documents

- [System Architecture](architecture.md)
- [High-Level Design](hld.md)
- [UML Diagrams](uml-diagrams.md)
- [Entities & Fields](entities-and-fields.md)
