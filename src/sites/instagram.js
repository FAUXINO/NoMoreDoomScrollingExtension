// Instagram (mobilní web). Selektory: href (/reel/, /reels/, /p/), <article>, <video>,
// role="dialog", aria-label, text CZ/EN. Žádné generované CSS třídy.
//
// „Jeden reel ze zprávy“ (CONFIG.instagram.allowSingleReel):
// Reel otevřený přímo (/reel/ID nebo /reels/ID – ze zpráv nebo z odkazu) se přehraje.
// Další reely se zobrazit nedají. Ochranu tvoří tři vrstvy:
//  1. zámek ID – první ID se zapamatuje, jiné ID v URL → „Zablokováno“ s tlačítkem do zpráv,
//  2. sousední položky ve vieweru (jiné <video>, odkazy na jiná ID) se skryjí,
//  3. scroll kontejnery kolem přehrávaného videa dostanou overflow:hidden (nejde swipovat).
// Pokud se obsah aktuální položky změní na jiný reel bez změny URL → také „Zablokováno“.
//
// Reel ze zprávy (mobilní web, ověřeno snapshotem 2026-11): otevře se jako overlay přímo
// v /direct/t/ID/, URL se nemění ani při swipu. Viewer má položky s atributem
// data-reel-type: "reshared" = reel poslaný ve zprávě, "suggested" = předem načtené
// další reely (u nás 8). Ve zprávách proto:
//  - CSS skryje každou položku data-reel-type kromě "reshared" (sousedé, swipe nemá kam),
//  - scroll kontejnery kolem povoleného videa dostanou overflow:hidden,
//  - když se přesto spustí jiné video než to poslané → „Zablokováno“ (pojistka přes
//    událost play, kdyby Instagram atribut přejmenoval).
import { registerSite } from '../core/registry.js';
import { flagSel } from '../core/style.js';
import { labelSet, findLabelElements } from '../core/text.js';
import { climbBelow, inNavigation, siblingBranch, unhideEl, HIDDEN_ATTR } from '../core/dom.js';
import { logInfo } from '../core/log.js';
import { IG_CHANNEL_CSS, igChannelInit, igChannelSync } from './instagram-channel.js';

// /reels/, /reels/ID/, /reel/ID/, /uzivatel/reels/
const IG_REELS_PATH = /^\/(?:[^/]+\/)?reels?(?:\/|$)/i;
// Jeden konkrétní reel: /reel/ID/ nebo /reels/ID/
const IG_SINGLE_REEL_PATH = /^\/reels?\/([A-Za-z0-9_-]+)\/?$/;
// ID reelu v odkazu. /reels/audio/123/ (reely se stejnou hudbou) ID reelu není.
const IG_REEL_ID_IN_HREF = /\/reels?\/(?!audio\/)([A-Za-z0-9_-]+)/;
const IG_DIRECT_PATH = /^\/direct(?:\/|$)/;
// Položky vieweru reelů: data-reel-type="reshared" (poslaný ve zprávě) / "suggested" (další).
const IG_REEL_ITEM = '[data-reel-type]';
const IG_SHARED_ITEM = '[data-reel-type="reshared"]';
const IG_REEL_LINK = 'a[href*="/reel/"]';
const IG_ANY_REEL_LINK = 'a[href*="/reel/"], a[href*="/reels/"]';
const IG_NOSCROLL_ATTR = 'data-noshorts-noscroll';

// Pravidla, která neplatí ve zprávách (náhledy reelů v chatu musí fungovat)
// ani na stránce jednoho povoleného reelu.
const IG_OUTSIDE_EXCEPTIONS = 'html:not([data-noshorts~="ig-direct"]):not([data-noshorts~="ig-single-reel"])';

const IG_SUGGESTED = labelSet([
  'Navrhované pro vás',
  'Navrhovaný pro vás',
  'Navrhované příspěvky',
  'Navrhované',
  'Doporučené pro vás',
  'Suggested for you',
  'Suggested posts',
  'Suggested',
  'Suggested reels',
  'Navrhované reels',
]);

export function igSingleReelId(pathname) {
  const m = IG_SINGLE_REEL_PATH.exec(pathname);
  return m ? m[1] : null;
}

function igReelIdFromHref(href) {
  const m = IG_REEL_ID_IN_HREF.exec(href || '');
  return m ? m[1] : null;
}

function igNextReelBlock(url) {
  // Ve vieweru nad konverzací vede tlačítko zpět do té konverzace (načte se znovu bez vieweru).
  const thread = /^\/direct\/t\/[^/]+\/?$/.test(url.pathname) ? url.pathname : '/direct/inbox/';
  return { reason: 'Další reely', homeUrl: url.origin + thread, homeLabel: 'Zpět do zpráv' };
}

// --- režim jednoho reelu ---------------------------------------------------

