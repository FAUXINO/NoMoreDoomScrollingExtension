// Instagram: „jeden reel ze zprávy“ – zámek ID, skrytí sousedů, zákaz scrollu, náhledy v chatu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instagramSite } from '../src/sites/instagram.js';
import { hideEl } from '../src/core/dom.js';
import { setPageFlags } from '../src/core/style.js';
import { runSite, cfgFor } from './helpers.mjs';

const cfg = cfgFor('instagram');
const u = (path) => new URL('https://www.instagram.com' + path);

test('zámek ID: první reel povolen, jiné ID zablokováno s tlačítkem do zpráv', () => {
  const state = {};
  assert.equal(instagramSite.blocked(u('/direct/t/123/'), cfg, state), null);
  assert.equal(instagramSite.blocked(u('/reel/AAA/'), cfg, state), null, 'reel ze zprávy se přehraje');
  assert.equal(state.reelId, 'AAA');
  assert.equal(instagramSite.blocked(u('/reels/AAA/'), cfg, state), null, 'stejné ID přes /reels/ je OK');
  assert.equal(instagramSite.blocked(u('/reel/AAA/?igsh=x'), cfg, state), null);

  const next = instagramSite.blocked(u('/reels/BBB/'), cfg, state);
  assert.deepEqual(next, {
    reason: 'Další reely',
    homeUrl: 'https://www.instagram.com/direct/inbox/',
    homeLabel: 'Zpět do zpráv',
  });
  assert.equal(state.reelId, 'AAA', 'zámek po swipu zůstává');

  // Zpět do zpráv → zámek se uvolní, další reel ze zprávy jde otevřít.
  assert.equal(instagramSite.blocked(u('/direct/t/123/'), cfg, state), null);
  assert.equal(state.reelId, null);
  assert.equal(instagramSite.blocked(u('/reel/BBB/'), cfg, state), null);
  assert.equal(state.reelId, 'BBB');
});

test('reel z odkazu (nová stránka) se přehraje; záložka Reels zůstane blokovaná', () => {
  assert.equal(instagramSite.blocked(u('/reel/CCC/'), cfg, {}), null);
  assert.equal(instagramSite.blocked(u('/reels/'), cfg, {}), 'Instagram Reels');
  assert.equal(instagramSite.blocked(u('/nekdo/reels/'), cfg, {}), 'Instagram Reels');
});

test('příznaky stránky: zprávy a jeden reel', () => {
  assert.deepEqual(instagramSite.pageFlags(u('/direct/t/1/'), cfg), ['ig-direct']);
  assert.deepEqual(instagramSite.pageFlags(u('/reel/AAA/'), cfg), ['ig-single-reel']);
  assert.deepEqual(instagramSite.pageFlags(u('/reels/'), cfg), []);
  assert.deepEqual(instagramSite.pageFlags(u('/reel/AAA/'), { ...cfg, allowSingleReel: false }), []);
});

const DM_HTML = `<body>
<nav><a id="nav-reels" href="/reels/"><svg aria-label="Reels"></svg></a><a id="nav-dm" href="/direct/inbox/"></a></nav>
<main><div id="thread">
  <div id="msg1"><a id="preview" href="/reel/AAA/"><img alt=""><svg aria-label="Reels"></svg></a></div>
  <div id="msg2"><a id="preview2" href="https://www.instagram.com/reels/BBB/">reel</a></div>
  <div id="msg3"><span>Ahoj, koukej na tohle</span></div>
</div></main>
</body>`;

test('zprávy: náhledy reelů v chatu zůstanou, záložka Reels v navigaci zmizí', () => {
  const r = runSite(instagramSite, DM_HTML, 'https://www.instagram.com/direct/t/123/');
  assert.equal(r.blocked, null);
  for (const id of ['#preview', '#preview2', '#msg1', '#msg3', '#nav-dm']) assert.ok(r.isVisible(id), id);
  assert.ok(!r.isVisible('#nav-reels'));
});

const VIEWER_HTML = `<body><main>
<div id="viewer" style="overflow-y: auto">
  <div id="item1"><div><video id="v1"></video></div><a id="l1" href="/reel/AAA/">AAA</a></div>
  <div id="item2"><div><video id="v2"></video></div><a href="/reel/BBB/">BBB</a></div>
  <div id="item3"><div><video id="v3"></video></div><a href="/reels/CCC/">CCC</a></div>
</div>
</main></body>`;

test('viewer: přehraje se jen otevřený reel, sousedé skrytí, scroll zakázaný', () => {
  const r = runSite(instagramSite, VIEWER_HTML, 'https://www.instagram.com/reel/AAA/');
  assert.equal(r.blocked, null);
  assert.ok(r.isVisible('#item1'));
  assert.ok(r.isVisible('#l1'), 'odkaz na vlastní reel zůstane');
  assert.ok(!r.isVisible('#item2'));
  assert.ok(!r.isVisible('#item3'));
  assert.equal(r.doc.getElementById('viewer').style.getPropertyValue('overflow'), 'hidden');
  assert.equal(r.state.forceBlock, null);
});

test('viewer: když se obsah změní na jiný reel bez změny URL → Zablokováno', () => {
  const r = runSite(instagramSite, VIEWER_HTML, 'https://www.instagram.com/reel/AAA/');
  r.doc.getElementById('l1').setAttribute('href', '/reel/ZZZ/');
  r.rescan();
  assert.equal(r.state.forceBlock.reason, 'Další reely');
  assert.equal(r.state.forceBlock.homeLabel, 'Zpět do zpráv');
});

test('viewer jako dialog nad konverzací: náhledy v chatu se neskryjí', () => {
  const html = `<body>
  <main><div id="thread"><div id="msgvid"><video id="pv"></video></div></div></main>
  <div role="dialog" id="dlg"><div id="viewer" style="overflow-y: scroll">
    <div id="i1"><video id="d1"></video><a href="/reel/AAA/">a</a></div>
    <div id="i2"><video id="d2"></video><a href="/reel/BBB/">b</a></div>
  </div></div></body>`;
  const r = runSite(instagramSite, html, 'https://www.instagram.com/reel/AAA/');
  assert.ok(r.isVisible('#i1'));
  assert.ok(!r.isVisible('#i2'));
  assert.ok(r.isVisible('#msgvid'), 'video v chatu pod dialogem zůstane');
  assert.equal(r.state.allowedVideo.id, 'd1');
});

test('reel zobrazený jako příspěvek (article s odkazem na sebe) zůstane vidět', () => {
  const html = `<body><main><article id="post"><video></video><a href="/reel/AAA/">před 2 h</a></article></main></body>`;
  const r = runSite(instagramSite, html, 'https://www.instagram.com/reel/AAA/');
  assert.ok(r.isVisible('#post'));
});

test('odchod z reelu (SPA zpět do zpráv) vrátí skryté prvky a scroll', () => {
  const r = runSite(instagramSite, VIEWER_HTML, 'https://www.instagram.com/reel/AAA/');
  assert.ok(!r.isVisible('#item2'));
  r.dom.window.history.pushState({}, '', '/direct/t/123/');
  const url = new URL(r.dom.window.location.href);
  const hide = (el, reason) => hideEl(el, reason);
  instagramSite.blocked(url, cfg, r.state);
  setPageFlags(r.doc, instagramSite.pageFlags(url, cfg, r.state));
  instagramSite.scan([r.doc.body], { cfg, url, hide, state: r.state });
  assert.ok(r.isVisible('#item2'));
  assert.ok(r.isVisible('#item3'));
  assert.equal(r.doc.getElementById('viewer').getAttribute('style'), 'overflow-y: auto');
});
