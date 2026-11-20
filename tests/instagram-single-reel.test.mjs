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

// --- reel ze zprávy jako overlay v /direct/t/ID/ (URL se nemění) ---------------
// Struktura podle snapshotu mobilního webu (2026-11), zjednodušená a anonymizovaná.
const DM_VIEWER_HTML = `<body><section>
<div id="thread"><div id="msgvid"><video id="cv"></video></div><div id="msgtxt"><span>Ahoj</span></div></div>
<div id="vscroll" style="overflow-y: auto">
  <div id="w0"><div id="shared" data-reel-type="reshared" data-fbid="1">
    <div><video id="v0"></video></div>
    <a id="prof" href="/kamarad/reels/">kamarad reels</a>
    <a id="audio" href="/reels/audio/111/">původní zvuk</a>
  </div></div>
  <div id="list">
    <div id="s1" data-reel-type="suggested" data-fbid="2"><video id="v1"></video><a href="/reels/audio/222/">zvuk</a></div>
    <div id="s2" data-reel-type="suggested" data-fbid="3"><video id="v2"></video></div>
    <div id="loading"><svg aria-label="Loading..."></svg></div>
  </div>
</div>
</section></body>`;
const DM_URL = 'https://www.instagram.com/direct/t/123/';

function play(r, id) {
  r.doc.getElementById(id).dispatchEvent(new r.dom.window.Event('play'));
}

test('DM viewer: poslaný reel vidět, předem načtené další reely skryté, scroll zakázaný', () => {
  const r = runSite(instagramSite, DM_VIEWER_HTML, DM_URL);
  assert.equal(r.blocked, null);
  for (const id of ['#shared', '#v0', '#audio', '#thread', '#msgvid']) assert.ok(r.isVisible(id), id);
  assert.ok(!r.isVisible('#s1'));
  assert.ok(!r.isVisible('#s2'));
  assert.equal(r.doc.getElementById('vscroll').style.getPropertyValue('overflow'), 'hidden');
  assert.equal(r.state.forceBlock, null, 'odkaz /reels/audio/… není jiný reel');
});

test('DM viewer: spuštění dalšího reelu → Zablokováno s tlačítkem zpět do konverzace', () => {
  const r = runSite(instagramSite, DM_VIEWER_HTML, DM_URL);
  let applied = 0;
  r.state.requestApply = () => applied++;
  play(r, 'v0');
  assert.equal(r.state.forceBlock, null, 'poslaný reel hrát smí');
  play(r, 'v1');
  assert.deepEqual(r.state.forceBlock, {
    reason: 'Další reely',
    homeUrl: DM_URL,
    homeLabel: 'Zpět do zpráv',
  });
  assert.equal(applied, 1);
});

test('DM viewer: video jiné než poslané (bez data-reel-type) → také Zablokováno', () => {
  const html = DM_VIEWER_HTML.replace('<div id="s2" data-reel-type="suggested" data-fbid="3">', '<div id="s2">');
  const r = runSite(instagramSite, html, DM_URL);
  play(r, 'v2');
  assert.equal(r.state.forceBlock.reason, 'Další reely');
});

test('DM bez otevřeného vieweru: videa v chatu se přehrávají normálně', () => {
  const r = runSite(instagramSite, DM_HTML.replace('<div id="msg3">', '<div id="msg4"><video id="cv"></video></div><div id="msg3">'), DM_URL);
  play(r, 'cv');
  assert.equal(r.state.forceBlock, null);
  assert.ok(r.isVisible('#msg4'));
});

test('DM viewer zavřený → scroll se vrátí', () => {
  const r = runSite(instagramSite, DM_VIEWER_HTML, DM_URL);
  const vs = r.doc.getElementById('vscroll');
  assert.equal(vs.style.getPropertyValue('overflow'), 'hidden');
  for (const el of r.doc.querySelectorAll('#w0, #list')) el.remove();
  r.rescan();
  assert.equal(vs.getAttribute('style'), 'overflow-y: auto');
  assert.equal(r.state.scrollLocked.length, 0);
});

test('DM viewer s allowSingleReel=false: skrytý i poslaný reel a jeho přehrání blokuje', () => {
  const r = runSite(instagramSite, DM_VIEWER_HTML, DM_URL, { allowSingleReel: false });
  assert.ok(!r.isVisible('#shared'));
  assert.ok(r.isVisible('#thread'));
  play(r, 'v0');
  assert.equal(r.state.forceBlock.reason, 'Další reely');
});

test('předem načtené další reely (data-reel-type="suggested") jsou skryté i mimo zprávy', () => {
  const r = runSite(instagramSite, DM_VIEWER_HTML, 'https://www.instagram.com/reel/AAA/');
  assert.ok(!r.isVisible('#s1'));
});

test('stránka reelu: odkaz /reels/audio/… v položce není „jiný reel“', () => {
  const html = `<body><main><div id="viewer"><div id="item1"><video></video>
    <a href="/reel/AAA/">AAA</a><a href="/reels/audio/111/">zvuk</a></div></div></main></body>`;
  const r = runSite(instagramSite, html, 'https://www.instagram.com/reel/AAA/');
  assert.equal(r.state.forceBlock, null);
  assert.ok(r.isVisible('#item1'));
});
