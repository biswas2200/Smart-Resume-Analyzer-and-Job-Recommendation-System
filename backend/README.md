# Backend (planned)

Spring Boot 3.x on Java 21, with Spring Security (JWT) and PostgreSQL. Owns
auth, orchestration, the REST API consumed by the frontend, and the temporal
EMA-weighted skill-vector store described in the project plan (§5, in the
separate `docs/` project — see the repo root README).

Implementation starts once the ML pipeline in
[`../ml-service/`](../ml-service/README.md) is validated standalone.
