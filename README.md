# Smart Resume Analyser and Job Recommendation System

An AI-assisted resume analyser and career recommendation system, built with a
deterministic core (ATS scoring, embedding-based skill-to-role matching) and a
narrow, well-scoped use of an LLM (resume parsing and result explanation only —
not resume rewriting). Full design docs live in a separate `docs/` project,
hosted outside this repo — see the **Documentation** section below.

## Repo layout

| Path | Status | Description |
|---|---|---|
| [`ml-service/`](ml-service/README.md) | Integrated | Python/FastAPI ML pipeline: parsing, skill normalization, embedding-based role matching, ATS scoring, gap analysis, explanations. |
| [`backend/`](backend/README.md) | Integrated | Spring Boot API: auth, resume upload/versioning, ML-service orchestration, recommendation/feedback persistence. The temporal (EMA) skill-vector update job (FR-7) is not yet implemented. |
| [`frontend/`](frontend/README.md) | Integrated | Angular UI: auth, resume upload, dashboard, and feedback all wired to the real backend. |

## Running the full stack locally

The three services talk to each other over HTTP; start them in this order (each in its own
terminal):

1. **ML service** (`ml-service/`, port 8000) — see [its README](ml-service/README.md) for setup.
   ```bash
   uvicorn app.main:app --reload
   ```
2. **Backend** (`backend/`, port 8080) — needs a PostgreSQL 15+ database. Flyway creates the
   schema on startup (`db/migration/`).
   ```bash
   createdb resume_analyser   # or point DB_URL/DB_USERNAME/DB_PASSWORD at an existing one
   mvn spring-boot:run        # ML_SERVICE_BASE_URL defaults to http://localhost:8000
   ```
3. **Frontend** (`frontend/`, port 4200) — expects the backend at `http://localhost:8080`
   (`src/environments/environment.development.ts`).
   ```bash
   npm install
   ng serve
   ```

The backend's `app.cors.allowed-origins` (default `http://localhost:4200`) must include
whatever origin the frontend is actually served from.

## Build order

1. **ML pipeline** — deterministic scoring/matching + narrow LLM tasks, validated standalone.
2. **Backend** — wraps the ML service, adds persistence and orchestration.
3. **Frontend** — consumes the backend API.

The temporal EMA-weighted skill-vector update loop (FR-7) described in the design docs below
is not yet implemented — feedback is persisted, but nothing recomputes skill weights from it yet.

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
| Frontend | Angular 22 (standalone components, TypeScript), Vitest | Integrated — `frontend/` |
| Backend | Java 21, Spring Boot 3.x, Spring Security (JWT), PostgreSQL, Flyway | Integrated — `backend/` |
| ML service | Python 3.12, FastAPI, `sentence-transformers` (`all-MiniLM-L6-v2`), Groq API | Integrated — `ml-service/` |
| Docs | MkDocs + Material, static HTML, hosted separately | In progress |

## License

All rights reserved — see [`LICENSE`](LICENSE).
