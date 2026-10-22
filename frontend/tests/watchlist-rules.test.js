import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capLabel, companyStatusBadge, isFull, isSearchable, newJobsLabel, openJobsLabel } from '../src/js/pages/watchlist-rules.js';

test('capLabel shows how much of the cap is used, once the cap is known', () => {
  assert.equal(capLabel(3, 25), '3 of 25 companies watched');
  assert.equal(capLabel(0, 25), '0 of 25 companies watched');
  assert.equal(capLabel(3, null), null);
});

test('isFull is true only at or over a known cap', () => {
  assert.equal(isFull(24, 25), false);
  assert.equal(isFull(25, 25), true);
  assert.equal(isFull(30, 25), true);
  assert.equal(isFull(30, null), false);
});

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
