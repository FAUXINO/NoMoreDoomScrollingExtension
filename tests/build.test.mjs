// Smoke test sestaveného souboru no-shorts.user.js: spustí ho v jsdom jako userscript.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { ROOT } from './helpers.mjs';

const opened = [];
afterEach(() => {
  while (opened.length) opened.pop().window.close();
});

const SCRIPT = readFileSync(join(ROOT, 'no-shorts.user.js'), 'utf8');
const META = readFileSync(join(ROOT, 'no-shorts.meta.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function load(url, body = '<p>obsah</p>') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url,
    runScripts: 'outside-only',
  });
  opened.push(dom);
  dom.window.eval(SCRIPT);
  return dom;
}

test('build: metadata obsahují verzi, document-start a update URL', () => {
  for (const s of [SCRIPT, META]) {
    assert.match(s, new RegExp('@version\\s+' + pkg.version.replace(/\./g, '\\.')));
    assert.match(s, /@run-at\s+document-start/);
    assert.match(s, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\/.+\/no-shorts\.meta\.js/);
    assert.match(s, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/.+\/no-shorts\.user\.js/);
  }
  assert.doesNotMatch(SCRIPT, /^\s*(import|export)\s/m);
});

test('build: na blokované URL se zobrazí obrazovka Zablokováno', () => {
  const dom = load('https://m.youtube.com/shorts/abc');
  const doc = dom.window.document;
  assert.ok(doc.documentElement.hasAttribute('data-noshorts-blocked'));
  assert.ok(doc.getElementById('noshorts-block'));
  assert.match(doc.getElementById('noshorts-block').textContent, /Zablokováno/);
  assert.ok(doc.getElementById('noshorts-style'));
});

test('build: běžná stránka zůstane, CSS se vloží', () => {
  const dom = load('https://m.youtube.com/watch?v=abc');
  const doc = dom.window.document;
  assert.ok(!doc.documentElement.hasAttribute('data-noshorts-blocked'));
  assert.ok(!doc.getElementById('noshorts-block'));
  assert.match(doc.getElementById('noshorts-style').textContent, /ytm-reel-shelf-renderer/);
});

test('build: SPA navigace (pushState) na Short a zpět', async () => {
  const dom = load('https://m.youtube.com/');
  const { document: doc, history } = dom.window;
  assert.ok(!doc.documentElement.hasAttribute('data-noshorts-blocked'));
  assert.match(doc.documentElement.getAttribute('data-noshorts') || '', /yt-home/);

  history.pushState({}, '', '/shorts/xyz');
  doc.body.append(doc.createElement('div')); // SPA po navigaci vždy změní DOM
  await tick();
  assert.ok(doc.documentElement.hasAttribute('data-noshorts-blocked'), 'po pushState na /shorts/ blokováno');

  history.pushState({}, '', '/watch?v=1');
  doc.body.append(doc.createElement('div'));
  await tick();
  assert.ok(!doc.documentElement.hasAttribute('data-noshorts-blocked'), 'po odchodu odblokováno');
  assert.ok(!doc.getElementById('noshorts-block'));
});

test('build: na nepodporovaném webu skript nic nedělá', () => {
  const dom = load('https://example.com/');
  assert.equal(dom.window.document.getElementById('noshorts-style'), null);
});
