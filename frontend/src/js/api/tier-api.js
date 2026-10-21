import { get } from '../core/http.js';

// Backed by com.resumeanalyser.account.TierController (public, no sign-in needed).

/** `GET /tiers`: `{ previewMode }` — true while Premium is free for everyone (the 0.x preview). */
export function getTierInfo() {
  return get('/tiers');
}
