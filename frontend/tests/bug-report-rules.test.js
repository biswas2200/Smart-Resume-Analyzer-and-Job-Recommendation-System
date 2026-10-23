import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SECTION,
  counterLabel,
  reporterStatus,
  safeIssueUrl,
  suggestTitle,
  validateReport,
} from '../src/js/pages/bug-report-rules.js';

const good = { whatHappened: 'The Save button does nothing', expected: 'The job is saved', steps: '', writtenByUser: true };

test('a complete report has no errors; steps are optional', () => {
  assert.deepEqual(validateReport(good), {});
});

test('the two required sections and the confirmation are checked', () => {
  const errors = validateReport({ whatHappened: 'broken', expected: '  ', writtenByUser: false });
  assert.ok(errors.whatHappened);
  assert.ok(errors.expected);
  assert.ok(errors.writtenByUser);
  assert.equal(errors.steps, undefined);
});

test('each section is capped', () => {
  const long = 'x'.repeat(MAX_SECTION + 1);
  const errors = validateReport({ ...good, whatHappened: long, steps: long });
  assert.match(errors.whatHappened, /under 1500/);
  assert.match(errors.steps, /under 1500/);
  assert.equal(counterLabel('abc'), '3 / 1500');
});

test('the reporter sees where each report stands', () => {
  assert.equal(reporterStatus({ status: 'PENDING' }), 'Waiting for review');
  assert.equal(reporterStatus({ status: 'APPROVED', githubIssueNumber: 42 }), 'Accepted: tracked on GitHub as #42');
  assert.equal(reporterStatus({ status: 'LINKED', githubIssueNumber: 15 }), 'Already known: tracked on GitHub as #15');
  assert.equal(reporterStatus({ status: 'REJECTED', reviewNote: "Couldn't reproduce" }), "Closed: Couldn't reproduce");
  assert.equal(reporterStatus({ status: 'REJECTED', reviewNote: '' }), 'Closed after review');
});

test('a title is suggested from the first sentence', () => {
  assert.equal(suggestTitle('Save does nothing. I tried twice.'), 'Save does nothing');
  assert.equal(suggestTitle('Page is blank\nafter upload'), 'Page is blank');
  const long = suggestTitle('When I open the jobs page on my phone the filters overlap the first job card and I cannot tap it');
  assert.ok(long.length <= 81 && long.endsWith('…'));
});

test('only GitHub issue links become links', () => {
  assert.equal(safeIssueUrl('https://github.com/a/b/issues/3'), 'https://github.com/a/b/issues/3');
  assert.equal(safeIssueUrl('javascript:alert(1)'), null);
  assert.equal(safeIssueUrl('https://evil.example/a/b/issues/3'), null);
  assert.equal(safeIssueUrl(null), null);
});
