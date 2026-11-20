import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instagramSite } from '../src/sites/instagram.js';
import { runSite, cfgFor } from './helpers.mjs';

const cfg = cfgFor('instagram');
const u = (path) => new URL('https://www.instagram.com' + path);

test('Instagram: blokované URL', () => {
  for (const p of ['/reels/', '/reels/C1abc/', '/reel/C1abc/', '/reel/C1abc/?igsh=x', '/nekdo/reels/']) {
    assert.equal(instagramSite.blocked(u(p), cfg), 'Instagram Reels', p);
  }
  for (const p of ['/', '/p/C1abc/', '/nekdo/', '/direct/inbox/', '/explore/', '/stories/nekdo/123/', '/reelsfan/']) {
    assert.equal(instagramSite.blocked(u(p), cfg), null, p);
  }
});

const FEED_HTML = `<body>
<main>
  <div id="feed">
    <article id="photo"><header><a href="/kamarad/">kamarad</a></header><a href="/p/AAA/">foto</a></article>
    <article id="reel"><header><a href="/nekdo/">nekdo</a></header><a href="/reel/BBB/">reel</a></article>
    <div id="sugg-accounts">
      <div><span>Navrhované pro vás</span></div>
      <div><a href="/ucet1/">ucet1</a><a href="/ucet2/">ucet2</a></div>
    </div>
    <article id="sugg-post"><header><a href="/cizi/">cizi</a><span>Suggested for you</span></header><a href="/p/CCC/">foto</a></article>
    <article id="photo2"><a href="/p/DDD/">foto</a><span>Navrhované pro vás je skvělá věc v popisku</span></article>
  </div>
</main>
<nav id="bottom-nav">
  <a id="nav-home" href="/"><svg aria-label="Domů"></svg></a>
  <a id="nav-explore" href="/explore/"><svg aria-label="Hledat a prozkoumávat"></svg></a>
  <a id="nav-reels" href="/reels/"><svg aria-label="Reels"></svg></a>
  <a id="nav-dm" href="/direct/inbox/"><svg aria-label="Direct"></svg></a>
</nav>
</body>`;

test('Instagram feed: Reels a navrhované pryč, příspěvky přátel zůstanou', () => {
  const r = runSite(instagramSite, FEED_HTML, 'https://www.instagram.com/');
  assert.equal(r.blocked, null);
  assert.ok(r.isVisible('#photo'));
  assert.ok(r.isVisible('#photo2'), 'text v popisku nesmí způsobit skrytí');
  assert.ok(!r.isVisible('#reel'));
  assert.ok(!r.isVisible('#sugg-post'));
  assert.ok(!r.isVisible('#sugg-accounts'));
  assert.ok(r.isVisible('#feed'));
  assert.equal(r.visible('a[href*="/reel"]').length, 0);
});

test('Instagram navigace: Reels pryč, Domů/Explore/DM zůstanou', () => {
  const r = runSite(instagramSite, FEED_HTML, 'https://www.instagram.com/');
  assert.ok(!r.isVisible('#nav-reels'));
  for (const id of ['#nav-home', '#nav-explore', '#nav-dm']) assert.ok(r.isVisible(id), id);
});

test('Instagram: hideSuggested=false nechá navrhované být', () => {
  const r = runSite(instagramSite, FEED_HTML, 'https://www.instagram.com/', { hideSuggested: false });
  assert.ok(r.isVisible('#sugg-post'));
  assert.ok(r.isVisible('#sugg-accounts'));
});

const PROFILE_HTML = `<body><main>
  <header><h2>kamarad</h2></header>
  <div role="tablist">
    <a id="tab-posts" href="/kamarad/" role="tab">Příspěvky</a>
    <a id="tab-reels" href="/kamarad/reels/" role="tab">Reels</a>
    <a id="tab-tagged" href="/kamarad/tagged/" role="tab">Označení</a>
  </div>
  <div id="grid"><a id="g1" href="/p/AAA/">1</a><a id="g2" href="/reel/BBB/">2</a></div>
  <div id="similar"><span>Suggested for you</span><a href="/podobny/">podobny</a></div>
</main></body>`;

test('Instagram profil: záložka a dlaždice Reels pryč, příspěvky zůstanou', () => {
  const r = runSite(instagramSite, PROFILE_HTML, 'https://www.instagram.com/kamarad/');
  assert.ok(!r.isVisible('#tab-reels'));
  assert.ok(r.isVisible('#tab-posts'));
  assert.ok(r.isVisible('#tab-tagged'));
  assert.ok(r.isVisible('#g1'));
  assert.ok(!r.isVisible('#g2'));
  // Mimo feed se bloky navrhovaných účtů neskrývají (konzervativní chování).
  assert.ok(r.isVisible('#similar'));
});

const EXPLORE_HTML = `<body><main>
  <div id="search"><input placeholder="Hledat"></div>
  <div id="grid"><a id="e1" href="/p/AAA/">1</a><a id="e2" href="/reel/BBB/">2</a></div>
</main></body>`;

test('Instagram Explore: mřížka pryč, vyhledávání zůstane', () => {
  const r = runSite(instagramSite, EXPLORE_HTML, 'https://www.instagram.com/explore/');
  assert.ok(r.isVisible('#search'));
  assert.ok(!r.isVisible('#e1'));
  assert.ok(!r.isVisible('#e2'));
});

test('Instagram Explore: hideExplore=false nechá mřížku', () => {
  const r = runSite(instagramSite, EXPLORE_HTML, 'https://www.instagram.com/explore/', { hideExplore: false });
  assert.ok(r.isVisible('#e1'));
});
