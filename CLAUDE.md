# Project instructions

## Naming & comments (applies to the whole codebase, every language)

- Every class, method/function, variable, and parameter name must be human-readable on its own — a reader should be able to tell what something is/does from its name alone, without opening its definition. Prefer a slightly longer, clear name over a short, ambiguous one.
- Add comments so the code itself is useful documentation, not just the docs/ folder:
  - Every public class gets a short comment above it stating what it represents/does.
  - Every public method gets a short comment stating what it does, unless the method name + signature already make that fully obvious (e.g. a one-line getter).
  - Non-obvious logic (a business rule, a workaround, a constraint from an external library/spec, a security-sensitive choice) gets an inline comment explaining *why*, not just what.
- This is a deliberate override of the terser "only comment the non-obvious" default — for this project, comment for a reader who has never seen the code before and won't read `docs/` first.
- Applies going forward to all new code, and when touching a file for another reason, bring its naming/comments up to this standard too.

## Architecture

- Backend (`backend/`) is a modular monolith: one top-level Java package per domain module (`account`, `auth`, `resume`, `recommendation`, `feedback`, `skillvector`, planned `client`), not technical layers. Full convention: [docs/lld.md §7](docs/lld.md).
- Entity/DTO field reference: [docs/entities-and-fields.md](docs/entities-and-fields.md). DB schema: [docs/database-schema.md](docs/database-schema.md).
- `documents/` is excluded from git (internal SRS draft/notes) — see `.gitignore`.
