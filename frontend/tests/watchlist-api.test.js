import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { API_BASE_URL } from '../src/js/config.js';
import { getWatchlist, searchCompanies, unwatchCompany, watchCompany } from '../src/js/api/watchlist-api.js';

// watchlist-api.js goes through http.js, which only needs localStorage, location and fetch.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
globalThis.location = { replace: () => {} };

let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([init.method, url.replace(API_BASE_URL, ''), init.body]);
    return new Response(init.method === 'DELETE' ? null : '[]', { status: init.method === 'DELETE' ? 204 : 200 });
  };
});

test('getWatchlist lists the watched companies', async () => {
  assert.deepEqual(await getWatchlist(), []);
  assert.deepEqual(calls, [['GET', '/watchlist', undefined]]);
});

test('searchCompanies trims and encodes the query', async () => {
  await searchCompanies('  Tata & Sons ');
  assert.deepEqual(calls, [['GET', '/watchlist/companies?q=Tata+%26+Sons', undefined]]);
});

test('watchCompany and unwatchCompany use the encoded company id', async () => {
  await watchCompany('a/b');
  assert.equal(await unwatchCompany('c1'), null);
  assert.deepEqual(calls, [
    ['PUT', '/watchlist/a%2Fb', undefined],
    ['DELETE', '/watchlist/c1', undefined],
  ]);
});
