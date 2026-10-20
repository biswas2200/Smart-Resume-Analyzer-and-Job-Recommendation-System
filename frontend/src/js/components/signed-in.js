import { byId, hide, setText, show } from '../core/dom.js';
import { clearSession, getUser, isAuthenticated } from '../core/session.js';

/**
 * The Call's pages (sign in, create account) opened by a reader who is already signed in:
 * swaps the form for a panel that offers to continue the story or to switch accounts.
 * Returns true when the panel was shown.
 */
export function offerToContinue(form) {
  if (!isAuthenticated()) {
    return false;
  }
  hide(form);
  setText(byId('signed-in-email'), getUser().email);
  byId('switch-account').addEventListener('click', () => {
    clearSession();
    location.reload();
  });
  show(byId('signed-in'));
  return true;
}
