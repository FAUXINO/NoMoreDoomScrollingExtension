// Pomocné funkce pro testy: načtení HTML do jsdom a spuštění modulu webu bez prohlížeče.
import { JSDOM, VirtualConsole } from 'jsdom';
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
// Pořadí jako v src/main.js: blocked() (může zamknout stav) → pageFlags → pravidla → scan.
// `state` lze předat z předchozího běhu (simulace SPA navigace).
export function runSite(site, html, url, cfgOverrides = {}, state = { forceBlock: null }) {
  // jsdom neumí přehrávat média (video.pause() hlásí „Not implemented“) – tyto hlášky potlačit.
  const virtualConsole = new VirtualConsole();
  virtualConsole.forwardTo(console, { omitJSDOMErrors: true });
  const dom = new JSDOM(html, { url, virtualConsole });
  const doc = dom.window.document;
  const cfg = cfgFor(site.id, cfgOverrides);
  const u = new URL(url);
  const hidden = [];
  const hide = (el, reason) => {
    const ok = hideEl(el, site.id + ': ' + reason);
    if (ok) hidden.push({ el, reason });
    return ok;
  };
  const blocked = site.blocked(u, cfg, state);
  setPageFlags(doc, site.pageFlags ? site.pageFlags(u, cfg, state) : []);
  applyRules(doc.body, site.rules(cfg), hide);
  if (site.scan) site.scan([doc.body], { cfg, url: u, hide, state });
  return {
    dom,
    doc,
    hidden,
    state,
    blocked,
    rescan: () => site.scan([doc.body], { cfg, url: u, hide, state }),
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
      const url = (html.match(/<!--\s*url:\s*(\S+)\s*-->/i) || [])[1];
      const expectVisible = [...html.matchAll(/<!--\s*expect-visible:\s*(.+?)\s*-->/gi)].map((m) => m[1]);
      return { file: join('fixtures', siteDir, f), html, url, expectVisible };
    });
}
