import { approveBugReport, getBugReports, linkBugReport, rejectBugReport } from '../api/bug-report-api.js';
import { extractApiErrorMessage } from '../core/api-error.js';
import { byId, cloneTemplate, field, setBusy, setText, show } from '../core/dom.js';
import { getUser, requireAuth } from '../core/session.js';
import { hydrateIcons } from '../components/icons.js';
import { renderShell } from '../components/shell.js';
import { STATUSES, safeIssueUrl, suggestTitle } from './bug-report-rules.js';

// The admin review queue for bug reports. A report reaches GitHub only from here: approve
// (new issue), link (existing issue), or reject (stays private). The backend checks ADMIN.

const EMPTY_TEXT = {
  PENDING: 'No reports waiting for review.',
  APPROVED: 'No reports have become GitHub issues yet.',
  LINKED: 'No reports have been linked to existing issues yet.',
  REJECTED: 'No rejected reports.',
};

if (requireAuth()) {
  hydrateIcons();
  renderShell('admin-bugs');
  window.addEventListener('hashchange', load);
  load();
}

function currentStatus() {
  const hash = location.hash.slice(1);
  return STATUSES.includes(hash) ? hash : 'PENDING';
}

async function load() {
  const status = currentStatus();
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.tab === status) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
  if (getUser()?.role !== 'ADMIN') {
    showStatus('error', 'Only administrators can review bug reports.');
    setText(byId('error-title'), 'Admins only');
    return;
  }
  showStatus('loading');
  try {
    const reports = await getBugReports(status);
    if (reports.length === 0) {
      setText(byId('empty-text'), EMPTY_TEXT[status]);
      showStatus('empty');
      return;
    }
    byId('list').replaceChildren(...reports.map(card));
    showStatus('ready');
  } catch (error) {
    showStatus('error', extractApiErrorMessage(error, 'Please check your connection and try again.'));
  }
}

function showStatus(state, message) {
  show(byId('status-loading'), state === 'loading');
  show(byId('status-error'), state === 'error');
  show(byId('status-empty'), state === 'empty');
  show(byId('list'), state === 'ready');
  if (message) {
    setText(byId('load-error'), message);
  }
}

function card(report) {
  const root = cloneTemplate('report-template');
  const sent = new Date(report.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  setText(field(root, 'meta'), `${sent} · ${report.reporterEmail ?? 'unknown reporter'}`);
  setText(field(root, 'what'), report.whatHappened);
  setText(field(root, 'expected'), report.expected);
  setText(field(root, 'steps'), report.steps);
  show(field(root, 'steps-box'), Boolean(report.steps));
  setText(field(root, 'context'), `Page ${report.page || 'unknown'} · ${report.userAgent || 'browser unknown'}`);

  const url = safeIssueUrl(report.githubIssueUrl);
  const issue = field(root, 'issue');
  if (url) {
    issue.href = url;
    setText(issue, `GitHub #${report.githubIssueNumber}`);
    issue.hidden = false;
  }
  if (report.reviewNote) {
    setText(field(root, 'note'), `Note to reporter: ${report.reviewNote}`);
    field(root, 'note').hidden = false;
  }

  const review = field(root, 'review');
  if (report.status !== 'PENDING') {
    review.remove();
    return root;
  }
  review.elements.title.value = suggestTitle(report.whatHappened);
  const error = field(root, 'error');

  async function act(button, busyLabel, call) {
    setText(error, '');
    setBusy(button, true, busyLabel);
    try {
      await call();
      root.remove();
      if (!byId('list').children.length) {
        load();
      }
    } catch (failure) {
      setText(error, extractApiErrorMessage(failure, 'That did not work. Please try again.'));
    } finally {
      setBusy(button, false);
    }
  }

  review.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = review.elements.title.value.trim();
    if (!title) {
      setText(error, 'Give the issue a title first.');
      return;
    }
    act(review.querySelector('[data-action="approve"]'), 'Opening issue…', () => approveBugReport(report.id, title));
  });
  review.querySelector('[data-action="link"]').addEventListener('click', (event) => {
    const target = review.elements.issue.value.trim();
    if (!target) {
      setText(error, 'Enter the existing issue: #42 or its link.');
      return;
    }
    act(event.currentTarget, 'Linking…', () => linkBugReport(report.id, target, review.elements.note.value.trim()));
  });
  review.querySelector('[data-action="reject"]').addEventListener('click', (event) => {
    act(event.currentTarget, 'Rejecting…', () => rejectBugReport(report.id, review.elements.note.value.trim()));
  });
  return root;
}