function igPickAllowedVideo(doc, state) {
  if (state.allowedVideo && state.allowedVideo.isConnected) return state.allowedVideo;
  state.allowedVideo = null;
  state.allowedItem = null;
  // Viewer otevřený jako dialog (přes konverzaci) má přednost před videi pod ním.
  const dialogs = [...doc.querySelectorAll('[role="dialog"]')].filter((d) => d.querySelector('video'));
  const scope = dialogs.length ? dialogs[dialogs.length - 1] : doc;
  for (const v of scope.querySelectorAll('video')) {
    if (!v.closest('[' + HIDDEN_ATTR + ']')) {
      state.allowedVideo = v;
      break;
    }
  }
  return state.allowedVideo;
}

function igLockScroll(allowed, state) {
  const doc = allowed.ownerDocument;
  const win = doc.defaultView;
  for (let el = allowed.parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    if (el.hasAttribute(IG_NOSCROLL_ATTR)) continue;
    const oy = win.getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') continue;
    el.setAttribute(IG_NOSCROLL_ATTR, el.getAttribute('style') || '');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('touch-action', 'pinch-zoom', 'important');
    el.style.setProperty('overscroll-behavior', 'none', 'important');
    state.scrollLocked.push(el);
    logInfo('zakázán scroll vieweru', el.tagName.toLowerCase());
  }
}

function igSingleReelScan(doc, state, hide) {
  state.singleHidden = state.singleHidden || [];
  state.scrollLocked = state.scrollLocked || [];
  const hideSingle = (el, reason) => {
    if (hide(el, reason) !== false) state.singleHidden.push(el);
  };

  const allowed = igPickAllowedVideo(doc, state);
  const scope = (allowed && allowed.closest('[role="dialog"]')) || doc.body;
  if (!scope) return;

  if (allowed) {
    // 2) Sousední položky = větve s jiným <video>.
    for (const v of scope.querySelectorAll('video')) {
      if (v === allowed) continue;
      const branch = siblingBranch(allowed, v);
      if (!branch || branch.querySelector('nav, [role="navigation"]')) continue;
      if (!state.allowedItem) state.allowedItem = siblingBranch(v, allowed);
      hideSingle(branch, 'další reel ve vieweru');
      try {
        v.pause();
      } catch (e) {
        /* ignorovat */
      }
    }
    // 3) Zákaz scrollu.
    igLockScroll(allowed, state);
  }

  // Odkazy na jiné reely: v aktuální položce = obsah se změnil → blokovat; jinde skrýt.
  for (const a of scope.querySelectorAll(IG_ANY_REEL_LINK)) {
    const id = igReelIdFromHref(a.getAttribute('href'));
    if (!id || id === state.reelId) continue;
    if (state.allowedItem && state.allowedItem.contains(a)) {
      logInfo('obsah vieweru se změnil na jiný reel:', id);
      state.forceBlock = igNextReelBlock(new URL(doc.location.href));
      return;
    }
    hideSingle((allowed && siblingBranch(allowed, a)) || a.closest('article') || a, 'odkaz na jiný reel');
  }
}

// --- reel ze zprávy (overlay v /direct/) -------------------------------------

// Pojistka: spuštění jiného videa než poslaného reelu, když je viewer otevřený → blokace.
function igInstallPlayGuard(doc, cfg, state) {
  if (state.playGuard === doc) return;
  state.playGuard = doc;
  doc.addEventListener(
    'play',
    (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO') return;
      const url = new URL(doc.location.href);
      if (!IG_DIRECT_PATH.test(url.pathname)) return;
      if (!doc.querySelector(IG_REEL_ITEM)) return; // viewer zavřený – videa v chatu jsou OK
      if (cfg.allowSingleReel && v.closest(IG_SHARED_ITEM)) return;
      try {
        v.pause();
      } catch (err) {
        /* ignorovat */
      }
      logInfo('ve vieweru se spustil další reel');
      state.forceBlock = igNextReelBlock(url);
      if (state.requestApply) state.requestApply();
    },
    true,
  );
}

// Vrací true, když je viewer otevřený (stav se nemá obnovovat).
function igDirectViewerScan(doc, cfg, state) {
  igInstallPlayGuard(doc, cfg, state);
  if (!doc.querySelector(IG_REEL_ITEM)) return false;
  state.scrollLocked = state.scrollLocked || [];
  const shared = cfg.allowSingleReel ? doc.querySelector(IG_SHARED_ITEM) : null;
  // Sousedy skrývá CSS; tady jen zastavit jejich videa (kdyby se načítala/hrála na pozadí).
  for (const v of doc.querySelectorAll(IG_REEL_ITEM + ' video')) {
    if (shared && shared.contains(v)) continue;
    try {
      if (!v.paused) v.pause();
    } catch (e) {
      /* ignorovat */
    }
  }
  const allowed = shared && shared.querySelector('video');
  if (allowed) igLockScroll(allowed, state);
  return true;
}

