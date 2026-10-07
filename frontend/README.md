# Frontend

Static web client for resume upload and the results dashboard: profile, recommended roles, gap
breakdown, JD match and feedback. It is built from **HTML + Bootstrap 5.3 + vanilla JavaScript**
(native ES modules), with no framework, no bundler and no build step. The files in `src/` are
exactly what the browser runs, so DevTools shows your own code, line for line.

Every screen calls the real backend (`backend/`) directly.

## Running it

The pages need to be served over HTTP, because browsers refuse to load ES modules from
`file://`. Any static server works; Python is already part of this repo's toolchain:

```bash
cd frontend
python3 -m http.server 4200 --directory src     # or: npm start (same command)
```

Open `http://localhost:4200/`. The app expects the backend at `http://localhost:8080`, which is
set in `src/js/config.js`. The backend only accepts browser calls from the origins in
`app.cors.allowed-origins` (default `http://localhost:4200`). If you serve the pages from a
different port (VS Code Live Server, for example, uses 5500), add that origin to
`CORS_ALLOWED_ORIGINS`.

In Docker Compose, the `frontend` service is plain nginx serving `src/` on port 4200
(`Dockerfile`, `nginx.conf`).

## Layout

```
src/
  index.html  login.html  register.html  upload.html  dashboard.html   one file per screen
  css/app.css                  the few styles Bootstrap has no class for
  js/
    config.js                  API_BASE_URL
    core/
      http.js                  every backend call goes through request(): JSON/FormData,
                               Bearer token, 204 → null, errors → ApiError, 401 → back to login
      session.js               JWT + user in localStorage; requireAuth() page guard
      api-error.js             ApiError, extractApiErrorMessage() for user-facing messages
      validation.js            form and file rules (mirror the backend's own checks)
      dom.js                   byId, show/hide, setText, cloneTemplate, setBusy, chips
    api/                       one module per backend controller
      auth-api.js  resume-api.js  recommendation-api.js  feedback-api.js
    components/header.js       the navbar (rendered into <header id="app-header">)
    pages/
      login.js  register.js  upload.js  dashboard.js    one script per HTML page
      dashboard-rules.js       dashboard tier/lock decisions (pure, unit-tested)
tests/                         node --test suites for the pure modules
```

### How a page works

Each HTML file contains all of its markup up front, with the optional sections marked `hidden`.
The page's script (`<script type="module" src="js/pages/<page>.js">`) then runs in four steps:

1. It calls `requireAuth()` on protected pages. A signed-out visitor is sent to `login.html`.
2. It calls `renderHeader()`.
3. It fetches data through the `api/` modules.
4. It fills the markup in and shows or hides sections.

Repeated items, such as recommendation cards and ATS checks, are cloned from `<template>`
elements in the HTML.

**Security rule:** anything that comes from the backend (resume text, skills, the AI coaching
narrative) is written with `textContent`, never `innerHTML`. A resume that contains `<script>`
is shown as text, not run.

## Debugging

- **Network tab.** Every API call is a `fetch` issued from `core/http.js`. Filter by
  `localhost:8080` to see the request, its `Authorization` header and the backend's JSON
  error body (`{ message, fieldErrors }`).
- **Sources tab.** Open `js/pages/<page>.js` and set a breakpoint. There is no transpilation,
  so you don't need source maps.
- **Session.** Go to Application → Local Storage → `http://localhost:4200`. The keys are
  `resumeAnalyser.auth.token` and `resumeAnalyser.auth.user`. Delete them to sign out. After
  an admin changes an account's role, reload the dashboard: it re-reads `GET /auth/me`.
- **Wrong element?** `byId()` throws `No element with id "…"` when the HTML and the script
  disagree on an id, so a typo shows up in the Console straight away.
- **Stale page after an edit?** Hard-reload (Ctrl+Shift+R). `python3 -m http.server` lets the
  browser cache files.

## Tests

The pure logic has unit tests: validation, error messages, the `http.js` request/401 handling
and the dashboard's lock and unlock rules. They run on Node's built-in test runner (Node 21 or
later), with no `npm install` needed:

```bash
cd frontend
npm test            # = node --test "tests/*.test.js"
```

`package.json` only exists to mark the `.js` files as ES modules for Node and to name these two
scripts. It has no dependencies.

DOM rendering is checked by hand in the browser. The flows to walk through are register/login,
upload, the dashboard in each tier and locked state, JD match, and feedback.
