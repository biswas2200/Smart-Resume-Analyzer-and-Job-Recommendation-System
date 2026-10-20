# Frontend

Static web client for resume upload and the results dashboard: profile, recommended roles, gap
breakdown, JD match and feedback. It is built from **HTML, one hand-written stylesheet and vanilla
JavaScript** (native ES modules), with no framework, no bundler and no build step. The files in
`src/` are exactly what the browser runs, so DevTools shows your own code, line for line.

The look is a comic book, and the app reads as a journey in chapters: the Cover (`index.html`),
The Call (sign in or register), The Map (upload), then The Omens, Paths Ahead and The Treasure
(the dashboard). Kite, a paper hawk, guides the reader from the gutter at the foot of each page.
The tabs in the masthead are the chapter navigation, and Kite perches over the current one. On the
story pages (the cover and the dashboard), scrolling down turns the page sideways. **Quiet mode**
(the gutter's toggle, or the system's reduced-motion setting when no choice was made) stops all
motion and stacks the chapters top to bottom. All the art is original SVG and CSS, and the fonts
are Bangers and Comic Neue from Google Fonts.

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
  index.html                   the Cover: a two-page story page (cover, what's inside)
  login.html  register.html    Chapter 1, The Call
  upload.html                  Chapter 2, The Map
  dashboard.html               Chapters 3-5, a story page: The Omens, Paths Ahead, The Treasure
  favicon.svg  favicon.ico  apple-touch-icon.png    Kite on a yellow comic disc
  css/app.css                  every style: colour tokens (light and dark), panels, Kite, quiet mode
  js/
    config.js                  API_BASE_URL
    quiet-mode.js              classic <head> script: sets html[data-motion="off"] before first paint
    core/
      http.js                  every backend call goes through request(): JSON/FormData,
                               Bearer token, 204 → null, errors → ApiError, 401 → back to login
      session.js               JWT + user in localStorage; requireAuth() page guard
      api-error.js             ApiError, extractApiErrorMessage() for user-facing messages
      validation.js            form and file rules (mirror the backend's own checks)
      dom.js                   byId, show/hide, setText, cloneTemplate, setBusy, stickers
      local-store.js           try/catch JSON localStorage for the small per-browser memories
    api/                       one module per backend controller
      auth-api.js  resume-api.js  recommendation-api.js  feedback-api.js
    components/
      header.js                the masthead: logo, chapter tabs, account
      kite.js                  the gutter: Kite's speech bubble, glide/celebrate, quiet-mode toggle
      book.js                  the sideways page-turning book on the story pages
      art.js                   the SVG sprite: Kite, the resume page, the padlock
      signed-in.js             The Call's "already signed in" panel
    pages/
      cover.js  login.js  register.js  upload.js  dashboard.js    one script per HTML page
      dashboard-rules.js       dashboard tier/lock decisions (pure, unit-tested)
      dashboard-story.js       Kite's lines, the power meter, new matches, ATS change (pure, unit-tested)
tests/                         node --test suites for the pure modules
```

### How a page works

Each HTML file contains all of its markup up front, with the optional sections marked `hidden`.
The page's script (`<script type="module" src="js/pages/<page>.js">`) then runs in four steps:

1. It calls `requireAuth()` on protected pages. A signed-out visitor is sent to `login.html`.
2. It calls `renderHeader(chapter)` and `renderGutter(line)`; a story page also calls `openBook()`.
3. It fetches data through the `api/` modules.
4. It fills the markup in and shows or hides sections, and Kite says something about it.

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
- **Per-browser memories.** `resumeAnalyser.motion` (quiet mode: `on`/`off`),
  `resumeAnalyser.seenRoles.<userId>` (roles already shown, so new ones get a "New!" badge in
  Paths Ahead) and `resumeAnalyser.lastAts.<userId>` (the "Up 7 since your last map" line). Losing them
  only loses that polish.
- **Wrong element?** `byId()` throws `No element with id "…"` when the HTML and the script
  disagree on an id, so a typo shows up in the Console straight away.
- **Stale page after an edit?** Hard-reload (Ctrl+Shift+R). `python3 -m http.server` lets the
  browser cache files.

## Tests

The pure logic has unit tests: validation, error messages, the `http.js` request/401 handling,
the dashboard's lock and unlock rules, and its storytelling (Kite's lines, the power meter, new
matches, the ATS change). They run on Node's built-in test runner (Node 21 or
later), with no `npm install` needed:

```bash
cd frontend
npm test            # = node --test "tests/*.test.js"
```

`package.json` only exists to mark the `.js` files as ES modules for Node and to name these two
scripts. It has no dependencies.

DOM rendering is checked by hand in the browser. The flows to walk through are register/login,
upload, the dashboard in each tier and locked state, JD match, and feedback, each in light and
dark mode, at phone width, and in quiet mode.