function igRestoreSingle(state) {
  for (const el of state.singleHidden || []) unhideEl(el);
  for (const el of state.scrollLocked || []) {
    const saved = el.getAttribute(IG_NOSCROLL_ATTR);
    if (saved) el.setAttribute('style', saved);
    else el.removeAttribute('style');
    el.removeAttribute(IG_NOSCROLL_ATTR);
  }
  state.singleHidden = [];
  state.scrollLocked = [];
  state.allowedVideo = null;
  state.allowedItem = null;
}

// ---------------------------------------------------------------------------
// Kanály (/channel/…) – čtení posledních zpráv, viz instagram-channel.js.

export const instagramSite = registerSite({
  id: 'instagram',

  matches(host) {
    return host === 'instagram.com' || host === 'www.instagram.com' || host === 'm.instagram.com';
  },

  home(url) {
    return url.origin + '/';
  },

  css(cfg) {
    return cfg.channelReader ? IG_CHANNEL_CSS : '';
  },

  init(win, { cfg, state }) {
    if (cfg.channelReader) igChannelInit(win, state);
  },

  onUrl(url, { cfg, state, doc }) {
    if (cfg.channelReader) igChannelSync(doc, state);
  },

  blocked(url, cfg, state = {}) {
    if (!cfg.blockReels) return null;
    const id = cfg.allowSingleReel ? igSingleReelId(url.pathname) : null;
    if (id) {
      // 1) Zámek ID: první otevřený reel je povolený, každý další ne.
      if (!state.reelId) {
        state.reelId = id;
        logInfo('povolen jeden reel:', id);
      }
      return state.reelId === id ? null : igNextReelBlock(url);
    }
    state.reelId = null; // odchod z reelu (např. zpět do zpráv) zámek uvolní
    if (IG_REELS_PATH.test(url.pathname)) return 'Instagram Reels';
    return null;
  },

  pageFlags(url, cfg) {
    const flags = [];
    if (cfg.hideExplore && /^\/explore\/?$/.test(url.pathname)) flags.push('ig-explore');
    if (IG_DIRECT_PATH.test(url.pathname)) flags.push('ig-direct');
    if (cfg.blockReels && cfg.allowSingleReel && igSingleReelId(url.pathname)) flags.push('ig-single-reel');
    return flags;
  },

  rules(cfg) {
    const rules = [];
    const add = (reason, ...selectors) => selectors.forEach((css) => rules.push({ css, reason }));

    if (cfg.blockReels) {
      const out = cfg.allowSingleReel ? IG_OUTSIDE_EXCEPTIONS + ' ' : '';
      add('záložka Reels', 'a[href="/reels/"]');
      add('Reel ve feedu', `${out}article:has(${IG_REEL_LINK})`);
      add('odkaz na Reels (navigace/profil)', `${out}a[href^="/reels/"]`, `${out}a[href$="/reels/"]`, `${out}a:has(svg[aria-label="Reels"])`);
      add('odkaz na Reel', `${out}${IG_REEL_LINK}`);
      // Viewer reelů: předem načtené další reely kdekoli; ve zprávách vše kromě poslaného.
      add('další reel ve vieweru', '[data-reel-type="suggested"]');
      add(
        'další reel ve vieweru (zprávy)',
        `${flagSel('ig-direct')} ${IG_REEL_ITEM}${cfg.allowSingleReel ? `:not(${IG_SHARED_ITEM})` : ''}`,
      );
    }

    if (cfg.hideExplore) {
      const explore = flagSel('ig-explore');
      add('mřížka Explore', `${explore} main a[href^="/p/"]`, `${explore} main ${IG_REEL_LINK}`);
    }
    return rules;
  },

  scan(roots, { cfg, url, hide, state = {} }) {
    const doc = roots.length ? roots[0].ownerDocument : null;
    if (!doc) return;
    if (cfg.channelReader) igChannelSync(doc, state);

    const single = cfg.blockReels && cfg.allowSingleReel && igSingleReelId(url.pathname);
    let active = false;
    if (single && state.reelId) {
      igSingleReelScan(doc, state, hide);
      active = true;
    } else if (cfg.blockReels && IG_DIRECT_PATH.test(url.pathname)) {
      active = igDirectViewerScan(doc, cfg, state);
    }
    if (!active && ((state.singleHidden && state.singleHidden.length) || (state.scrollLocked && state.scrollLocked.length))) {
      igRestoreSingle(state);
    }

    if (!cfg.hideSuggested) return;
    for (const root of roots) {
      for (const label of findLabelElements(root, IG_SUGGESTED)) {
        if (inNavigation(label)) continue;
        const article = label.closest('article');
        if (article) {
          hide(article, 'navrhovaný příspěvek');
        } else if (url.pathname === '/') {
          // Blok navrhovaných účtů mezi příspěvky ve feedu.
          const block = climbBelow(label, 'article');
          if (block) hide(block, 'navrhované účty');
        }
      }
    }
  },
});
