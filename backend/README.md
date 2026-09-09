# Backend

Spring Boot 3.x on Java 21, with Spring Security (JWT), PostgreSQL, and Flyway. Owns auth,
resume upload/versioning, orchestration of the ML service, and persistence of the resulting
recommendations and feedback.

## Modules

| Module | Endpoints | Notes |
|---|---|---|
| `auth` | `POST /auth/register`, `POST /auth/login` | Stateless JWT, bcrypt passwords, RBAC roles |
| `resume` | `POST /resumes`, `GET /resumes`, `GET /resumes/{id}/profile` | Validates + stores the file, calls the ML service's `POST /analyze-file` once per upload |
| `recommendation` | `GET /recommendations/dashboard` | Composite read view assembled from the latest resume's persisted analysis |
| `feedback` | `POST /feedback`, `GET /feedback/{recommendationId}` | Helpful/not-helpful verdicts (FR-10.1) |
| `client` | — | Typed HTTP client wrapping the ML service |

The temporal EMA-weighted skill-vector update job (FR-7) is not implemented yet — feedback rows
are persisted, but nothing recomputes `SkillVector` weights from them.

## Running locally

Needs a PostgreSQL 15+ database and the ML service (`../ml-service/`) running.

```bash
createdb resume_analyser   # or point DB_URL/DB_USERNAME/DB_PASSWORD at an existing one
mvn spring-boot:run
```

Flyway (`src/main/resources/db/migration/`) creates the schema on startup; Hibernate only
validates it matches the entities (`ddl-auto: validate`), it never generates DDL itself.

Key environment variables (see `src/main/resources/application.yml` for every default):

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/resume_analyser` / `postgres` / `postgres` | Database connection |
| `JWT_SECRET` | dev-only default | HS256 signing key — **must** be overridden in any real deployment |
| `ML_SERVICE_BASE_URL` | `http://localhost:8000` | Where the ML service is running |
| `RESUME_STORAGE_DIR` | `./data/resumes` | Local-disk stand-in for object storage |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200` | Origin(s) the frontend is served from |

## Testing

```bash
mvn test
```
