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

Needs a PostgreSQL 15+ database, an S3-compatible object store (MinIO) for resume files, and
the ML service (`../ml-service/`) running.

```bash
docker compose -f ../docker-compose.yml up -d   # starts Postgres + MinIO
mvn spring-boot:run
```

Without Docker, point `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` at an existing PostgreSQL database
and `OBJECT_STORAGE_*` at an existing S3-compatible endpoint instead.

Flyway (`src/main/resources/db/migration/`) creates the schema on startup; Hibernate only
validates it matches the entities (`ddl-auto: validate`), it never generates DDL itself.

Key environment variables (see `src/main/resources/application.yml` for every default):

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/resume_analyser` / `postgres` / `postgres` | Database connection |
| `JWT_SECRET` | dev-only default | HS256 signing key — **must** be overridden in any real deployment |
| `ML_SERVICE_BASE_URL` | `http://localhost:8000` | Where the ML service is running |
| `OBJECT_STORAGE_ENDPOINT` | `http://localhost:9000` | MinIO/S3-compatible endpoint resume files are stored in |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | `minioadmin` / `minioadmin` | Object storage credentials |
| `OBJECT_STORAGE_BUCKET` | `resumes` | Bucket resume files are stored in (created on startup if missing) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200` | Origin(s) the frontend is served from |

## Testing

```bash
mvn test
```
