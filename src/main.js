// Vstupní bod: vybere modul podle webu a spustí ho. Každý krok modulu je v try/catch,
// aby chyba v jednom pravidle neshodila zbytek.
import { CONFIG } from './config.js';
import { SITES } from './core/registry.js';
import { setDebug, isDebug, logInfo, logError } from './core/log.js';
import { BASE_CSS, hideEl, applyRules } from './core/dom.js';
import { rulesToCss, ensureStyle, setPageFlags } from './core/style.js';
import { BLOCK_CSS, isBlocked, showBlock, hideBlock, silenceMedia } from './core/blockScreen.js';
import { watchUrl, watchMutations } from './core/watch.js';

const STYLE_ID = 'noshorts-style';

function safe(where, fn, fallback) {
  try {
    return fn();
  } catch (e) {
    logError(where, e);
    return fallback;
  }
}

function runSite(win, site, cfg) {
  const doc = win.document;
  const hide = (el, reason) => hideEl(el, site.id + ': ' + reason);
  const rules = safe(site.id + '.rules', () => site.rules(cfg), []);
  const css = [BASE_CSS, BLOCK_CSS, rulesToCss(rules)].join('\n');
  const ensureCss = () => ensureStyle(doc, STYLE_ID, css);
  ensureCss();
  logInfo('spuštěno pro', site.id, '(' + rules.length + ' pravidel)');

  let url = new URL(win.location.href);
  let mediaTimer = null;

  const applyUrl = () => {
    url = new URL(win.location.href);
    const flags = safe(site.id + '.pageFlags', () => (site.pageFlags ? site.pageFlags(url, cfg) : []), []);
    setPageFlags(doc, flags);
    const reason = safe(site.id + '.blocked', () => site.blocked(url, cfg), null);
    if (reason) {
      showBlock(doc, { reason, homeUrl: site.home ? site.home(url) : null });
      // Dokud je stránka zablokovaná, pravidelně zastavovat přehrávání (autoplay).
      if (!mediaTimer) mediaTimer = win.setInterval(() => silenceMedia(doc), 700);
    } else {
      hideBlock(doc);
      if (mediaTimer) {
        win.clearInterval(mediaTimer);
        mediaTimer = null;
      }
    }
  };

  const scanRoots = (roots) => {
    ensureCss();
    if (isBlocked(doc)) applyUrl(); // obnoví overlay, kdyby ho stránka odstranila
    else setPageFlags(doc, safe(site.id + '.pageFlags', () => (site.pageFlags ? site.pageFlags(url, cfg) : []), []));
    if (site.scan) safe(site.id + '.scan', () => site.scan(roots, { cfg, url, hide }));
    if (isDebug()) for (const root of roots) applyRules(root, rules, hide);
  };

  applyUrl();
  const checkUrl = watchUrl(win, applyUrl);
  watchMutations(win, { onMutation: checkUrl, onBatch: scanRoots });

  const initialScan = () => scanRoots([doc.body || doc.documentElement]);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', initialScan, { once: true });
  else initialScan();
}

export function boot(win) {
  setDebug(CONFIG.debug);
  const host = win.location.hostname;
  const site = SITES.find((s) => safe(s.id + '.matches', () => s.matches(host), false));
  if (!site) return;
  const cfg = CONFIG[site.id];
  if (!cfg || !cfg.enabled) {
    logInfo('modul vypnutý v CONFIG:', site.id);
    return;
  }
  safe(site.id, () => runSite(win, site, cfg));
}
