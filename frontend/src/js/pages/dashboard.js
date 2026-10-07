import { refreshCurrentUser } from '../api/auth-api.js';
import { getFeedbackFor, submit as submitFeedback } from '../api/feedback-api.js';
import { getDashboard } from '../api/recommendation-api.js';
import { matchJobDescription, reanalyze } from '../api/resume-api.js';
import { extractApiErrorMessage } from '../core/api-error.js';
import { byId, cloneTemplate, field, hide, renderSkillChips, setBusy, setText, show } from '../core/dom.js';
import { requireAuth } from '../core/session.js';
import { renderHeader } from '../components/header.js';
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

// Recommendation dashboard: detected job domain, ATS score breakdown, coaching notes, ranked
// role matches with matched/missing skills and helpful/not-helpful feedback (FR-10.1), and the
// Premium JD match. When the domain needs the AI engine and the analysis could not use it, the
// role list is replaced by a locked card whose wording follows `lockReason`. All the
// tier/lock decisions live in dashboard-rules.js; this file only reads them and fills the DOM.

/** The dashboard currently on screen — the re-analyse and JD-match handlers act on it. */
let dashboard = null;

if (requireAuth()) {
  renderHeader();
  init();
}

function init() {
  // The stored session's role goes stale after an admin upgrade; refresh it so the header
  // badge is right. Errors are ignored -- the dashboard itself carries `userTier`.
  refreshCurrentUser().then(renderHeader, () => undefined);

  byId('reanalyze-button').addEventListener('click', onReanalyze);

  const jdText = byId('jd-text');
  jdText.maxLength = JD_MAX_CHARS;
  jdText.addEventListener('input', () => {
    byId('jd-match-button').disabled = jdText.value.trim() === '';
  });
  byId('jd-match-button').addEventListener('click', onMatchJd);

  loadDashboard();
}

async function loadDashboard() {
  try {
    dashboard = await getDashboard();
  } catch (error) {
    hide(byId('loading'));
    setText(byId('load-error'), extractApiErrorMessage(error, 'Could not load your dashboard. Please try again.'));
    show(byId('load-error'));
    return;
  }

  hide(byId('loading'));
  if (!dashboard) {
    show(byId('upload-prompt'));
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
  show(byId('dashboard-content'));
}

function renderDomain(data) {
  const domain = data.domain;
  if (!domain) {
    hide(byId('domain-card'));
    return;
  }
  setText(byId('domain-name'), domain.name);
  setText(byId('domain-confidence'), `${confidencePercent(domain)}% confidence`);

  const engine = byId('domain-engine');
  setText(engine, engineLabel(domain));
  engine.classList.toggle('text-bg-success', domain.engine === 'local');
  engine.classList.toggle('text-bg-primary', domain.engine === 'llm');

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
  setText(byId('ats-score'), `${ats.score} / ${ats.max_score}`);
  byId('ats-checks').replaceChildren(
    ...ats.checks.map((check) => {
      const row = cloneTemplate('ats-check-template');
      const name = field(row, 'name');
      setText(name, `${check.passed ? '✓' : '✗'} ${check.name}`);
      name.classList.add(check.passed ? 'text-success' : 'text-danger');
      setText(field(row, 'detail'), check.detail);
      return row;
    }),
  );
}

function renderCoaching(data) {
  const llm = isLlmExplanation(data);
  const badge = byId('coaching-badge');
  setText(badge, llm ? 'Premium AI coaching' : 'Standard');
  badge.className = `badge rounded-pill align-middle ms-2 ${llm ? 'text-bg-primary' : 'text-bg-light border'}`;
  setText(byId('explanation'), data.explanation);
  show(byId('coaching-upgrade-hint'), !llm);
}

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
      `You've used ${data.aiAllowance.used} of ${data.aiAllowance.quota} free AI analyses this month — they reset on ${resetDate(data)}.`,
    );
  }
  show(lockedAllowance, showAllowanceLine);

  const unlockable = canUnlock(data);
  show(byId('unlock-section'), unlockable);
  if (unlockable) {
    setText(
      byId('unlock-message'),
      data.userTier === 'premium'
        ? 'Your account is Premium — re-run the analysis to unlock them.'
        : 'You have a free AI analysis left — re-run the analysis to unlock them.',
    );
  }
  show(byId('locked-upgrade-hint'), !unlockable && !community);

  show(byId('locked-card'));
}

function renderRecommendations(data) {
  byId('recommendations').replaceChildren(...data.recommendations.map(buildRecommendationCard));
  show(byId('recommendations-section'));
}

function buildRecommendationCard(recommendation) {
  const card = cloneTemplate('recommendation-template');
  setText(field(card, 'title'), recommendation.role.title);
  setText(field(card, 'match'), `${asPercent(recommendation.matchScore)}% match`);
  setText(field(card, 'description'), recommendation.role.description);

  renderSkillChips(field(card, 'matched'), recommendation.matchedSkills, 'matched');
  show(field(card, 'matched-group'), recommendation.matchedSkills.length > 0);
  renderSkillChips(field(card, 'missing'), recommendation.missingSkills, 'missing');
  show(field(card, 'missing-group'), recommendation.missingSkills.length > 0);

  const helpfulButton = field(card, 'helpful');
  const notHelpfulButton = field(card, 'not-helpful');
  const markSelected = (helpful) => {
    setSelected(helpfulButton, helpful === true);
    setSelected(notHelpfulButton, helpful === false);
  };

  const rate = async (helpful) => {
    try {
      const feedback = await submitFeedback(recommendation.recommendationId, helpful);
      markSelected(feedback.helpful);
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

function setSelected(button, selected) {
  button.classList.toggle('btn-primary', selected);
  button.classList.toggle('btn-outline-primary', !selected);
  button.setAttribute('aria-pressed', String(selected));
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
    hide(byId('dashboard-content'));
    show(byId('loading'));
    await loadDashboard();
  } catch (error) {
    console.error('Re-analysis failed', error);
    setBusy(button, false);
    setText(errorLine, 'Could not re-analyse your resume right now. Please try again.');
    show(errorLine);
  }
}

function renderJdCard(data) {
  const available = canMatchJd(data);
  show(byId('jd-form'), available);
  show(byId('jd-upgrade-hint'), !available);
}

async function onMatchJd() {
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
  try {
    renderJdResult(await matchJobDescription(dashboard.resumeId, text));
  } catch (error) {
    setText(
      errorLine,
      extractApiErrorMessage(error, 'Could not match your resume to that job description right now.'),
    );
    show(errorLine);
  } finally {
    setBusy(button, false);
    textarea.disabled = false;
  }
}

function renderJdResult(match) {
  setText(byId('jd-score'), `${asPercent(match.score)}% match`);

  let components =
    `covers ${asPercent(match.coverage)}% of the recognised requirements · ` +
    `${asPercent(match.similarity)}% skill similarity`;
  if (match.closestRole) {
    components += ` · reads like ${match.closestRole.title}`;
  }
  setText(byId('jd-components'), components);

  renderSkillChips(byId('jd-matched'), match.matchedSkills, 'matched');
  show(byId('jd-matched-group'), match.matchedSkills.length > 0);
  renderSkillChips(byId('jd-missing'), match.missingSkills, 'missing');
  show(byId('jd-missing-group'), match.missingSkills.length > 0);

  setText(byId('jd-explanation'), match.explanation);
  show(byId('jd-result'));
}
