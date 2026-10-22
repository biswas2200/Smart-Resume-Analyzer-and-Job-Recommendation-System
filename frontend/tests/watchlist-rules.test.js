import { test } from 'node:test';
import assert from 'node:assert/strict';

import { companyStatusBadge, isSearchable, newJobsLabel, openJobsLabel } from '../src/js/pages/watchlist-rules.js';

test('companyStatusBadge says whether we can read the company\'s jobs', () => {
  assert.deepEqual(companyStatusBadge('ACTIVE'), { label: 'Jobs tracked', tone: 'green' });
  assert.equal(companyStatusBadge('UNSUPPORTED').tone, 'amber');
  assert.equal(companyStatusBadge('PENDING').label, 'Checking for jobs');
  assert.equal(companyStatusBadge(undefined).label, 'Checking for jobs');
});

test('openJobsLabel counts open jobs and hides zero', () => {
  assert.equal(openJobsLabel(0), null);
  assert.equal(openJobsLabel(undefined), null);
  assert.equal(openJobsLabel(1), '1 open job');
  assert.equal(openJobsLabel(12), '12 open jobs');
});

test('newJobsLabel shows the New badge only when something is new', () => {
  assert.equal(newJobsLabel(0), null);
  assert.equal(newJobsLabel(3), '3 new');
});

test('isSearchable needs two letters after trimming', () => {
  assert.equal(isSearchable(' g '), false);
  assert.equal(isSearchable(null), false);
  assert.equal(isSearchable('gr'), true);
});
