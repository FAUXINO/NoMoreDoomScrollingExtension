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

test('build: TikTok je zablokovaný celý a bez tlačítka domů', () => {
  const dom = load('https://www.tiktok.com/foryou');
  const box = dom.window.document.getElementById('noshorts-block');
  assert.ok(box);
  assert.equal(box.querySelector('a'), null);
});

test('build: Instagram /reels/ zablokovaný s tlačítkem domů', () => {
  const dom = load('https://www.instagram.com/reels/');
  const btn = dom.window.document.querySelector('#noshorts-block a');
  assert.equal(btn.getAttribute('href'), 'https://www.instagram.com/');
});

test('build: Instagram – reel ze zprávy, swipe na další → Zablokováno, zpět do zpráv → OK', async () => {
  const dom = load('https://www.instagram.com/direct/t/123/', '<main><a href="/reel/AAA/">náhled</a></main>');
  const { document: doc, history } = dom.window;
  const nav = async (path) => {
    history.pushState({}, '', path);
    doc.body.append(doc.createElement('div'));
    await tick();
  };
  assert.ok(!doc.documentElement.hasAttribute('data-noshorts-blocked'));

  await nav('/reel/AAA/');
  assert.ok(!doc.documentElement.hasAttribute('data-noshorts-blocked'), 'reel ze zprávy se přehraje');

  await nav('/reels/BBB/');
  assert.ok(doc.documentElement.hasAttribute('data-noshorts-blocked'), 'swipe na další reel je zablokovaný');
  const btn = doc.querySelector('#noshorts-block a');
  assert.equal(btn.textContent, 'Zpět do zpráv');
  assert.equal(btn.getAttribute('href'), 'https://www.instagram.com/direct/inbox/');

  await nav('/direct/t/123/');
  assert.ok(!doc.documentElement.hasAttribute('data-noshorts-blocked'), 've zprávách vše funguje');
});

test('build: Instagram – reel z odkazu (nová stránka) se přehraje', () => {
  const dom = load('https://www.instagram.com/reel/AAA/');
  assert.ok(!dom.window.document.documentElement.hasAttribute('data-noshorts-blocked'));
});

test('build: na nepodporovaném webu skript nic nedělá', () => {
  const dom = load('https://example.com/');
  assert.equal(dom.window.document.getElementById('noshorts-style'), null);
});

test('build: Instagram – kanál: odpověď z hooku stránky → panel se zprávami', async () => {
  const dom = load('https://www.instagram.com/channel/AbcDef123/', '<main>Use the Instagram app</main>');
  const { document: doc, CustomEvent } = dom.window;
  const response = JSON.stringify({
    data: {
      xfb_igd_channel_web_preview: {
        channel_preview: {
          thread_igid: '1',
          title: 'Kanál',
          number_of_members: 3,
          items: [{ item_type: 'TEXT', message_id: 'm1', timestamp: '1795000000000000', text: 'Ahoj', sender: { username: 'kamarad' }, full_item_dict: '{}' }],
        },
      },
    },
  });
  doc.dispatchEvent(new CustomEvent('noshorts-ig-channel', { detail: response }));
  const panel = doc.getElementById('noshorts-ig-channel');
  assert.ok(panel, 'panel kanálu');
  assert.match(panel.textContent, /Ahoj/);
  assert.match(doc.getElementById('noshorts-style').textContent, /#noshorts-ig-channel/);

  dom.window.history.pushState({}, '', '/direct/inbox/');
  doc.body.append(doc.createElement('div'));
  await tick();
  assert.equal(doc.getElementById('noshorts-ig-channel'), null, 'po odchodu z kanálu panel zmizí');
});
