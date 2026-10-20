import { clearSession, getUser } from '../core/session.js';
import { tierLabel } from '../pages/dashboard-rules.js';
import { installArt } from './art.js';

// The masthead: the logo, the chapter tabs (Kite perches over the chapter being read) and the
// signed-in account. Chapters past The Call need an account, so a signed-out reader sees their
// tabs greyed out.

export const CHAPTERS = [
  { id: 'cover', label: 'Cover', title: 'Cover', href: 'index.html', needsAccount: false },
  { id: 'call', label: 'Call', title: 'Chapter 1: The Call', href: 'login.html', needsAccount: false },
  { id: 'map', label: 'Map', title: 'Chapter 2: The Map', href: 'upload.html', needsAccount: true },
  { id: 'omens', label: 'Omens', title: 'Chapter 3: The Omens', href: 'dashboard.html#omens', needsAccount: true },
  { id: 'paths', label: 'Paths', title: 'Chapter 4: Paths Ahead', href: 'dashboard.html#paths', needsAccount: true },
  { id: 'treasure', label: 'Treasure', title: 'Chapter 5: The Treasure', href: 'dashboard.html#treasure', needsAccount: true },
];

let currentChapter = 'cover';

/**
 * Renders the masthead into `<header id="app-header">` with Kite over the tab of `chapterId`.
 * Call again after the stored user changes (e.g. after `GET /auth/me`) to refresh the tier.
 */
export function renderHeader(chapterId = currentChapter) {
  installArt();
  currentChapter = chapterId;
  const header = document.getElementById('app-header');
  const user = getUser();

  // The static markup below contains no user data; the email and tier go in afterwards with
  // textContent.
  header.innerHTML = `
    <a class="logo" href="index.html">Smart Resume Analyser</a>
    <span class="issue">Issue #1</span>
    <nav class="chapter-map" aria-label="Chapters">
      ${CHAPTERS.map((chapter) => chapterLink(chapter, !user && chapter.needsAccount)).join('')}
    </nav>
    <div class="account">${user ? signedInAccount() : signedOutAccount()}</div>`;

  if (user) {
    header.querySelector('[data-field="email"]').textContent = user.email;
    const tier = header.querySelector('[data-field="tier"]');
    tier.textContent = tierLabel(user.role);
    tier.classList.toggle('premium', user.role !== 'USER');
    header.querySelector('[data-action="logout"]').addEventListener('click', () => {
      clearSession();
      location.href = 'login.html';
    });
  }
  setChapter(chapterId);
}

/** Moves Kite to the tab of `chapterId`, e.g. as the dashboard's pages turn. */
export function setChapter(chapterId) {
  currentChapter = chapterId;
  for (const tab of document.querySelectorAll('#app-header [data-chapter]')) {
    if (tab.dataset.chapter === chapterId) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
}

function chapterLink(chapter, locked) {
  const kite = '<svg class="mini-hawk" aria-hidden="true" focusable="false"><use href="#hawk"></use></svg>';
  if (locked) {
    return `
      <span class="chapter-link" data-chapter="${chapter.id}" aria-disabled="true" title="${chapter.title}: sign in to open it">
        ${kite}<span>${chapter.label}</span><span class="sr-only">(sign in first)</span>
      </span>`;
  }
  return `
    <a class="chapter-link" data-chapter="${chapter.id}" href="${chapter.href}" title="${chapter.title}">
      ${kite}<span>${chapter.label}</span>
    </a>`;
}

function signedInAccount() {
  return `
    <span class="who" data-field="email"></span>
    <span class="chip" data-field="tier"></span>
    <button type="button" class="btn small" data-action="logout">Log out</button>`;
}

function signedOutAccount() {
  return `<a class="btn small" href="login.html">Sign in</a>`;
}
