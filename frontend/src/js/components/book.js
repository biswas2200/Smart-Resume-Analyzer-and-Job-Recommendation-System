import { glide, isQuiet, restart, shout, streak } from './kite.js';

// The sideways book on the story pages (the cover and the dashboard). Scrolling down turns the
// page: a long page scrolls to its end first, then a fresh scroll gesture turns it, so the
// momentum of one flick never skips a page. Swipes, the arrow keys, the gutter's pager and
// links to "#<page id>" turn it too. In quiet mode the pages simply stack top to bottom.

const TURN_WORDS = ['WHOOSH!', 'ONWARD!', 'FLAP!', 'SWOOSH!'];
const HINT = 'Scroll down, swipe or use the arrow keys to turn the page.';
const QUIET_HINT = 'Quiet mode: the chapters run top to bottom.';

/**
 * Opens `<main class="book">` at the page named in the URL hash. Each visible
 * `<section class="page" data-title="…">` is one page; call `refresh()` after showing or
 * hiding one. `onTurn(page)` runs whenever a page becomes the current one.
 */
export function openBook(book, { onTurn = () => {} } = {}) {
  const gutter = document.getElementById('app-gutter');
  const pager = gutter.querySelector('.pager');
  const prevButton = pager.querySelector('[data-action="prev"]');
  const nextButton = pager.querySelector('[data-action="next"]');
  const counter = gutter.querySelector('[data-field="counter"]');
  const hint = gutter.querySelector('[data-field="hint"]');
  const announcer = document.createElement('p');
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  document.body.append(announcer);

  let pages = [];
  let current = 0;
  let turns = 0;

  const vertical = isQuiet;
  const turnable = () => !vertical() && pages.length > 1;
  const canScroll = (element, down) =>
    down ? element.scrollTop + element.clientHeight < element.scrollHeight - 2 : element.scrollTop > 2;

  function setCurrent(index, { announce = true } = {}) {
    current = index;
    const page = pages[index];
    pager.hidden = pages.length < 2;
    hint.hidden = pages.length < 2;
    hint.textContent = vertical() ? QUIET_HINT : HINT;
    const name = document.createElement('span');
    name.className = 'counter-name';
    name.textContent = ` · ${page.dataset.title.replace(/^The /, '')}`;
    counter.replaceChildren(`${index + 1} / ${pages.length}`, name);
    prevButton.disabled = index === 0;
    nextButton.disabled = index === pages.length - 1;
    pages.forEach((other, k) => {
      other.inert = !vertical() && k !== index; // Tab stays on the page being read
      if (k !== index) {
        other.classList.remove('arrive');
      }
    });
    restart(page, 'arrive');
    if (announce) {
      announcer.textContent = page.getAttribute('aria-label');
    }
    try {
      history.replaceState(null, '', `#${page.id}`);
    } catch {
      // Sandboxed preview: the address just doesn't follow along.
    }
    onTurn(page);
  }

  /** Puts page `index` on screen at once, with no turn effects. */
  function align(index) {
    if (vertical()) {
      book.scrollTop = pages[index].offsetTop;
    } else {
      book.scrollLeft = pages[index].offsetLeft;
    }
  }

  function turnEffects() {
    if (vertical()) {
      return;
    }
    shout(TURN_WORDS[turns++ % TURN_WORDS.length]);
    streak();
    glide();
  }

  // fromEnd: arriving by scrolling back up shows the end of the earlier page.
  function goTo(index, fromEnd = false) {
    index = Math.max(0, Math.min(pages.length - 1, index));
    if (vertical()) {
      book.scrollTo({ top: pages[index].offsetTop });
      setCurrent(index);
      return;
    }
    if (index === current) {
      return;
    }
    pages[index].scrollTop = fromEnd ? pages[index].scrollHeight : 0;
    book.scrollTo({ left: pages[index].offsetLeft, behavior: 'smooth' });
    turnEffects();
    setCurrent(index);
  }

  /** Re-reads which pages are showing and opens the one with id `pageId` (else stays put). */
  function refresh(pageId) {
    pages = [...book.querySelectorAll(':scope > .page:not([hidden])')];
    let index = pageId ? pages.findIndex((page) => page.id === pageId) : -1;
    if (index < 0) {
      index = Math.min(current, pages.length - 1);
    }
    align(index);
    setCurrent(index, { announce: false });
  }

  // Wheel: scroll the page to its end first, then a fresh gesture turns it.
  let lastWheel = 0;
  let wheelSum = 0;
  let gesture = 'fresh'; // fresh | scrolled | turned
  const innerScroller = (element, down, page) => {
    for (; element instanceof Element && element !== page && element !== book; element = element.parentElement) {
      const scrolls = element.tagName === 'TEXTAREA' || /auto|scroll/.test(getComputedStyle(element).overflowY);
      if (scrolls && element.scrollHeight > element.clientHeight + 2 && canScroll(element, down)) {
        return element;
      }
    }
    return null;
  };
  addEventListener('wheel', (event) => {
    if (!turnable() || event.ctrlKey) {
      return;
    }
    const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    if (Math.abs(event.deltaX) > Math.abs(dy)) {
      return; // sideways swipes move the strip natively
    }
    const now = performance.now();
    if (now - lastWheel > 250) {
      wheelSum = 0;
      gesture = 'fresh';
    }
    lastWheel = now;
    if (gesture === 'turned') {
      event.preventDefault();
      return;
    }
    const down = dy > 0;
    const page = pages[current];
    if (innerScroller(event.target, down, page)) {
      gesture = 'scrolled';
      return;
    }
    if (canScroll(page, down)) {
      gesture = 'scrolled';
      if (!page.contains(event.target)) {
        event.preventDefault();
        page.scrollBy(0, dy);
      }
      return;
    }
    event.preventDefault();
    if (gesture === 'scrolled') {
      return;
    }
    wheelSum += dy;
    if (Math.abs(wheelSum) < 40) {
      return;
    }
    gesture = 'turned';
    goTo(current + (down ? 1 : -1), !down);
  }, { passive: false });

  // Swipes and quiet-mode scrolling move the book themselves; follow along once it rests.
  let settleTimer = 0;
  function settle() {
    if (pages.length === 0) {
      return;
    }
    let index;
    if (vertical()) {
      // Scrolled to the bottom means the last page, even when it is too short to reach the top.
      const atEnd = book.scrollTop + book.clientHeight >= book.scrollHeight - 2;
      index = atEnd
        ? pages.length - 1
        : pages.reduce((best, page, k) => (page.offsetTop <= book.scrollTop + 80 ? k : best), 0);
    } else {
      index = Math.round(book.scrollLeft / book.clientWidth);
    }
    index = Math.max(0, Math.min(pages.length - 1, index));
    if (index !== current) {
      turnEffects();
      setCurrent(index);
    }
  }
  book.addEventListener('scroll', () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 150);
  });
  if ('onscrollend' in window) {
    book.addEventListener('scrollend', settle);
  }

  // Touch: a swipe up that starts at the end of a page turns it.
  let touch = null;
  book.addEventListener('touchstart', (event) => {
    const page = pages[current];
    touch = !turnable() || event.touches.length > 1
      ? null
      : {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          atTop: !canScroll(page, false),
          atEnd: !canScroll(page, true),
        };
  }, { passive: true });
  book.addEventListener('touchend', (event) => {
    if (!touch) {
      return;
    }
    const dx = event.changedTouches[0].clientX - touch.x;
    const dy = event.changedTouches[0].clientY - touch.y;
    if (Math.abs(dy) > 60 && Math.abs(dy) > 2 * Math.abs(dx)) {
      if (dy < 0 && touch.atEnd) {
        goTo(current + 1);
      }
      if (dy > 0 && touch.atTop) {
        goTo(current - 1, true);
      }
    }
    touch = null;
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (!turnable() || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.target.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    const keys = {
      ArrowRight: current + 1,
      PageDown: current + 1,
      ArrowLeft: current - 1,
      PageUp: current - 1,
      Home: 0,
      End: pages.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) {
      return;
    }
    event.preventDefault();
    goTo(target);
  });

  // Links to a page of this book (the chapter tabs, "see inside") turn to it instead of reloading.
  const samePath = (path) => path.replace(/\/index\.html$/, '/');
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href*="#"]');
    if (!link || event.defaultPrevented) {
      return;
    }
    const url = new URL(link.href);
    if (samePath(url.pathname) !== samePath(location.pathname)) {
      return;
    }
    const index = pages.findIndex((page) => `#${page.id}` === url.hash);
    if (index >= 0) {
      event.preventDefault();
      goTo(index);
    }
  });
  prevButton.addEventListener('click', () => goTo(current - 1));
  nextButton.addEventListener('click', () => goTo(current + 1));

  new ResizeObserver(() => {
    if (pages.length > 0 && !vertical()) {
      book.scrollLeft = pages[current].offsetLeft;
    }
  }).observe(book);
  document.addEventListener('motionchange', () => {
    align(current);
    setCurrent(current, { announce: false });
  });

  refresh(location.hash.slice(1));
  return { goTo, refresh, current: () => pages[current] };
}
