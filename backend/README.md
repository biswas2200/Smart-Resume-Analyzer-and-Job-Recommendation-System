# Backend

Spring Boot 3.x on Java 21, with Spring Security (JWT), PostgreSQL, and Flyway. Owns auth,
resume upload/versioning, orchestration of the ML service, and persistence of the resulting
recommendations and feedback.

## Modules

| Module | Endpoints | Notes |
|---|---|---|
| `auth` | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Stateless JWT, bcrypt passwords, RBAC roles; `/me` reads the role fresh from the database so an upgrade is visible immediately. Emails in `APP_ADMIN_EMAILS` become ADMIN on register/login |
| `admin` | `GET /admin/users?email=`, `PATCH /admin/users/{id}/role` (ADMIN only) | The MVP's upgrade path — no payments, an admin sets `USER` / `PREMIUM_USER` / `ADMIN` |
| `resume` | `POST /resumes`, `GET /resumes`, `GET /resumes/{id}/profile`, `POST /resumes/{id}/reanalyze` | Validates + stores the file (PDF or DOCX), calls the ML service's `POST /analyze-file?tier=free\|premium` once per upload; `reanalyze` re-reads the stored file and re-runs it at the account's current tier (how a new Premium account unlocks a locked domain) |
| `recommendation` | `GET /recommendations/dashboard` | Composite read view assembled from the latest resume's persisted analysis: detected domain, ATS score, roles (or a lock with `lockReason`), explanation, the user's tier |
| `feedback` | `POST /feedback`, `GET /feedback/{recommendationId}` | Helpful/not-helpful verdicts (FR-10.1); triggers the skill-vector recompute once enough feedback accumulates |
| `skillvector` | `GET /roles/{roleId}/skill-vectors`, `POST /roles/{roleId}/skill-vectors/recompute` (ADMIN only) | Versioned, EMA-weighted skill store (FR-7.1-7.4) |
| `client` | — | Typed HTTP client wrapping the ML service |

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

## API docs

Swagger UI: `http://localhost:8080/swagger-ui/index.html` — browse every endpoint and try
requests directly. Public/login endpoints work with no setup; for anything else, call
`POST /auth/login`, copy the `token` from the response, and paste it into the Authorize button
(top right) as `<token>` (no `Bearer ` prefix needed, Swagger adds it). Raw OpenAPI document at
`http://localhost:8080/v3/api-docs`.

Key environment variables (see `src/main/resources/application.yml` for every default):

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/resume_analyser` / `postgres` / `postgres` | Database connection |
| `JWT_SECRET` | dev-only default | HS256 signing key — **must** be overridden in any real deployment |
| `ML_SERVICE_BASE_URL` | `http://localhost:8000` | Where the ML service is running |
| `OBJECT_STORAGE_ENDPOINT` | `http://localhost:9010` | MinIO/S3-compatible endpoint resume files are stored in (host port shifted off MinIO's default 9000, which commonly collides with other local tools) |
| `OBJECT_STORAGE_ACCESS_KEY` / `OBJECT_STORAGE_SECRET_KEY` | `minioadmin` / `minioadmin` | Object storage credentials |
| `OBJECT_STORAGE_BUCKET` | `resumes` | Bucket resume files are stored in (created on startup if missing) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:4200` | Origin(s) the frontend is served from |
| `APP_ADMIN_EMAILS` | *(empty)* | Comma-separated emails promoted to ADMIN on register/login — the bootstrap for the first administrator |

## Logging

`common.logging.RequestIdFilter` gives each request an id (an incoming
`X-Request-Id` when it is safe, otherwise a new UUID), returns it in the
response header, adds it to every log line (`[id]` after the level) and passes
it to the ML service, whose logs carry the same id. One access line per request
(method, path, status, duration), one line per ML-service call, one outcome
line per resume analysis, and `LoggingAspect`'s per-method timings. A 500's
`traceId` is the request id. Bodies, tokens, passwords and resume content are
never logged.

`LOG_LEVEL` (app packages, default `INFO`), `LOG_LEVEL_ROOT` and `LOG_FILE`
(e.g. `logs/backend.log`) are environment variables.

## Testing

```bash
mvn test
```
