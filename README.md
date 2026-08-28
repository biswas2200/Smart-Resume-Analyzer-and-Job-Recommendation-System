# Smart Resume Analyser and Job Recommendation System

An AI-assisted resume analyser and career recommendation system, built with a
deterministic core (ATS scoring, embedding-based skill-to-role matching) and a
narrow, well-scoped use of an LLM (resume parsing and result explanation only —
not resume rewriting). Full design docs live in a separate `docs/` project,
hosted outside this repo — see the **Documentation** section below.

## Repo layout

| Path | Status | Description |
|---|---|---|
| [`ml-service/`](ml-service/README.md) | In progress | Python/FastAPI ML pipeline: parsing, skill normalization, embedding-based role matching, ATS scoring, gap analysis, explanations. |
| [`backend/`](backend/README.md) | Planned | Spring Boot API: auth, orchestration, persistence, temporal (EMA) skill-vector updates. |
| [`frontend/`](frontend/README.md) | Planned | React/Angular UI: upload, dashboard, recommendations. |

## Build order

1. **ML pipeline** (current focus) — deterministic scoring/matching + narrow
   LLM tasks, validated standalone before anything depends on it.
2. **Backend** — wraps the ML service, adds persistence and the temporal
   EMA-weighted recommendation loop.
3. **Frontend** — consumes the backend API.

## Documentation

Full docs (architecture, ML pipeline design, setup, the original project
plan) live in a separate `docs/` project, kept as a sibling directory next to
this repo rather than inside it, since it's built and deployed independently
(static HTML via MkDocs). See that project's own README for build
instructions.

## Design docs (quick lookup)

Links below are relative paths assuming the sibling layout described above
(`../docs/...` from this repo's root) — they resolve locally but won't
travel with a fresh `git clone` of this repo alone, since `docs/` isn't
tracked here on purpose.

| Doc | What it covers |
|---|---|
| [Architecture](../docs/architecture.md) | System diagram, deterministic-vs-LLM split |
| [HLD](../docs/hld.md) | Component view, layer responsibilities, key design decisions |
| [LLD](../docs/lld.md) | Module design (grounded in the real ML service code), API contracts, sequence diagrams |
| [DFD](../docs/dfd.md) | Level 0 context diagram, Level 1 process breakdown |
| [Database Schema & ERD](../docs/database-schema.md) | Entity-relationship diagram, indicative DDL, including the versioned EMA skill-vector table |
| [Use Case Diagram](../docs/use-case-diagram.md) | Actors, use cases, implemented vs. planned |
| [Tech Stack](../docs/tech-stack.md) | Full per-layer breakdown, built vs. planned |

## Tech stack (at a glance)

| Layer | Stack | Status |
|---|---|---|
| Frontend | React or Angular (not yet decided) | Planned |
| Backend | Java 21, Spring Boot 3.x, Spring Security (JWT), PostgreSQL | Planned |
| ML service | Python 3.12, FastAPI, `sentence-transformers` (`all-MiniLM-L6-v2`), Groq API | In progress — this is what's actually built in `ml-service/` |
| Docs | MkDocs + Material, static HTML, hosted separately | In progress |

## License

All rights reserved — see [`LICENSE`](LICENSE).
