// Testy nad skutečnými snapshoty stránek ve fixtures/<web>/*.html (postup viz fixtures/README.md).
// Pro každý snapshot ověří, že po spuštění modulu nezůstane viditelný žádný odkaz na
// Shorts/Reels a že prvky označené <!-- expect-visible: … --> zůstanou vidět.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeSite } from '../src/sites/youtube.js';
import { instagramSite } from '../src/sites/instagram.js';
import { facebookSite } from '../src/sites/facebook.js';
import { runSite, loadFixtures } from './helpers.mjs';

const SITES = [
  { site: youtubeSite, dir: 'youtube', forbidden: 'a[href^="/shorts/"], a[href*="youtube.com/shorts/"]' },
  { site: instagramSite, dir: 'instagram', forbidden: 'a[href*="/reel/"], a[href^="/reels/"]' },
  { site: facebookSite, dir: 'facebook', forbidden: 'a[href*="/reel/"]' },
];

let count = 0;
for (const { site, dir, forbidden } of SITES) {
  for (const fx of loadFixtures(dir)) {
    count++;
    test(`fixture ${fx.file}`, () => {
      assert.ok(fx.url, `${fx.file}: chybí první řádek <!-- url: https://… -->`);
      const r = runSite(site, fx.html, fx.url);
      if (r.blocked) return; // celá stránka se blokuje – obsah je jedno
      const left = r.visible(forbidden).map((a) => a.getAttribute('href'));
      assert.deepEqual(left, [], 'zůstaly viditelné odkazy na krátká videa');
      for (const sel of fx.expectVisible) {
        assert.ok(r.visible(sel).length > 0, `musí zůstat vidět: ${sel}`);
      }
    });
  }
}

if (count === 0) test('fixtures: žádné snapshoty (viz fixtures/README.md)', { skip: true }, () => {});
