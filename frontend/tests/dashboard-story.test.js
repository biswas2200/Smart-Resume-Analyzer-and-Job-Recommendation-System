import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from '../src/js/pages/dashboard-story.js';

const check = (passed, detail) => ({ name: 'x', passed, detail });
const rec = (id, title, matchScore = 0.8) => ({
  recommendationId: `rec-${id}`,
  role: { id, title, description: '' },
  matchScore,
  matchedSkills: [],
  missingSkills: [],
});
const dashboard = (overrides) => ({
  resumeId: 'r1',
  userTier: 'free',
  recommendationsLocked: false,
  lockReason: null,
  aiAllowance: null,
  atsScore: { score: 78, max_score: 100, checks: [] },
  recommendations: [],
  ...overrides,
});

test('meterSegments: rounds to tenths of the maximum and stays within 0-10', () => {
  assert.equal(meterSegments(78, 100), 8);
  assert.equal(meterSegments(64, 80), 8);
  assert.equal(meterSegments(0, 100), 0);
  assert.equal(meterSegments(120, 100), 10);
  assert.equal(meterSegments(50, 0), 0);
});

test('isStrongScore: 80 % of the maximum or more', () => {
  assert.equal(isStrongScore({ score: 80, max_score: 100 }), true);
  assert.equal(isStrongScore({ score: 63, max_score: 80 }), false);
  assert.equal(isStrongScore({ score: 64, max_score: 80 }), true);
});

test('formatScore: drops a trailing .0', () => {
  assert.equal(formatScore(78), '78');
  assert.equal(formatScore(78.0), '78');
  assert.equal(formatScore(77.25), '77.3');
});

test('explanationBubbles: paragraphs when there are blank lines, else lines', () => {
  assert.deepEqual(explanationBubbles('One.\nTwo.\n\nThree.'), ['One.\nTwo.', 'Three.']);
  assert.deepEqual(explanationBubbles('One.\nTwo.\n'), ['One.', 'Two.']);
  assert.deepEqual(explanationBubbles('  '), []);
  assert.deepEqual(explanationBubbles(null), []);
});

test('omensLine: names the first failed check, or praises a clean sheet', () => {
  const clean = dashboard({ atsScore: { score: 100, max_score: 100, checks: [check(true, 'Email address found')] } });
  assert.match(omensLine(clean), /Every check passed/);

  const twoFailed = dashboard({
    atsScore: {
      score: 70,
      max_score: 100,
      checks: [check(true, 'Email'), check(false, "No 'Skills' section header found"), check(false, 'No phone')],
    },
  });
  assert.equal(
    omensLine(twoFailed),
    "Here's what your map says. Fix this first: No 'Skills' section header found. Then 1 more.",
  );
});

test('pathsLine: best road, empty map, and the locked cases', () => {
  const open = dashboard({ recommendations: [rec('a', 'Data Analyst', 0.86), rec('b', 'BI Developer', 0.74)] });
  assert.equal(pathsLine(open), 'Two roads lead from here. Data Analyst fits you best, at 86%.');
  assert.match(pathsLine(dashboard({ recommendations: [rec('a', 'Data Analyst')] })), /^One road leads/);
  assert.match(pathsLine(dashboard()), /No paths showed up/);

  const lockedPremium = dashboard({ recommendationsLocked: true, lockReason: 'ai_engine_required', userTier: 'premium' });
  assert.match(pathsLine(lockedPremium), /you hold the key/);
  const lockedSpent = dashboard({
    recommendationsLocked: true,
    lockReason: 'ai_engine_required',
    aiAllowance: { used: 3, quota: 3, resetsOn: '2026-11-01' },
  });
  assert.match(pathsLine(lockedSpent), /locked for now/);
  const community = dashboard({ recommendationsLocked: true, lockReason: 'community_edition', userTier: 'premium' });
  assert.match(pathsLine(community), /this edition/);
});

test('treasureLine: Premium gets the invitation, free gets the Premium note', () => {
  assert.match(treasureLine(dashboard({ userTier: 'premium' })), /Paste the job you want/);
  assert.match(treasureLine(dashboard()), /Premium chapter/);
});

test('jdVerdict and jdLine', () => {
  assert.equal(jdVerdict(0.82), 'Close to the treasure');
  assert.equal(jdVerdict(0.55), 'On the right road');
  assert.equal(jdVerdict(0.2), 'A long road ahead');
  assert.equal(jdLine({ score: 0.82, missingSkills: [] }), '82%! You cover every skill this job names.');
  assert.equal(
    jdLine({ score: 0.82, missingSkills: ['Power BI'] }),
    "82%! One skill stands between you and this job. They're in yellow.",
  );
  assert.match(jdLine({ score: 0.5, missingSkills: ['a', 'b'] }), /2 skills stand/);
});

test('findNewMatches: nothing is new on the first visit', () => {
  const { fresh, remember } = findNewMatches([rec('a', 'A'), rec('b', 'B')], null);
  assert.deepEqual(fresh, []);
  assert.deepEqual(remember, ['a', 'b']);
});

test('findNewMatches: roles not seen before are new, and all are remembered', () => {
  const { fresh, remember } = findNewMatches([rec('a', 'A'), rec('c', 'C')], ['a', 'b']);
  assert.deepEqual(
    fresh.map((r) => r.role.id),
    ['c'],
  );
  assert.deepEqual(remember, ['b', 'a', 'c']);
});

test('atsChange: first visit, same version, and a new version', () => {
  const first = atsChange(null, 'r1', 71);
  assert.equal(first.delta, null);
  assert.deepEqual(first.record, { resumeId: 'r1', score: 71, previous: null });

  const sameAgain = atsChange(first.record, 'r1', 71);
  assert.equal(sameAgain.delta, null);

  const next = atsChange(first.record, 'r2', 78);
  assert.equal(next.delta, 7);
  assert.deepEqual(next.record, { resumeId: 'r2', score: 78, previous: 71 });

  // Reloading the same version keeps showing the change since the previous one.
  assert.equal(atsChange(next.record, 'r2', 78).delta, 7);
  assert.equal(atsChange({ garbage: true }, 'r1', 50).delta, null);
});

test('describeChange', () => {
  assert.equal(describeChange(null), '');
  assert.equal(describeChange(0), 'Same as your last map.');
  assert.equal(describeChange(7), 'Up 7 since your last map.');
  assert.equal(describeChange(-2.5), 'Down 2.5 since your last map.');
});
