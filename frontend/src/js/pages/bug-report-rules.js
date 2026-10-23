// The bug report form's rules, kept free of the DOM so tests/bug-report-rules.test.js can run
// them under Node. They mirror the backend's BugReportRequest checks.

/** Most characters in one section (the backend's BugReportRequest.MAX_SECTION). */
export const MAX_SECTION = 1500;
/** "What went wrong?" needs at least this much to be useful. */
export const MIN_WHAT_HAPPENED = 10;

export const STATUSES = ['PENDING', 'APPROVED', 'LINKED', 'REJECTED'];

/**
 * Field errors for a report (`{ whatHappened, expected, steps, writtenByUser }`), keyed by
 * field; an empty object means it can be sent.
 */
export function validateReport(report) {
  const errors = {};
  const what = (report.whatHappened ?? '').trim();
  const expected = (report.expected ?? '').trim();
  const steps = (report.steps ?? '').trim();
  if (what.length < MIN_WHAT_HAPPENED) {
    errors.whatHappened = 'Tell us what went wrong, in a sentence or two.';
  } else if (what.length > MAX_SECTION) {
    errors.whatHappened = `Please keep this under ${MAX_SECTION} characters.`;
  }
  if (!expected) {
    errors.expected = 'Tell us what you expected to happen.';
  } else if (expected.length > MAX_SECTION) {
    errors.expected = `Please keep this under ${MAX_SECTION} characters.`;
  }
  if (steps.length > MAX_SECTION) {
    errors.steps = `Please keep this under ${MAX_SECTION} characters.`;
  }
  if (report.writtenByUser !== true) {
    errors.writtenByUser = 'Please confirm you wrote this yourself.';
  }
  return errors;
}

/** "120 / 1500", for the counter under each box. */
export function counterLabel(text) {
  return `${(text ?? '').length} / ${MAX_SECTION}`;
}

/** What the reporter sees for one of their reports. */
export function reporterStatus(report) {
  switch (report.status) {
    case 'APPROVED':
      return `Accepted: tracked on GitHub as #${report.githubIssueNumber}`;
    case 'LINKED':
      return `Already known: tracked on GitHub as #${report.githubIssueNumber}`;
    case 'REJECTED':
      return report.reviewNote ? `Closed: ${report.reviewNote}` : 'Closed after review';
    default:
      return 'Waiting for review';
  }
}

/** A starting GitHub issue title for the reviewer: the first sentence of "what went wrong", at most 80 characters. */
export function suggestTitle(whatHappened) {
  const firstLine = (whatHappened ?? '').trim().split(/\r?\n/)[0] ?? '';
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? '';
  const title = sentence.replace(/[.!?]+$/, '').trim();
  if (title.length <= 80) {
    return title;
  }
  const cut = title.lastIndexOf(' ', 79);
  return `${title.slice(0, cut > 40 ? cut : 79)}…`;
}

/** Only GitHub issue links of https://github.com are shown as links (data from the backend). */
export function safeIssueUrl(url) {
  return typeof url === 'string' && /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+$/.test(url) ? url : null;
}
