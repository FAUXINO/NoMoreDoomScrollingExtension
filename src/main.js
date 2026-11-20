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

// blocked() smí vrátit text důvodu, nebo objekt { reason, homeUrl?, homeLabel? }.
function normalizeBlock(res, site, url) {
  if (!res) return null;
  const homeUrl = site.home ? site.home(url) : null;
  if (typeof res === 'string') return { reason: res, homeUrl };
  return { homeUrl, ...res };
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
  // Stav modulu po dobu života stránky (např. zamčené ID reelu). Modul do něj smí zapsat
  // forceBlock = { reason, homeUrl, homeLabel }, když zjistí blokovaný obsah bez změny URL.
  const state = { forceBlock: null };

  const pageFlags = () => safe(site.id + '.pageFlags', () => (site.pageFlags ? site.pageFlags(url, cfg, state) : []), []);

  const applyUrl = () => {
    url = new URL(win.location.href);
    const res = safe(site.id + '.blocked', () => site.blocked(url, cfg, state), null) || state.forceBlock;
    setPageFlags(doc, pageFlags());
    const block = normalizeBlock(res, site, url);
    if (block) {
      showBlock(doc, block);
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

  // Modul si může vyžádat okamžité vyhodnocení forceBlock mimo dávku mutací (např. z události play).
  state.requestApply = () => {
    if (state.forceBlock && !isBlocked(doc)) safe(site.id + '.requestApply', applyUrl);
  };

  const onUrlChange = () => {
    state.forceBlock = null;
    applyUrl();
  };

  const scanRoots = (roots) => {
    ensureCss();
    if (isBlocked(doc)) applyUrl(); // obnoví overlay, kdyby ho stránka odstranila
    else setPageFlags(doc, pageFlags());
    if (site.scan) safe(site.id + '.scan', () => site.scan(roots, { cfg, url, hide, state }));
    if (state.forceBlock && !isBlocked(doc)) applyUrl();
    if (isDebug()) for (const root of roots) applyRules(root, rules, hide);
  };

  applyUrl();
  const checkUrl = watchUrl(win, onUrlChange);
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
