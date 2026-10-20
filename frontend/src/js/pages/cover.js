import { isAuthenticated } from '../core/session.js';
import { byId, setText } from '../core/dom.js';
import { openBook } from '../components/book.js';
import { renderHeader } from '../components/header.js';
import { renderGutter, say } from '../components/kite.js';

// The cover: the landing page, read as a two-page book (the cover, then what's inside this
// issue). For a signed-in reader the calls to action open their own story instead.

const signedIn = isAuthenticated();

const lines = signedIn
  ? {
      cover: 'Welcome back, traveller. Your story is right where you left it.',
      contents: 'Five chapters, one journey. Turn to the Omens to see where yours stands.',
    }
  : {
      cover: "Hi, I'm Kite. Scroll down and I'll show you what's inside.",
      contents: 'Five chapters, one journey, and most of it is free. Ready?',
    };

renderHeader('cover');
renderGutter(lines.cover);

if (signedIn) {
  byId('cover-start').href = 'dashboard.html';
  byId('contents-start').href = 'dashboard.html';
  for (const label of document.querySelectorAll('[data-field="start-label"]')) {
    setText(label, 'Open your story!');
  }
  const second = byId('cover-second');
  second.href = 'upload.html';
  setText(second, 'Upload a new version');
}

openBook(byId('book'), { onTurn: (page) => say(lines[page.id]) });
