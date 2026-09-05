# Process Flow

Activity-diagram view of the system's three main end-to-end flows: the core analyze flow (implemented), JD matching (planned, reuses implemented pieces), and the temporal EMA skill-vector update (planned). Where [DFD](dfd.md) shows *what data moves where* and [LLD](lld.md) shows *module call sequences*, this document shows the flow from the **user's** perspective, including decision points and failure paths.

## 1. Core flow — "Analyze my resume" (implemented in `ml-service`)

```mermaid
flowchart TD
    Start([Candidate submits resume text\nor uploads a PDF]) --> Val{Valid input?}
    Val -- No --> ErrIn[Return 422/415 — validation\nor unsupported file type]
    Val -- Yes --> Extract{Uploaded a file?}
    Extract -- Yes --> ExtractText[Extract text, column-aware\n(document_extraction/pdf_extractor.py)]
    Extract -- No --> Parse
    ExtractText --> Parse[Parse: local NER model by default,\nLLM only if PARSER_BACKEND=llm]
    Parse --> ParseOK{Parse succeeded?}
    ParseOK -- No --> ErrParse["Propagate error\n(hardening: fall back gracefully — not yet implemented)"]
    ParseOK -- Yes --> Norm[Normalize extracted skills\nagainst canonical taxonomy]
    Norm --> ATS[Score ATS compatibility\n— runs independently, no LLM]
    Norm --> Embed[Embed candidate skill set]
    Embed --> Match[Rank curated roles by\ncosine similarity]
    Match --> Gap[Derive skill gaps from\nmissing_skills per role]
    ATS --> Explain
    Match --> Explain
    Gap --> Explain[Call LLM: turn scores into\ncoaching explanation]
    Explain --> ExplainOK{LLM available?}
    ExplainOK -- No --> Degrade["Return profile + ats_score + matches + gaps,\nexplanation empty/fallback\n(NFR-3.1 graceful degradation)"]
    ExplainOK -- Yes --> Assemble[Assemble AnalyzeResponse]
    Degrade --> Return
    Assemble --> Return([Return to candidate])
```

## 2. Planned flow — Resume upload → dashboard (backend + frontend, not yet built)

Text extraction itself (the `X` step below) is already implemented for PDF in `ml-service` (`POST /parse-file`, column-aware via `document_extraction/`); what's still planned is the backend wrapping it with format/size validation, versioning, persistence, and the frontend dashboard.

```mermaid
flowchart TD
    U([Candidate uploads PDF/DOCX]) --> V{Format PDF/DOCX\nand size ≤ 5 MB?}
    V -- No --> E1[Reject with clear error — FR-1.3]
    V -- Yes --> X["Extract raw text from file\n(implemented for PDF — ml-service POST /parse-file;\nDOCX not yet supported)"]
    X --> S[Store as new timestamped\nResume version — FR-1.5]
    S --> Call[Call ML Service POST /analyze]
    Call --> Persist[Persist ParsedProfile and\nRecommendation rows]
    Persist --> Dash[Render consolidated Dashboard\n— profile, matches, gaps, ATS score]
    Dash --> Hist{Candidate views\nversion history?}
    Hist -- Yes --> Trend[Show resume version history\n+ match-score trend — FR-6.2]
    Hist -- No --> Done([Done])
    Trend --> Done
```

## 3. Planned flow — Job description matching

```mermaid
flowchart TD
    A([Candidate pastes job description]) --> B[Retrieve candidate's current\nnormalized skill profile]
    B --> C[Embed JD text / JD-derived\nskill list]
    C --> D["Reuse matcher.py pipeline:\ncosine similarity vs. candidate vector"]
    D --> E[Compute match % and\nmissing-keyword list — FR-8.2]
    E --> F([Return targeted match result])
```

## 4. Planned flow — Feedback → temporal EMA skill-vector update

This is the mechanism that directly answers the "static matching" limitation the SRS calls out in comparable systems (§1.4). It runs independently of any single candidate's request.

```mermaid
flowchart TD
    A([Candidate marks recommendation\nhelpful / not helpful]) --> B[Persist Feedback row,\nlinked to Recommendation\nand active SkillVector version — FR-10.2]
    B --> C{New job-market data\nOR enough feedback\naccumulated for a role?}
    C -- No --> W[Wait — no update triggered]
    C -- Yes --> D["Compute new_signal\n(from feedback + market data)"]
    D --> E["new_weight = α·new_signal + (1−α)·old_weight\n— FR-7.2"]
    E --> F[Write new SkillVector row\nwith incremented version_timestamp\n— prior versions retained, FR-7.4]
    F --> G[Future /match calls for this role\nuse the new weighted vector]
    G --> H([Done])
```

## 5. Sequence: how flow 1 maps to real function calls

For the exact module-to-module call sequence behind flow 1 (which function calls which, in what order), see [LLD §3 Sequence diagram — POST /analyze](lld.md#3-sequence-diagram--post-analyze). This document intentionally stays at the user-journey level; that one stays at the code level.

## Related documents

- [Data Flow Diagram](dfd.md)
- [Use Case Diagram](use-case-diagram.md)
- [Low-Level Design](lld.md)
- [Database Schema](database-schema.md) — `SkillVector` table backing flow 4
