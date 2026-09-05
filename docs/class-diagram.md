# Class Diagram

Two diagrams: the **implemented** ML-service classes (Pydantic models + service functions, shown as static-method classes for UML purposes since Python modules of free functions don't map 1:1 to UML classes) and the **planned** backend JPA entity classes. Full source for every class shown here is in [Entities & Fields](entities-and-fields.md).

## 1. Implemented — ML Service (`ml-service/app/`)

### 1.1 Data classes (Pydantic models, `models/schemas.py`)

```mermaid
classDiagram
    class ExperienceEntry {
        +str title
        +str organization
        +str duration
        +str description
    }
    class EducationEntry {
        +str degree
        +str institution
        +str year
    }
    class ResumeProfile {
        +str name
        +str email
        +str phone
        +list~str~ skills
        +list~ExperienceEntry~ experience
        +list~EducationEntry~ education
    }
    class RoleMatch {
        +str role
        +float score
        +list~str~ matched_skills
        +list~str~ missing_skills
    }
    class AtsCheck {
        +str name
        +bool passed
        +str detail
    }
    class AtsScoreResponse {
        +float score
        +float max_score
        +list~AtsCheck~ checks
    }
    class GapAnalysis {
        +str role
        +list~str~ missing_skills
    }
    class AnalyzeResponse {
        +ResumeProfile profile
        +AtsScoreResponse ats_score
        +list~RoleMatch~ matches
        +list~GapAnalysis~ gaps
        +str explanation
    }

    ResumeProfile "1" *-- "many" ExperienceEntry
    ResumeProfile "1" *-- "many" EducationEntry
    AtsScoreResponse "1" *-- "many" AtsCheck
    AnalyzeResponse "1" *-- "1" ResumeProfile
    AnalyzeResponse "1" *-- "1" AtsScoreResponse
    AnalyzeResponse "1" *-- "many" RoleMatch
    AnalyzeResponse "1" *-- "many" GapAnalysis
```

*(Request-only models — `ParseRequest`, `MatchRequest`, `AtsScoreRequest`, `AnalyzeRequest` — are omitted from the diagram for readability; see [Entities & Fields](entities-and-fields.md) for their full field lists.)*

### 1.2 Service classes (behavioral view of `services/*.py`)

Python implements these as modules of functions, not classes — shown here as UML classes with static-style operations, which is the standard way to diagram a functional module.

```mermaid
classDiagram
    class LLMClient {
        <<Protocol>>
        +complete(system_prompt, user_prompt) str
    }
    class GroqLLMClient {
        -Groq _client
        -str _model
        +complete(system_prompt, user_prompt) str
    }
    class GeminiLLMClient {
        -Client _client
        -str _model
        +complete(system_prompt, user_prompt) str
    }
    class DocumentTextExtractor {
        <<Protocol>>
        +extract(file_bytes) str
    }
    class PdfTextExtractor {
        <<pdf_extractor.py>>
        +extract(file_bytes) str
    }
    class ResumeParser {
        <<parser.py>>
        +parse_resume(resume_text, client) ResumeProfile
    }
    class LocalNerResumeParser {
        <<local_ner_parser.py>>
        +parse_resume_local(resume_text, ner_pipeline) ResumeProfile
    }
    class SkillNormalizer {
        <<normalizer.py>>
        +normalize_skill(raw_skill) str
        +normalize_skills(raw_skills) list~str~
    }
    class EmbeddingService {
        <<embeddings.py>>
        +embed(texts) ndarray
        +cosine_similarity(a, b) float
    }
    class RoleMatcher {
        <<matcher.py>>
        +match_roles(raw_skills, top_n) list~RoleMatch~
    }
    class AtsScorer {
        <<ats_score.py>>
        +score_resume(resume_text, target_keywords) AtsScoreResponse
    }
    class GapAnalyzer {
        <<gap_analysis.py>>
        +analyze_gaps(matches) list~GapAnalysis~
    }
    class ResultExplainer {
        <<explainer.py>>
        +explain_results(profile, ats_score, matches, gaps, client) str
    }

    GroqLLMClient ..|> LLMClient
    GeminiLLMClient ..|> LLMClient
    PdfTextExtractor ..|> DocumentTextExtractor
    ResumeParser --> LocalNerResumeParser : uses (default)
    ResumeParser --> LLMClient : uses (opt-in, PARSER_BACKEND=llm)
    ResultExplainer --> LLMClient : uses
    RoleMatcher --> SkillNormalizer : uses
    RoleMatcher --> EmbeddingService : uses
    ResumeParser --> ResumeProfile : returns
    LocalNerResumeParser --> ResumeProfile : returns
    RoleMatcher --> RoleMatch : returns
    AtsScorer --> AtsScoreResponse : returns
    GapAnalyzer --> GapAnalysis : returns
```

## 2. Planned — Backend JPA entities

Object-oriented view of [Entity Diagram](entity-diagram.md) / [Database Schema](database-schema.md), as it will look once implemented in the Spring Boot backend.

```mermaid
classDiagram
    class User {
        -UUID id
        -String email
        -String passwordHash
        -Instant createdAt
        +List~Resume~ resumes
    }
    class Resume {
        -UUID id
        -User user
        -String fileRef
        -int version
        -Instant uploadedAt
        +ParsedProfile parsedProfile
    }
    class ParsedProfile {
        -UUID id
        -Resume resume
        -String name
        -String email
        -String phone
        -List~String~ skills
        -List~ExperienceEntry~ experience
        -List~EducationEntry~ education
    }
    class Role {
        -UUID id
        -String title
        -String description
        +List~SkillVector~ skillVectors
    }
    class SkillVector {
        -UUID id
        -Role role
        -String skill
        -double weight
        -Instant versionTimestamp
        -boolean current
    }
    class Recommendation {
        -UUID id
        -User user
        -Role role
        -double matchScore
        -Instant createdAt
        +List~Feedback~ feedback
    }
    class Feedback {
        -UUID id
        -Recommendation recommendation
        -SkillVector skillVectorVersion
        -boolean helpful
        -Instant createdAt
    }

    User "1" --> "many" Resume : owns
    Resume "1" --> "0..1" ParsedProfile : produces
    User "1" --> "many" Recommendation : receives
    Role "1" --> "many" Recommendation : "recommended as"
    Role "1" --> "many" SkillVector : "versioned weights"
    Recommendation "1" --> "many" Feedback : collects
    SkillVector "1" --> "many" Feedback : "active for"
```

## Related documents

- [Entity Diagram](entity-diagram.md)
- [Entities & Fields](entities-and-fields.md) — full source code for every class above
- [LLD](lld.md)
