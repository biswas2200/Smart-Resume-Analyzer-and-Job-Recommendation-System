import { clearSession, getUser } from '../core/session.js';
import { tierLabel } from '../pages/dashboard-rules.js';

/**
 * Renders the app-wide Bootstrap navbar into `<header id="app-header">`. Shows sign-in /
 * create-account links when signed out, or the user's email, tier badge, the main feature
 * links and a logout button when signed in. Call again after the stored user changes (e.g.
 * after `GET /auth/me`) to refresh the tier badge.
 */
export function renderHeader() {
  const header = document.getElementById('app-header');
  const user = getUser();
  const currentPage = location.pathname.split('/').pop() || 'index.html';

  // The static markup below contains no user data; the email and role are filled in
  // afterwards with textContent.
  header.innerHTML = `
    <nav class="navbar navbar-expand-md bg-body border-bottom" aria-label="Main navigation">
      <div class="container">
        <a class="navbar-brand fw-semibold" href="index.html">Smart Resume Analyser</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                data-bs-target="#main-nav" aria-controls="main-nav" aria-expanded="false"
                aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse justify-content-end" id="main-nav">
          <ul class="navbar-nav align-items-md-center gap-md-2">
            ${user ? signedInLinks() : signedOutLinks()}
          </ul>
        </div>
      </div>
    </nav>`;

  for (const link of header.querySelectorAll('a.nav-link')) {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  }

  if (user) {
    header.querySelector('[data-field="email"]').textContent = user.email;
    const badge = header.querySelector('[data-field="tier"]');
    badge.textContent = tierLabel(user.role);
    badge.classList.add(user.role === 'USER' ? 'text-bg-light' : 'text-bg-primary');
    header.querySelector('[data-action="logout"]').addEventListener('click', () => {
      clearSession();
      location.href = 'login.html';
    });
  }
}

function signedInLinks() {
  return `
    <li class="nav-item"><a class="nav-link" href="dashboard.html">Dashboard</a></li>
    <li class="nav-item"><a class="nav-link" href="upload.html">Upload Resume</a></li>
    <li class="nav-item navbar-text small" data-field="email"></li>
    <li class="nav-item"><span class="badge rounded-pill border" data-field="tier"></span></li>
    <li class="nav-item">
      <button type="button" class="btn btn-outline-secondary btn-sm" data-action="logout">Log out</button>
    </li>`;
}

function signedOutLinks() {
  return `
    <li class="nav-item"><a class="nav-link" href="login.html">Sign in</a></li>
    <li class="nav-item"><a class="nav-link" href="register.html">Create account</a></li>`;
}
