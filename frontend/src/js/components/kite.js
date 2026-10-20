import { KITE_SVG, installArt } from './art.js';

// Kite, the paper hawk, lives in the gutter at the foot of every page. It perches beside a
// speech bubble, glides across when a page turns and loops when the reader scores well. The
// gutter also holds the book's pager (book.js shows it on the story pages) and the quiet-mode
// toggle. In quiet mode Kite only perches and nothing on the page moves.

const MOTION_KEY = 'resumeAnalyser.motion';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let guide = null;
let bubble = null;
let sfx = null;
let speedLines = null;

/**
 * Fills `<footer id="app-gutter">` with Kite, its first line and the quiet-mode toggle.
 * The markup is static; Kite's lines go in with textContent.
 */
export function renderGutter(line) {
  installArt();
  const gutter = document.getElementById('app-gutter');
  gutter.innerHTML = `
    <div class="guide">
      ${KITE_SVG}
      <p class="bubble" data-field="line"></p>
    </div>
    <div class="pager" hidden>
      <button class="btn" type="button" data-action="prev">Back</button>
      <p class="counter" data-field="counter"></p>
      <button class="btn primary" type="button" data-action="next">Next</button>
    </div>
    <div class="gutter-end">
      <button class="btn small" type="button" data-action="quiet"
              title="Kite stays perched and the chapters read top to bottom">Quiet mode</button>
      <p class="hint" data-field="hint" hidden></p>
    </div>`;

  guide = gutter.querySelector('.guide');
  bubble = gutter.querySelector('[data-field="line"]');
  say(line);

  const toggle = gutter.querySelector('[data-action="quiet"]');
  const showToggle = () => toggle.setAttribute('aria-pressed', String(isQuiet()));
  toggle.addEventListener('click', () => {
    setQuiet(!isQuiet());
    try {
      localStorage.setItem(MOTION_KEY, isQuiet() ? 'off' : 'on');
    } catch {
      // Storage blocked: the choice lasts until the next page.
    }
  });
  document.addEventListener('motionchange', showToggle);
  showToggle();
}

/** Kite's speech bubble. */
export function say(text) {
  bubble.textContent = text;
}

export function isQuiet() {
  return document.documentElement.dataset.motion === 'off';
}

/** Kite flies across the page as it turns. */
export function glide() {
  play(guide, 'glide', 'celebrate');
}

/** Kite loops the loop, with a shout: a strong score, a close job match. */
export function celebrate(word) {
  play(guide, 'celebrate', 'glide');
  shout(word);
}

/** A comic sound effect, big across the middle of the screen. */
export function shout(word) {
  sfx ??= effectLayer('p', 'sfx');
  sfx.textContent = word;
  play(sfx, 'pop');
}

/** Motion lines streaking past, for a page turn. */
export function streak() {
  speedLines ??= effectLayer('div', 'speedlines');
  play(speedLines, 'go');
}

/** Re-runs a one-shot CSS animation, even if it is still playing. */
export function restart(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function play(element, className, replaces) {
  if (isQuiet()) {
    return;
  }
  if (replaces) {
    element.classList.remove(replaces);
  }
  restart(element, className);
}

function effectLayer(tag, className) {
  const element = document.createElement(tag);
  element.className = className;
  element.setAttribute('aria-hidden', 'true');
  document.body.append(element);
  return element;
}

function setQuiet(quiet) {
  if (quiet) {
    document.documentElement.dataset.motion = 'off';
  } else {
    delete document.documentElement.dataset.motion;
  }
  document.dispatchEvent(new Event('motionchange'));
}

// Without a choice of the reader's own, follow the system setting when it changes.
reducedMotion.addEventListener('change', (event) => {
  let choice = null;
  try {
    choice = localStorage.getItem(MOTION_KEY);
  } catch {
    // Storage blocked: treat as no choice.
  }
  if (!choice) {
    setQuiet(event.matches);
  }
});
