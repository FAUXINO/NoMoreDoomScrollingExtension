// Testy nad skutečnými snapshoty stránek ve fixtures/<web>/*.html (postup viz fixtures/README.md).
// Pro každý snapshot ověří, že po spuštění modulu nezůstane viditelný žádný odkaz na
// Shorts/Reels a že prvky označené <!-- expect-visible: … --> zůstanou vidět.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeSite } from '../src/sites/youtube.js';
import { instagramSite } from '../src/sites/instagram.js';
import { facebookSite } from '../src/sites/facebook.js';
import { runSite, loadFixtures } from './helpers.mjs';

const reelId = (href) => (/\/reels?\/([A-Za-z0-9_-]+)/.exec(href || '') || [])[1] || null;

// Které viditelné odkazy jsou chyba (vrací seznam href).
const SITES = [
  {
    site: youtubeSite,
    dir: 'youtube',
    leftovers: (r) => r.visible('a[href^="/shorts/"], a[href*="youtube.com/shorts/"]'),
  },
  {
    site: instagramSite,
    dir: 'instagram',
    leftovers: (r, url) => {
      // Ve zprávách jsou náhledy reelů povolené.
      if (url.pathname.startsWith('/direct/')) return [];
      const links = r.visible('a[href*="/reel/"], a[href^="/reels/"]');
      // Na stránce jednoho reelu smí zůstat jen odkazy na ten jeden reel.
      if (r.state.reelId) return links.filter((a) => reelId(a.getAttribute('href')) !== r.state.reelId);
      return links;
    },
  },
  { site: facebookSite, dir: 'facebook', leftovers: (r) => r.visible('a[href*="/reel/"]') },
];

let count = 0;
for (const { site, dir, leftovers } of SITES) {
  for (const fx of loadFixtures(dir)) {
    count++;
    test(`fixture ${fx.file}`, () => {
      assert.ok(fx.url, `${fx.file}: chybí první řádek <!-- url: https://… -->`);
      const r = runSite(site, fx.html, fx.url);
      if (r.blocked) return; // celá stránka se blokuje – obsah je jedno
      const left = leftovers(r, new URL(fx.url)).map((a) => a.getAttribute('href'));
      assert.deepEqual(left, [], 'zůstaly viditelné odkazy na krátká videa');
      for (const sel of fx.expectVisible) {
        assert.ok(r.visible(sel).length > 0, `musí zůstat vidět: ${sel}`);
      }
    });
  }
}

if (count === 0) test('fixtures: žádné snapshoty (viz fixtures/README.md)', { skip: true }, () => {});
