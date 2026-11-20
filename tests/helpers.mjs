// Pomocné funkce pro testy: načtení HTML do jsdom a spuštění modulu webu bez prohlížeče.
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import { hideEl, applyRules, isHiddenByScript } from '../src/core/dom.js';
import { setPageFlags } from '../src/core/style.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function cfgFor(siteId, overrides = {}) {
  return { ...CONFIG[siteId], ...overrides };
}

// Spustí modul webu nad HTML (jako by běžel v prohlížeči) a vrátí dokument + pomocníky.
export function runSite(site, html, url, cfgOverrides = {}) {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const cfg = cfgFor(site.id, cfgOverrides);
  const u = new URL(url);
  const hidden = [];
  const hide = (el, reason) => {
    if (hideEl(el, site.id + ': ' + reason)) hidden.push({ el, reason });
  };
  setPageFlags(doc, site.pageFlags ? site.pageFlags(u, cfg) : []);
  applyRules(doc.body, site.rules(cfg), hide);
  if (site.scan) site.scan([doc.body], { cfg, url: u, hide });
  return {
    doc,
    hidden,
    blocked: site.blocked(u, cfg),
    visible: (sel) => [...doc.querySelectorAll(sel)].filter((el) => !isHiddenByScript(el)),
    isVisible: (sel) => {
      const el = doc.querySelector(sel);
      if (!el) throw new Error('Element nenalezen: ' + sel);
      return !isHiddenByScript(el);
    },
  };
}

// Načte skutečné snapshoty z fixtures/<web>/*.html.
// První řádek souboru: <!-- url: https://… -->, volitelně další řádky
// <!-- expect-visible: selektor --> pro prvky, které musí zůstat vidět.
export function loadFixtures(siteDir) {
  const dir = join(ROOT, 'fixtures', siteDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      const html = readFileSync(join(dir, f), 'utf8');
      const url = (html.match(/<!--\s*url:\s*(\S+)\s*-->/) || [])[1];
      const expectVisible = [...html.matchAll(/<!--\s*expect-visible:\s*(.+?)\s*-->/g)].map((m) => m[1]);
      return { file: join('fixtures', siteDir, f), html, url, expectVisible };
    });
}
