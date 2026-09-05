# Frontend

Angular 22 (standalone components, TypeScript) single-page application for resume upload and
the results dashboard (profile, recommended roles, gap breakdown, feedback). Generated with
Angular CLI using the classic `2016` file-naming style (`login.component.ts`, `auth.service.ts`,
etc.) so every file's role is clear from its name, per this repo's naming conventions
(see the root [`CLAUDE.md`](../CLAUDE.md)).

## Status

The real backend (`backend/`) currently only has the `auth` module wired up
(`POST /auth/register`, `POST /auth/login`). The `resume`, `recommendation`, and `feedback`
modules have entities/DTOs but no controllers yet (see [docs/lld.md §7](../docs/lld.md)). To
keep this frontend fully testable and usable today, every feature built against one of those
not-yet-implemented endpoints is served by an in-memory mock implementation, gated by
`environment.useMockApiForUnimplementedFeatures` (`src/environments/`). Login/register always
call the real backend. Flip that flag to `false` once the corresponding backend endpoint exists
— each service (`ResumeService`, `RecommendationService`, `FeedbackService`) already has the
real `HttpClient` call written and tested alongside its mock path.

## Architecture

- `src/app/core/` — cross-cutting concerns: models mirroring backend DTOs, `AuthService`,
  the JWT-attaching `authInterceptor`, `authGuard`, and shared error-handling utilities.
- `src/app/features/` — one folder per screen area: `auth` (login/register), `resume` (upload +
  parsed profile), `dashboard` (ATS score, role recommendations, feedback).
- `src/app/shared/` — reusable presentational components (currently the app header).

## Development server

```bash
ng serve
```

Open `http://localhost:4200/`. The app expects the backend at `http://localhost:8080`
(`src/environments/environment.development.ts`).

## Running unit tests

Built test-first (TDD): every service/guard/interceptor/component has a `.spec.ts` written
before its implementation. Uses [Vitest](https://vitest.dev/) via the Angular CLI builder.

```bash
ng test
```

## Building

```bash
ng build
```

Build artifacts are written to `dist/frontend/`.
