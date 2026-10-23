import { getMyBugReports, submitBugReport } from '../api/bug-report-api.js';
import { extractApiErrorMessage } from '../core/api-error.js';
import { el, setBusy, setText } from '../core/dom.js';
import { MAX_SECTION, counterLabel, reporterStatus, safeIssueUrl, validateReport } from '../pages/bug-report-rules.js';
import { icon } from './icons.js';

// The "Report a bug" dialog, opened from the sidebar on every signed-in page. Three short
// sections the user writes themselves (no AI tools); the app adds only the page and browser.
// A report waits for an administrator's review before anything reaches GitHub.

let dialog = null;

export function openBugReport() {
  if (!dialog) {
    dialog = build();
    document.body.append(dialog.element);
  }
  dialog.reset();
  dialog.element.showModal();
  dialog.first.focus();
}

function textArea(name, label, hint, required, rows) {
  const id = `bug-${name}`;
  const box = el('textarea', {
    class: 'input', id, name, rows: String(rows), maxlength: String(MAX_SECTION),
    'aria-describedby': `${id}-hint ${id}-error`, required: required || null,
  });
  const counter = el('span', { class: 'field-hint bug-counter', 'aria-hidden': 'true' }, counterLabel(''));
  box.addEventListener('input', () => setText(counter, counterLabel(box.value)));
  const error = el('p', { class: 'field-error', id: `${id}-error`, role: 'alert' });
  const wrapper = el('div', { class: 'field' },
    el('label', { for: id }, label, required ? null : el('span', { class: 'muted' }, ' (optional)')),
    el('p', { class: 'field-hint', id: `${id}-hint` }, hint),
    box,
    el('div', { class: 'bug-meta' }, counter),
    error);
  return { wrapper, box, error, counter };
}

function build() {
  const what = textArea('what', '1. What went wrong?', 'In your own words, what you saw.', true, 3);
  const expected = textArea('expected', '2. What did you expect?', 'What should have happened instead.', true, 2);
  const steps = textArea('steps', '3. How can we see it?', 'The steps you took, if you remember them.', false, 3);

  const confirm = el('input', {
    type: 'checkbox', id: 'bug-confirm', 'aria-labelledby': 'bug-confirm-text', 'aria-describedby': 'bug-confirm-error',
  });
  const confirmError = el('p', { class: 'field-error', id: 'bug-confirm-error', role: 'alert' });
  const formError = el('div', { class: 'alert alert-error', role: 'alert', hidden: true });
  const submit = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Send report');
  const cancel = el('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancel');

  const form = el('form', { class: 'bug-form', novalidate: true },
    el('div', { class: 'bug-disclaimer', role: 'note' },
      icon('alert'),
      el('div', {},
        el('strong', {}, 'Please write this yourself. Do not use ChatGPT or any other AI tool.'),
        el('p', {}, 'Short and plain is perfect: we need what you actually saw, in your words. '
          + 'Reports that read as AI-written are closed without review.'))),
    what.wrapper, expected.wrapper, steps.wrapper,
    el('label', { class: 'bug-confirm', for: 'bug-confirm' }, confirm,
      el('span', { id: 'bug-confirm-text' }, 'I wrote this report myself, without AI tools.')),
    confirmError,
    el('p', { class: 'field-hint' },
      'We add the page you are on and your browser name. Your report stays private until we review it; '
      + 'if it becomes a public GitHub issue, your email is never included.'),
    formError,
    el('div', { class: 'bug-actions' }, cancel, submit));

  const thanks = el('div', { class: 'bug-thanks', hidden: true },
    el('h3', {}, 'Thank you!'),
    el('p', {}, 'We will read it soon. If it is a real bug, it goes on our GitHub issue list, and you can follow it below.'),
    el('button', { class: 'btn btn-secondary', type: 'button' }, 'Close'));
  thanks.querySelector('button').addEventListener('click', () => element.close());

  const mine = el('ul', { class: 'bug-mine' });
  const mineBox = el('details', { class: 'bug-mine-box', hidden: true }, el('summary', {}, 'Your reports'), mine);

  const closeButton = el('button', { class: 'icon-btn bug-close', type: 'button', 'aria-label': 'Close' }, icon('close'));
  const element = el('dialog', { class: 'bug-dialog', 'aria-labelledby': 'bug-title' },
    el('div', { class: 'bug-head' }, el('h2', { id: 'bug-title' }, 'Report a bug'), closeButton),
    form, thanks, mineBox);

  closeButton.addEventListener('click', () => element.close());
  cancel.addEventListener('click', () => element.close());
  element.addEventListener('click', (event) => {
    if (event.target === element) {
      element.close(); // a click on the backdrop
    }
  });

  const fields = { whatHappened: what, expected, steps };
  function showErrors(errors) {
    for (const [name, part] of Object.entries(fields)) {
      setText(part.error, errors[name] ?? '');
      part.box.classList.toggle('is-invalid', Boolean(errors[name]));
      part.box.setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
    }
    setText(confirmError, errors.writtenByUser ?? '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const report = {
      whatHappened: what.box.value,
      expected: expected.box.value,
      steps: steps.box.value,
      page: location.pathname,
      writtenByUser: confirm.checked,
    };
    const errors = validateReport(report);
    showErrors(errors);
    formError.hidden = true;
    if (Object.keys(errors).length > 0) {
      (errors.whatHappened ? what.box : errors.expected ? expected.box : errors.steps ? steps.box : confirm).focus();
      return;
    }
    setBusy(submit, true, 'Sending…');
    try {
      await submitBugReport(report);
      form.hidden = true;
      thanks.hidden = false;
      thanks.querySelector('button').focus();
      loadMine();
    } catch (error) {
      setText(formError, extractApiErrorMessage(error, 'Could not send the report. Please try again.'));
      formError.hidden = false;
    } finally {
      setBusy(submit, false);
    }
  });

  async function loadMine() {
    try {
      const reports = await getMyBugReports();
      mine.replaceChildren(...reports.slice(0, 10).map((report) => {
        const url = safeIssueUrl(report.githubIssueUrl);
        const status = url
          ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, reporterStatus(report))
          : el('span', {}, reporterStatus(report));
        return el('li', {},
          el('span', { class: 'bug-mine-text' }, report.whatHappened),
          el('span', { class: `bug-status bug-status-${String(report.status).toLowerCase()}` }, status));
      }));
      mineBox.hidden = reports.length === 0;
    } catch {
      mineBox.hidden = true;
    }
  }

  return {
    element,
    first: what.box,
    reset() {
      form.reset();
      for (const part of Object.values(fields)) {
        setText(part.counter, counterLabel(''));
      }
      showErrors({});
      formError.hidden = true;
      form.hidden = false;
      thanks.hidden = true;
      loadMine();
    },
  };
}
