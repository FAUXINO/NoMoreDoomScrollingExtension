import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeSite } from '../src/sites/youtube.js';
import { runSite, cfgFor } from './helpers.mjs';

const cfg = cfgFor('youtube');
const u = (path) => new URL('https://m.youtube.com' + path);

test('YouTube: blokované URL', () => {
  for (const p of ['/shorts/abc123', '/shorts', '/shorts/', '/@kanal/shorts', '/channel/UC123/shorts', '/c/jmeno/shorts']) {
    assert.equal(youtubeSite.blocked(u(p), cfg), 'YouTube Shorts', p);
  }
  for (const p of ['/', '/watch?v=abc', '/results?search_query=shorts', '/@kanal', '/@kanal/videos', '/feed/subscriptions', '/@shortsfan']) {
    assert.equal(youtubeSite.blocked(u(p), cfg), null, p);
  }
  assert.equal(youtubeSite.blocked(u('/shorts/abc'), { ...cfg, blockShorts: false }), null);
});

test('YouTube: hostname', () => {
  assert.ok(youtubeSite.matches('m.youtube.com'));
  assert.ok(youtubeSite.matches('www.youtube.com'));
  assert.ok(!youtubeSite.matches('music.youtube.com'));
  assert.ok(!youtubeSite.matches('notyoutube.com'));
});

const SEARCH_HTML = `<body>
<ytm-search>
  <ytm-video-with-context-renderer id="normal"><a href="/watch?v=normal1">Normální video</a></ytm-video-with-context-renderer>
  <ytm-video-with-context-renderer id="short-item"><a href="/shorts/s1">Short</a></ytm-video-with-context-renderer>
  <ytm-reel-shelf-renderer id="shelf"><a href="/shorts/s2">Short v polici</a></ytm-reel-shelf-renderer>
  <grid-shelf-view-model id="grid"><ytm-shorts-lockup-view-model><a href="/shorts/s3"></a></ytm-shorts-lockup-view-model></grid-shelf-view-model>
</ytm-search>
<ytm-pivot-bar-renderer>
  <ytm-pivot-bar-item-renderer id="nav-home"><div class="pivot-w2w"></div><a href="/">Domů</a></ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="nav-shorts"><div class="pivot-shorts"></div></ytm-pivot-bar-item-renderer>
  <ytm-pivot-bar-item-renderer id="nav-subs"><a href="/feed/subscriptions">Odběry</a></ytm-pivot-bar-item-renderer>
</ytm-pivot-bar-renderer>
</body>`;

test('YouTube: výsledky hledání – Shorts pryč, běžná videa zůstanou', () => {
  const r = runSite(youtubeSite, SEARCH_HTML, 'https://m.youtube.com/results?search_query=kocky');
  assert.equal(r.blocked, null);
  assert.ok(r.isVisible('#normal'));
  assert.ok(!r.isVisible('#short-item'));
  assert.ok(!r.isVisible('#shelf'));
  assert.ok(!r.isVisible('#grid'));
  assert.equal(r.visible('a[href^="/shorts"]').length, 0);
});

test('YouTube: záložka Shorts ve spodní liště skrytá, ostatní zůstanou', () => {
  const r = runSite(youtubeSite, SEARCH_HTML, 'https://m.youtube.com/');
  assert.ok(!r.isVisible('#nav-shorts'));
  assert.ok(r.isVisible('#nav-home'));
  assert.ok(r.isVisible('#nav-subs'));
});

const HOME_HTML = `<body>
<ytm-browse id="browse">
  <ytm-rich-grid-renderer id="feed">
    <ytm-rich-item-renderer><a href="/watch?v=rec1">Doporučené</a></ytm-rich-item-renderer>
  </ytm-rich-grid-renderer>
</ytm-browse>
</body>`;

test('YouTube: hlavní stránka bez doporučení', () => {
  const r = runSite(youtubeSite, HOME_HTML, 'https://m.youtube.com/');
  assert.ok(!r.isVisible('#feed'));
  assert.ok(r.isVisible('#browse'));
});

test('YouTube: doporučení na jiných stránkách zůstanou (odběry)', () => {
  const r = runSite(youtubeSite, HOME_HTML, 'https://m.youtube.com/feed/subscriptions');
  assert.ok(r.isVisible('#feed'));
});

test('YouTube: hideHomeFeed=false nechá hlavní stránku být', () => {
  const r = runSite(youtubeSite, HOME_HTML, 'https://m.youtube.com/', { hideHomeFeed: false });
  assert.ok(r.isVisible('#feed'));
});
