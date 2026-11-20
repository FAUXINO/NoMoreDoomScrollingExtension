import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiktokSite } from '../src/sites/tiktok.js';
import { cfgFor } from './helpers.mjs';

const cfg = cfgFor('tiktok');

test('TikTok: hostname', () => {
  for (const h of ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com']) assert.ok(tiktokSite.matches(h), h);
  assert.ok(!tiktokSite.matches('nottiktok.com'));
});

test('TikTok: blokováno všechno, bez tlačítka domů', () => {
  for (const p of ['/', '/foryou', '/@nekdo', '/@nekdo/video/123', '/messages']) {
    assert.ok(tiktokSite.blocked(new URL('https://www.tiktok.com' + p), cfg), p);
  }
  assert.equal(tiktokSite.home(new URL('https://www.tiktok.com/')), null);
});
