# Intelligent Resume Analyser and Career Recommendation System — Documentation

An AI-assisted resume analyser and career recommendation system, built with a **deterministic core** (ATS scoring, embedding-based skill-to-role matching) and a **narrow, well-scoped use of an LLM** (resume parsing and result explanation only — never resume rewriting, never scoring). See [Abstraction Overview](abstraction-overview.md) for why this split exists and what market gap it addresses.

This documentation set lives as a sibling folder to the code repository (`Smart-Resume-Analyzer-and-Job-Recommendation-System/`), per that repo's own README, which deliberately keeps design docs out of the tracked codebase and builds/deploys them independently.

## Where to start

New to the project? Read in this order: [Abstraction Overview](abstraction-overview.md) → [System Architecture](architecture.md) → [HLD](hld.md) → [Use Case Diagram](use-case-diagram.md) → [DFD](dfd.md) / [Process Flow](process-flow.md) → [Entity Diagram](entity-diagram.md) / [Database Schema](database-schema.md) → [Class Diagram](class-diagram.md) / [Entities & Fields](entities-and-fields.md) → [LLD](lld.md). The full rationale for this order is in [UML Diagrams §2](uml-diagrams.md#2-reading-order-for-reviewers-new-to-the-project).

## Document index

| Document | Covers |
|---|---|
| [Abstraction Overview](abstraction-overview.md) | The market gap this project targets; the deterministic-core/LLM abstraction; the normalized-skill-vector abstraction |
| [System Architecture](architecture.md) | Component diagram, deterministic-vs-LLM split, deployment view |
| [High-Level Design (HLD)](hld.md) | Layer responsibilities, key design decisions, non-functional targets |
| [Low-Level Design (LLD)](lld.md) | Module design grounded in the real `ml-service` code, API contracts, sequence diagram |
| [Use Case Diagram](use-case-diagram.md) | Actors, use cases, implemented vs. planned |
| [Data Flow Diagram (DFD)](dfd.md) | Level 0 context diagram, Level 1 process breakdown |
| [Process Flow](process-flow.md) | End-to-end activity diagrams: analyze flow, JD match, feedback → EMA update |
| [UML Diagrams](uml-diagrams.md) | Index of all UML views + component diagram |
| [Entity Diagram](entity-diagram.md) | Conceptual entity-relationship diagram |
| [Database Schema](database-schema.md) | ERD + indicative PostgreSQL DDL, incl. the versioned EMA skill-vector table |
| [Class Diagram](class-diagram.md) | Implemented Pydantic/service classes + planned JPA entity classes |
| [Entities & Fields](entities-and-fields.md) | Full source code for every entity/model, field-by-field description |
| [Tech Stack](tech-stack.md) | Full per-layer breakdown, built vs. planned |

## Project status at a glance

| Component | Status |
|---|---|
| ML Service (`ml-service/`) — parsing, normalization, matching, ATS scoring, gap analysis, explanation | **Implemented**, tested (`pytest tests/`) |
| Backend (Spring Boot) — auth, orchestration, persistence, temporal EMA updates | Planned |
| Frontend (React/Angular) — upload, dashboard, recommendations | Planned |

## Building this documentation as a site

This folder is set up as a minimal [MkDocs](https://www.mkdocs.org/) + [Material](https://squidfunk.github.io/mkdocs-material/) project (`mkdocs.yml` in this same directory):

```bash
pip install mkdocs-material
mkdocs serve   # run from inside this docs/ folder
```
