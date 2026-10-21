import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  asPercent,
  canMatchJd,
  canUnlock,
  isLlmExplanation,
  resetDate,
  showsAllowance,
  tierLabel,
} from '../src/js/pages/dashboard-rules.js';

const allowance = (used, quota = 3) => ({ used, quota, resetsOn: '2026-10-01' });
const locked = (overrides) => ({
  resumeId: 'r1',
  recommendationsLocked: true,
  lockReason: 'ai_engine_required',
  userTier: 'free',
  aiAllowance: allowance(3),
  ...overrides,
});

test('canUnlock: nothing to unlock when not locked or no resume', () => {
  assert.equal(canUnlock(locked({ recommendationsLocked: false, userTier: 'premium' })), false);
  assert.equal(canUnlock(locked({ resumeId: undefined, userTier: 'premium' })), false);
});

test('canUnlock: Premium always can, except in the Community Edition', () => {
  assert.equal(canUnlock(locked({ userTier: 'premium', aiAllowance: null })), true);
  assert.equal(canUnlock(locked({ userTier: 'premium', lockReason: 'ai_budget_exhausted' })), true);
  assert.equal(canUnlock(locked({ userTier: 'premium', lockReason: 'community_edition' })), false);
});

test('canUnlock: free account only when its allowance has something left', () => {
  assert.equal(canUnlock(locked({ aiAllowance: allowance(3) })), false);
  assert.equal(canUnlock(locked({ aiAllowance: allowance(2) })), true);
  assert.equal(canUnlock(locked({ aiAllowance: null })), false);
  assert.equal(canUnlock(locked({ aiAllowance: allowance(0), lockReason: 'ai_budget_exhausted' })), false);
});

test('showsAllowance: free account on an AI-engine domain with an allowance', () => {
  const base = { userTier: 'free', domain: { engine: 'llm' }, aiAllowance: allowance(1) };
  assert.equal(showsAllowance(base), true);
  assert.equal(showsAllowance({ ...base, userTier: 'premium' }), false);
  assert.equal(showsAllowance({ ...base, domain: { engine: 'local' } }), false);
  assert.equal(showsAllowance({ ...base, aiAllowance: null }), false);
});

test('resetDate formats the ISO date in UTC', () => {
  assert.equal(resetDate({ aiAllowance: allowance(0) }), '1 October 2026');
  assert.equal(resetDate({ aiAllowance: null }), '');
});

test('isLlmExplanation treats a missing source as the template', () => {
  assert.equal(isLlmExplanation({ explanationSource: 'llm' }), true);
  assert.equal(isLlmExplanation({ explanationSource: 'template' }), false);
  assert.equal(isLlmExplanation({}), false);
});

test('canMatchJd needs Premium and an analysed resume', () => {
  assert.equal(canMatchJd({ userTier: 'premium', resumeId: 'r1' }), true);
  assert.equal(canMatchJd({ userTier: 'free', resumeId: 'r1' }), false);
  assert.equal(canMatchJd({ userTier: 'premium' }), false);
});

test('tierLabel and asPercent', () => {
  assert.equal(tierLabel('USER'), 'Free');
  assert.equal(tierLabel('PREMIUM_USER'), 'Premium');
  assert.equal(tierLabel('ADMIN'), 'Admin');
  assert.equal(tierLabel('USER', true), 'Premium', 'preview mode gives a free account Premium');
  assert.equal(tierLabel('ADMIN', true), 'Admin');
  assert.equal(asPercent(0.876), 88);
});
