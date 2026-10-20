import { refreshCurrentUser } from '../api/auth-api.js';
import { getFeedbackFor, submit as submitFeedback } from '../api/feedback-api.js';
import { getDashboard } from '../api/recommendation-api.js';
import { matchJobDescription, reanalyze } from '../api/resume-api.js';
import { extractApiErrorMessage } from '../core/api-error.js';
import { byId, cloneTemplate, field, hide, renderStickers, setBusy, setText, show } from '../core/dom.js';
import { readJson, writeJson } from '../core/local-store.js';
import { getUser, requireAuth } from '../core/session.js';
import { openBook } from '../components/book.js';
import { renderHeader, setChapter } from '../components/header.js';
import { celebrate, renderGutter, restart, say } from '../components/kite.js';
import {
  JD_MAX_CHARS,
  asPercent,
  canMatchJd,
  canUnlock,
  confidencePercent,
  engineLabel,
  isBudgetExhausted,
  isCommunityEdition,
  isLlmExplanation,
  isLocked,
  resetDate,
  showsAllowance,
} from './dashboard-rules.js';
import {
  CLOSE_MATCH,
  atsChange,
  describeChange,
  explanationBubbles,
  findNewMatches,
  formatScore,
  isStrongScore,
  jdLine,
  jdVerdict,
  meterSegments,
  omensLine,
  pathsLine,
  treasureLine,
} from './dashboard-story.js';

// Chapters 3 to 5, read as a sideways book.
// - The Omens: detected job domain, the ATS power meter and its checks, Kite's coaching notes.
// - Paths Ahead: ranked role matches with matched/missing skills and helpful/not-helpful
//   feedback (FR-10.1); matches this browser hasn't shown before carry a "New!" badge. When the
//   domain needs the AI engine and the analysis could not use it, a locked card whose wording
//   follows `lockReason` takes the matches' place.
// - The Treasure: the Premium JD match.
// The tier/lock decisions live in dashboard-rules.js and Kite's storytelling in
// dashboard-story.js; this file reads them and fills the DOM.

const CHAPTER_IDS = ['omens', 'paths', 'treasure'];
const LINES = { omens: omensLine, paths: pathsLine, treasure: treasureLine };

/** The chapter named in the address when the page opened; the book rewrites the hash. */
const startPage = location.hash.slice(1);

/** The dashboard currently on screen -- the re-analyse and JD-match handlers act on it. */
let dashboard = null;
let book = null;
let celebrated = false;

if (requireAuth()) {
  renderHeader('omens');
  renderGutter('Reading the omens. One moment, traveller.');
  init();
}

function init() {
  // The stored session's role goes stale after an admin upgrade; refresh it so the masthead's
  // tier is right. Errors are ignored -- the dashboard itself carries `userTier`.
  refreshCurrentUser().then(() => renderHeader(), () => undefined);

  book = openBook(byId('book'), { onTurn });

  byId('reanalyze-button').addEventListener('click', onReanalyze);
  byId('retry-button').addEventListener('click', () => loadDashboard(startPage));

  const jdText = byId('jd-text');
  jdText.maxLength = JD_MAX_CHARS;
  jdText.addEventListener('input', () => {
    byId('jd-match-button').disabled = jdText.value.trim() === '';
  });
  byId('jd-form').addEventListener('submit', onMatchJd);

  loadDashboard(startPage);
}

/** Kite follows the reader from chapter to chapter. */
function onTurn(page) {
  setChapter(page.dataset.chapter);
  const line = LINES[page.id];
  if (!dashboard || !line) {
    return;
  }
  say(line(dashboard));
  if (page.id === 'omens' && !celebrated && isStrongScore(dashboard.atsScore)) {
    celebrated = true;
    celebrate('YES!');
  }
}

async function loadDashboard(pageId) {
  showStatus('loading');
  try {
    dashboard = await getDashboard();
  } catch (error) {
    dashboard = null;
    showStatus('error', extractApiErrorMessage(error, 'Could not load your dashboard. Please try again.'));
    return;
  }

  if (!dashboard) {
    showStatus('empty');
    return;
  }

  renderDomain(dashboard);
  renderAtsScore(dashboard);
  renderCoaching(dashboard);
  if (isLocked(dashboard)) {
    hide(byId('recommendations-section'));
    renderLockedCard(dashboard);
  } else {
    hide(byId('locked-card'));
    renderRecommendations(dashboard);
  }
  renderJdCard(dashboard);
  showChapters(pageId);
}

/** Shows the status page alone: `loading`, `error` (with a message) or `empty` (no resume yet). */
function showStatus(state, message) {
  show(byId('loading'), state === 'loading');
  show(byId('load-error-panel'), state === 'error');
  show(byId('upload-prompt'), state === 'empty');
  if (state === 'error') {
    setText(byId('load-error'), message);
  }
  show(byId('status'));
  CHAPTER_IDS.forEach((id) => hide(byId(id)));
  book.refresh('status');

  if (state === 'loading') {
    say('Reading the omens. One moment, traveller.');
  } else if (state === 'error') {
    say("The ink smudged and I couldn't read your story. Try again in a moment.");
  } else {
    say('No map yet! Upload one and I will read the omens for you.');
  }
}

