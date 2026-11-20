import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facebookSite } from '../src/sites/facebook.js';
import { runSite, cfgFor } from './helpers.mjs';

const cfg = cfgFor('facebook');
const u = (path) => new URL('https://m.facebook.com' + path);

test('Facebook: blokované URL', () => {
  for (const p of ['/reel/123', '/reel/123/?s=x', '/reels/', '/nekdo/reels/']) {
    assert.equal(facebookSite.blocked(u(p), cfg), 'Facebook Reels', p);
  }
  for (const p of ['/watch/', '/watch', '/watch/live/', '/video/']) {
    assert.equal(facebookSite.blocked(u(p), cfg), 'Facebook Video', p);
  }
  for (const p of ['/', '/watch/?v=123', '/kamarad', '/kamarad/videos/456', '/messages/', '/groups/123', '/video.php?v=1']) {
    assert.equal(facebookSite.blocked(u(p), cfg), null, p);
  }
  assert.equal(facebookSite.blocked(u('/watch/'), { ...cfg, blockWatch: false }), null);
});

test('Facebook: hostname', () => {
  for (const h of ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com']) assert.ok(facebookSite.matches(h), h);
  assert.ok(!facebookSite.matches('notfacebook.com'));
});

// m.facebook.com: feed jako kontejner s přímými potomky (bez aria-posinset).
const MOBILE_FEED_HTML = `<body>
<div role="tablist" id="tabs">
  <div role="tab" id="tab-home" aria-label="Domů, karta 1 z 6"></div>
  <div role="tab" id="tab-video" aria-label="Video, karta 2 z 6"></div>
  <div role="tab" id="tab-friends" aria-label="Přátelé, karta 3 z 6"></div>
  <div role="tab" id="tab-reels" aria-label="Reels, karta 4 z 6"></div>
</div>
<div data-type="vscroller" id="feed">
  <div id="stories"><div><span>Vytvořit příběh</span></div><div><img alt=""></div></div>
  <div id="post-friend"><div><span>Kamarád</span></div><div><span>Ahoj, tady fotka z výletu</span></div></div>
  <div id="reels-carousel"><div><span>Reels a krátká videa</span></div><div><a href="/reel/1">r1</a></div></div>
  <div id="post-reel"><div><span>Někdo</span></div><a href="https://m.facebook.com/reel/2">reel</a></div>
  <div id="post-suggested"><div><span>Cizí stránka</span><span>Navrhované pro vás</span></div></div>
  <div id="post-video"><div><span>Kamarád 2</span></div><a href="/watch/?v=999">video</a></div>
</div>
</body>`;

test('Facebook mobil: Reels, navrhované a Příběhy pryč, příspěvky přátel zůstanou', () => {
  const r = runSite(facebookSite, MOBILE_FEED_HTML, 'https://m.facebook.com/');
  assert.equal(r.blocked, null);
  for (const id of ['#reels-carousel', '#post-reel', '#post-suggested', '#stories']) assert.ok(!r.isVisible(id), id);
  for (const id of ['#post-friend', '#post-video', '#feed']) assert.ok(r.isVisible(id), id);
});

test('Facebook mobil: záložky Reels a Video pryč, ostatní zůstanou', () => {
  const r = runSite(facebookSite, MOBILE_FEED_HTML, 'https://m.facebook.com/');
  assert.ok(!r.isVisible('#tab-reels'));
  assert.ok(!r.isVisible('#tab-video'));
  assert.ok(r.isVisible('#tab-home'));
  assert.ok(r.isVisible('#tab-friends'));
  assert.ok(r.isVisible('#tabs'), 'text "Reels" v záložce nesmí skrýt celou lištu');
});

test('Facebook: vypnuté volby nechají obsah být', () => {
  const r = runSite(facebookSite, MOBILE_FEED_HTML, 'https://m.facebook.com/', {
    hideSuggested: false,
    hideStories: false,
    blockWatch: false,
  });
  assert.ok(r.isVisible('#post-suggested'));
  assert.ok(r.isVisible('#stories'));
  assert.ok(r.isVisible('#tab-video'));
  assert.ok(!r.isVisible('#post-reel'));
});

// www.facebook.com: příspěvky s aria-posinset uvnitř role="feed".
const WWW_FEED_HTML = `<body>
<div role="feed" id="feed">
  <div aria-posinset="1" id="p1"><span>Kamarád</span><a href="/kamarad/posts/1">příspěvek</a></div>
  <div aria-posinset="2" id="p2"><div><div><a href="/reel/3">reel</a></div></div></div>
  <div aria-posinset="3" id="p3"><div role="article" id="comment"><span>komentář</span></div></div>
</div>
</body>`;

test('Facebook www: příspěvek s Reelem pryč, ostatní zůstanou', () => {
  const r = runSite(facebookSite, WWW_FEED_HTML, 'https://www.facebook.com/');
  assert.ok(!r.isVisible('#p2'));
  assert.ok(r.isVisible('#p1'));
  assert.ok(r.isVisible('#p3'));
});