function showChapters(pageId) {
  hide(byId('status'));
  CHAPTER_IDS.forEach((id) => show(byId(id)));
  book.refresh(CHAPTER_IDS.includes(pageId) ? pageId : 'omens');
}

// ---------- The Omens ----------

function renderDomain(data) {
  const domain = data.domain;
  if (!domain) {
    hide(byId('domain-card'));
    return;
  }
  setText(byId('domain-name'), domain.name);
  setText(byId('domain-confidence'), `${confidencePercent(domain)}% sure`);
  setText(byId('domain-engine'), engineLabel(domain));
  setText(
    byId('domain-note'),
    domain.engine === 'local'
      ? 'Analysed in full on our own engine, as often as you like.'
      : 'Analysed with the AI engine.',
  );

  const allowance = byId('ai-allowance');
  if (showsAllowance(data)) {
    setText(
      allowance,
      `AI analyses: ${data.aiAllowance.used} of ${data.aiAllowance.quota} used this month · resets ${resetDate(data)}`,
    );
  }
  show(allowance, showsAllowance(data));
  show(byId('domain-card'));
}

function renderAtsScore(data) {
  const ats = data.atsScore;
  const score = formatScore(ats.score);
  const max = formatScore(ats.max_score);
  setText(byId('ats-score'), score);
  setText(byId('ats-max'), `/${max} ATS score`);

  const meter = byId('ats-meter');
  const lit = meterSegments(ats.score, ats.max_score);
  [...meter.children].forEach((segment, index) => segment.classList.toggle('on', index < lit));
  meter.setAttribute('aria-label', `${score} out of ${max}`);

  byId('ats-checks').replaceChildren(
    ...ats.checks.map((check) => {
      const row = cloneTemplate('ats-check-template');
      const status = field(row, 'status');
      setText(status, check.passed ? 'Pass' : 'Fix');
      status.classList.add(check.passed ? 'good' : 'bad');
      setText(field(row, 'detail'), check.detail);
      return row;
    }),
  );

  // How the score moved since the previous resume version this browser saw.
  const key = `resumeAnalyser.lastAts.${getUser()?.id}`;
  const { delta, record } = atsChange(readJson(key), data.resumeId, ats.score);
  writeJson(key, record);
  setText(byId('ats-change'), describeChange(delta));
  show(byId('ats-change'), delta !== null);
}

function renderCoaching(data) {
  const llm = isLlmExplanation(data);
  const badge = byId('coaching-badge');
  setText(badge, llm ? 'Premium AI coaching' : 'Standard');
  badge.classList.toggle('premium', llm);

  const bubbles = explanationBubbles(data.explanation);
  byId('explanation').replaceChildren(
    ...(bubbles.length > 0 ? bubbles : ['No notes this time.']).map((text) => {
      const bubble = document.createElement('p');
      bubble.className = 'bubble preserve-lines';
      bubble.textContent = text;
      return bubble;
    }),
  );
  show(byId('coaching-upgrade-hint'), !llm && data.userTier !== 'premium');
}

// ---------- Paths Ahead ----------

function renderLockedCard(data) {
  const domainName = data.domain?.name ?? 'this field';
  for (const element of document.querySelectorAll('#locked-card [data-field="domain-name"]')) {
    setText(element, domainName);
  }

  const community = isCommunityEdition(data);
  const budget = isBudgetExhausted(data);
  show(byId('locked-community'), community);
  show(byId('locked-budget'), budget);
  show(byId('locked-default'), !community && !budget);

  setText(byId('locked-quota'), String(data.aiAllowance?.quota ?? 3));
  const lockedAllowance = byId('locked-allowance');
  const showAllowanceLine = data.userTier === 'free' && !!data.aiAllowance;
  if (showAllowanceLine) {
    setText(
      lockedAllowance,
      `You've used ${data.aiAllowance.used} of ${data.aiAllowance.quota} free AI analyses this month. They reset on ${resetDate(data)}.`,
    );
  }
  show(lockedAllowance, showAllowanceLine);

  const unlockable = canUnlock(data);
  show(byId('unlock-section'), unlockable);
  if (unlockable) {
    setText(
      byId('unlock-message'),
      data.userTier === 'premium'
        ? 'Your account is Premium: re-run the analysis to unlock them.'
        : 'You have a free AI analysis left: re-run the analysis to unlock them.',
    );
  }
  show(byId('locked-upgrade-hint'), !unlockable && !community);

  show(byId('locked-card'));
}

function renderRecommendations(data) {
  const seenKey = `resumeAnalyser.seenRoles.${getUser()?.id}`;
  const { fresh, remember } = findNewMatches(data.recommendations, readJson(seenKey));
  writeJson(seenKey, remember);
  const freshIds = new Set(fresh.map((recommendation) => recommendation.recommendationId));

  byId('recommendations').replaceChildren(
    ...data.recommendations.map((recommendation) =>
      buildRecommendationCard(recommendation, freshIds.has(recommendation.recommendationId)),
    ),
  );
  show(byId('recommendations-empty'), data.recommendations.length === 0);
  show(byId('recommendations-section'));
}

function buildRecommendationCard(recommendation, isNew) {
  const card = cloneTemplate('recommendation-template');
  setText(field(card, 'title'), recommendation.role.title);
  setText(field(card, 'match'), String(asPercent(recommendation.matchScore)));
  setText(field(card, 'description'), recommendation.role.description);
  show(field(card, 'new'), isNew);

  renderStickers(field(card, 'matched'), recommendation.matchedSkills);
  show(field(card, 'matched-group'), recommendation.matchedSkills.length > 0);
  renderStickers(field(card, 'missing'), recommendation.missingSkills);
  show(field(card, 'missing-group'), recommendation.missingSkills.length > 0);

  field(card, 'vote').setAttribute('aria-label', `Was the ${recommendation.role.title} path helpful?`);
  const helpfulButton = field(card, 'helpful');
  const notHelpfulButton = field(card, 'not-helpful');
  const markSelected = (helpful) => {
    helpfulButton.setAttribute('aria-pressed', String(helpful === true));
    notHelpfulButton.setAttribute('aria-pressed', String(helpful === false));
  };

  const rate = async (helpful) => {
    try {
      const feedback = await submitFeedback(recommendation.recommendationId, helpful);
      markSelected(feedback.helpful);
      say(feedback.helpful ? 'Noted! I will keep roads like this one in view.' : 'Noted. Thanks for steering me.');
    } catch (error) {
      console.error('Could not save feedback', error);
    }
  };
  helpfulButton.addEventListener('click', () => rate(true));
  notHelpfulButton.addEventListener('click', () => rate(false));

  // Show the answer the candidate already gave, if any (204 → null → nothing selected).
  getFeedbackFor(recommendation.recommendationId).then(
    (feedback) => feedback && markSelected(feedback.helpful),
    (error) => console.error('Could not load existing feedback', error),
  );

  return card;
}

async function onReanalyze() {
  const button = byId('reanalyze-button');
  const errorLine = byId('reanalyze-error');
  if (!dashboard?.resumeId) {
    return;
  }
  hide(errorLine);
  setBusy(button, true, 'Re-analysing…');
  try {
    await reanalyze(dashboard.resumeId);
    setBusy(button, false);
    await loadDashboard('paths');
  } catch (error) {
    console.error('Re-analysis failed', error);
    setBusy(button, false);
    setText(errorLine, 'Could not re-analyse your resume right now. Please try again.');
    show(errorLine);
  }
}

// ---------- The Treasure ----------

function renderJdCard(data) {
  const available = canMatchJd(data);
  show(byId('jd-section'), available);
  show(byId('jd-upgrade-hint'), !available);
}

async function onMatchJd(event) {
  event.preventDefault();
  const textarea = byId('jd-text');
  const button = byId('jd-match-button');
  const errorLine = byId('jd-match-error');
  const text = textarea.value.trim();
  if (!dashboard?.resumeId || !text) {
    return;
  }

  hide(errorLine);
  setBusy(button, true, 'Matching…');
  textarea.disabled = true;
  say('Unrolling the map. Let me measure the distance.');
  try {
    renderJdResult(await matchJobDescription(dashboard.resumeId, text));
  } catch (error) {
    setText(
      errorLine,
      extractApiErrorMessage(error, 'Could not match your resume to that job description right now.'),
    );
    show(errorLine);
    say(treasureLine(dashboard));
  } finally {
    setBusy(button, false);
    textarea.disabled = false;
  }
}

function renderJdResult(match) {
  setText(byId('jd-score'), `${asPercent(match.score)}%`);
  setText(byId('jd-verdict'), jdVerdict(match.score));
  setText(byId('jd-coverage'), `${asPercent(match.coverage)}%`);
  setText(byId('jd-similarity'), `${asPercent(match.similarity)}%`);
  setText(byId('jd-closest'), match.closestRole?.title ?? '');
  show(byId('jd-closest-group'), !!match.closestRole);

  renderStickers(byId('jd-matched'), match.matchedSkills);
  show(byId('jd-matched-group'), match.matchedSkills.length > 0);
  renderStickers(byId('jd-missing'), match.missingSkills);
  show(byId('jd-missing-group'), match.missingSkills.length > 0);

  setText(byId('jd-explanation'), match.explanation);
  show(byId('jd-explanation'), !!match.explanation);

  hide(byId('jd-placeholder'));
  show(byId('jd-result'));
  restart(byId('jd-score'), 'bump');
  say(jdLine(match));
  if (match.score >= CLOSE_MATCH) {
    celebrate('TREASURE!');
  }
}
