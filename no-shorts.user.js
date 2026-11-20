// ==UserScript==
// @name         No Shorts
// @namespace    https://github.com/FAUXINO/NoMoreDoomScrollingExtension
// @version      0.1.0
// @description  Skryje Reels, Shorts a krátká videa na Instagramu, Facebooku, YouTube a TikToku (mobilní Safari).
// @author       FAUXINO
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://youtube.com/*
// @match        *://*.instagram.com/*
// @match        *://*.facebook.com/*
// @match        *://*.tiktok.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// @updateURL    https://raw.githubusercontent.com/FAUXINO/NoMoreDoomScrollingExtension/main/no-shorts.meta.js
// @downloadURL  https://raw.githubusercontent.com/FAUXINO/NoMoreDoomScrollingExtension/main/no-shorts.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- src/config.js ----
  // ============================================================================
  // NASTAVENÍ – uprav podle potřeby (true = zapnuto, false = vypnuto).
  // Pozor: aktualizace skriptu z GitHubu tyto hodnoty přepíše na výchozí.
  // ============================================================================
  const CONFIG = {
    // Vypisuje do konzole, co skript skryl/zablokoval a proč ([no-shorts] ...).
    debug: false,

    youtube: {
      enabled: true,
      blockShorts: true, // blokovat /shorts/…, skrýt police, záložku a výsledky se Shorts
      hideHomeFeed: true, // prázdná hlavní stránka (bez doporučených videí)
    },

    instagram: {
      enabled: true,
      blockReels: true, // blokovat /reels/ a /reel/…, skrýt Reels ve feedu, navigaci a profilech
      hideExplore: true, // skrýt mřížku na /explore/ (vyhledávání zůstane)
      hideSuggested: true, // skrýt navrhované příspěvky a účty ve feedu
    },

    facebook: {
      enabled: true,
      blockReels: true, // blokovat /reel/…, skrýt Reels ve feedu a navigaci
      blockWatch: true, // blokovat záložku Video/Watch (jednotlivá videa od přátel zůstanou)
      hideSuggested: true, // skrýt příspěvky „Navrhované pro vás“
      hideStories: true, // skrýt lištu Příběhů
    },

    tiktok: {
      enabled: true, // zablokovat celý TikTok
    },
  };

  // ---- src/core/log.js ----
  // Debug logování. Zapíná se přes CONFIG.debug.
  let DEBUG = false;

  function setDebug(value) {
    DEBUG = !!value;
  }

  function isDebug() {
    return DEBUG;
  }

  function logInfo(...args) {
    if (DEBUG) console.info('[no-shorts]', ...args);
  }

  function logError(where, err) {
    console.error('[no-shorts] chyba v', where, err);
  }

  // Krátký popis elementu pro log: tag, aria-label, href.
  function describeEl(el) {
    if (!el || el.nodeType !== 1) return String(el);
    let s = '<' + el.tagName.toLowerCase();
    const label = el.getAttribute('aria-label');
    if (label) s += ' aria-label="' + label.slice(0, 40) + '"';
    const href = el.getAttribute('href');
    if (href) s += ' href="' + href.slice(0, 60) + '"';
    return s + '>';
  }

  // ---- src/core/registry.js ----
  // Seznam modulů webů. Každý modul v src/sites/ se zaregistruje přes registerSite().
  //
  // Rozhraní modulu:
  //   id            klíč v CONFIG (např. 'youtube')
  //   matches(host) true, pokud modul patří k danému hostname
  //   home(url)     URL hlavní stránky pro tlačítko na obrazovce „Zablokováno“ (nebo null)
  //   blocked(url, cfg)     důvod blokace celé stránky (string) nebo null
  //   pageFlags(url, cfg)   pole příznaků do html[data-noshorts] (pro CSS podle stránky)
  //   rules(cfg)            [{ css, reason }] – statická pravidla (CSS se vloží hned při startu)
  //   scan(roots, ctx)      dynamické skrývání (text, hledání kontejneru); ctx = { cfg, url, hide }
  const SITES = [];

  function registerSite(site) {
    SITES.push(site);
    return site;
  }

  // ---- src/core/text.js ----
  // Práce s textem (popisky v UI – podporujeme češtinu i angličtinu).

  function normText(s) {
    return (s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function labelSet(labels) {
    return new Set(labels.map(normText));
  }

  const LABEL_SELECTOR = 'span, h1, h2, h3, h4, [role="heading"]';
  const MAX_LABEL_LENGTH = 60;

  // Najde elementy, jejichž celý text přesně odpovídá některému z popisků.
  // Hledá jen v krátkých textech (nadpisy, štítky), ne v obsahu příspěvků.
  function findLabelElements(root, labels, selector = LABEL_SELECTOR) {
    const out = [];
    if (!root || root.nodeType !== 1) return out;
    const check = (el) => {
      const t = el.textContent;
      if (t && t.length <= MAX_LABEL_LENGTH && labels.has(normText(t))) out.push(el);
    };
    if (root.matches(selector)) check(root);
    for (const el of root.querySelectorAll(selector)) check(el);
    return out;
  }

  // ---- src/core/dom.js ----
  // Skrývání elementů a hledání kontejnerů (příspěvek ve feedu apod.).

  const HIDDEN_ATTR = 'data-noshorts-hidden';
  const BASE_CSS = '[' + HIDDEN_ATTR + ']{display:none!important}';

  // Skryje element a zapíše důvod do atributu (vidět v inspektoru i v debug logu).
  function hideEl(el, reason) {
    if (!el || el.nodeType !== 1 || el.hasAttribute(HIDDEN_ATTR)) return false;
    if (el === el.ownerDocument.documentElement || el === el.ownerDocument.body) return false;
    el.setAttribute(HIDDEN_ATTR, reason);
    logInfo('skryto:', reason, describeEl(el));
    return true;
  }

  function isHiddenByScript(el) {
    return !!el.closest('[' + HIDDEN_ATTR + ']');
  }

  // Aplikuje statická pravidla i přes JS (pro debug log a testy; vizuálně je skryje už CSS).
  function applyRules(root, rules, hide) {
    if (!root || root.nodeType !== 1) return;
    for (const rule of rules) {
      try {
        if (root.matches(rule.css)) hide(root, rule.reason);
        for (const el of root.querySelectorAll(rule.css)) hide(el, rule.reason);
      } catch (e) {
        // Nepodporovaný selektor (např. :has() ve starém prohlížeči) – přeskočit.
      }
    }
  }

  const STOP_SELECTOR = 'html, body, main, nav, [role="main"], [role="navigation"], [role="banner"]';

  // Najde „jednotku“ (příspěvek) obsahující el:
  // 1) nejbližší předek odpovídající unitSel,
  // 2) jinak přímý potomek kontejneru feedu (feedSel).
  // Pokud nic nenajde, vrátí null (raději nic neskrýt než skrýt půl stránky).
  function findUnit(el, { unitSel, feedSel, maxUp = 40 }) {
    if (unitSel) {
      const unit = el.closest(unitSel);
      if (unit) return unit;
    }
    if (!feedSel) return null;
    let cur = el;
    for (let i = 0; cur && i < maxUp; i++) {
      const parent = cur.parentElement;
      if (!parent) return null;
      if (parent.matches(feedSel)) return cur;
      if (parent.matches(STOP_SELECTOR)) return null;
      cur = parent;
    }
    return null;
  }

  // Vystoupá od el nahoru až těsně pod předka, který obsahuje `boundarySel`
  // (např. 'article' – tedy blok vedle příspěvků ve feedu). Pokud takový předek
  // do maxUp úrovní neexistuje, vrátí null (konzervativní – nic neskrýt).
  function climbBelow(el, boundarySel, maxUp = 8) {
    let cur = el;
    for (let i = 0; i < maxUp; i++) {
      const parent = cur.parentElement;
      if (!parent || parent.matches(STOP_SELECTOR)) return null;
      if (parent.querySelector(boundarySel)) return cur === el ? null : cur;
      cur = parent;
    }
    return null;
  }

  // Je element v navigaci / liště záložek? (tam nechceme skrývat celé „jednotky“)
  function inNavigation(el) {
    return !!el.closest('nav, [role="navigation"], [role="tablist"], [role="banner"]');
  }

  // ---- src/core/style.js ----
  // Vložení CSS co nejdřív (document-start) a hlídání, aby ho stránka neodstranila.

  function rulesToCss(rules) {
    return rules.map((r) => r.css + '{display:none!important}').join('\n');
  }

  function ensureStyle(doc, id, cssText) {
    let style = doc.getElementById(id);
    if (style && style.isConnected) return style;
    style = doc.createElement('style');
    style.id = id;
    style.textContent = cssText;
    // Na document-start ještě nemusí existovat <head> – pak rovnou do <html>.
    (doc.head || doc.documentElement).appendChild(style);
    return style;
  }

  const FLAGS_ATTR = 'data-noshorts';

  // Příznaky stránky na <html> (např. "yt-home"), pro CSS typu html[data-noshorts~="yt-home"].
  function setPageFlags(doc, flags) {
    const html = doc.documentElement;
    const value = flags.join(' ');
    if (value) {
      if (html.getAttribute(FLAGS_ATTR) !== value) html.setAttribute(FLAGS_ATTR, value);
    } else if (html.hasAttribute(FLAGS_ATTR)) {
      html.removeAttribute(FLAGS_ATTR);
    }
  }

  function flagSel(flag) {
    return 'html[' + FLAGS_ATTR + '~="' + flag + '"]';
  }

  // ---- src/core/blockScreen.js ----
  // Obrazovka „Zablokováno“ – nahradí obsah stránky, když je otevřená blokovaná URL.

  const BLOCK_ID = 'noshorts-block';
  const BLOCKED_ATTR = 'data-noshorts-blocked';

  const BLOCK_CSS = `
  html[${BLOCKED_ATTR}] > body{display:none!important}
  html[${BLOCKED_ATTR}]{overflow:hidden!important}
  #${BLOCK_ID}{all:initial;position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;text-align:center;
    font:17px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f4f5;color:#18181b}
  #${BLOCK_ID} *{all:revert;font-family:inherit}
  #${BLOCK_ID} .ns-title{font-size:28px;font-weight:700;margin:0}
  #${BLOCK_ID} .ns-text{margin:0;max-width:22em;color:#52525b}
  #${BLOCK_ID} .ns-btn{display:inline-block;padding:12px 20px;border-radius:12px;background:#2563eb;color:#fff;
    text-decoration:none;font-weight:600}
  @media (prefers-color-scheme: dark){
    #${BLOCK_ID}{background:#18181b;color:#f4f4f5}
    #${BLOCK_ID} .ns-text{color:#a1a1aa}
  }`;

  function isBlocked(doc) {
    return doc.documentElement.hasAttribute(BLOCKED_ATTR);
  }

  function showBlock(doc, { reason, homeUrl }) {
    const html = doc.documentElement;
    if (!html.hasAttribute(BLOCKED_ATTR)) logInfo('zablokováno:', reason, doc.location && doc.location.href);
    html.setAttribute(BLOCKED_ATTR, reason);
    let box = doc.getElementById(BLOCK_ID);
    if (!box || box.dataset.reason !== reason) {
      if (box) box.remove();
      box = doc.createElement('div');
      box.id = BLOCK_ID;
      box.dataset.reason = reason;
      const title = doc.createElement('p');
      title.className = 'ns-title';
      title.textContent = 'Zablokováno';
      const text = doc.createElement('p');
      text.className = 'ns-text';
      text.textContent = reason + ' jsou vypnuté skriptem No Shorts.';
      box.append(title, text);
      if (homeUrl) {
        const btn = doc.createElement('a');
        btn.className = 'ns-btn';
        btn.href = homeUrl;
        btn.textContent = 'Zpět na hlavní stránku';
        box.append(btn);
      }
    }
    // Vkládá se do <html> (vedle <body>), protože <body> je skryté a na document-start ani nemusí existovat.
    if (!box.isConnected) html.appendChild(box);
    silenceMedia(doc);
  }

  function hideBlock(doc) {
    const html = doc.documentElement;
    if (!html.hasAttribute(BLOCKED_ATTR)) return;
    html.removeAttribute(BLOCKED_ATTR);
    const box = doc.getElementById(BLOCK_ID);
    if (box) box.remove();
    logInfo('odblokováno:', doc.location && doc.location.href);
  }

  // Skrytá stránka by mohla dál přehrávat zvuk – zastavit všechna média.
  function silenceMedia(doc) {
    for (const m of doc.querySelectorAll('video, audio')) {
      try {
        if (!m.paused) m.pause();
      } catch (e) {
        /* ignorovat */
      }
    }
  }

  // ---- src/core/watch.js ----
  // Sledování změn URL (SPA) a nového obsahu (MutationObserver s omezením frekvence).
  //
  // Skript běží v izolovaném světě content scriptu (kvůli CSP Mety), takže nemůže
  // přepsat history.pushState stránky. Změnu URL proto zjišťujeme:
  //  - levným porovnáním location.href při každé dávce mutací (SPA navigace vždy mění DOM),
  //  - událostmi popstate/hashchange,
  //  - Navigation API (currententrychange), pokud ho prohlížeč má,
  //  - krátce po kliknutí (navigace odkazem).
  function watchUrl(win, onChange) {
    let last = win.location.href;
    const check = () => {
      const now = win.location.href;
      if (now !== last) {
        last = now;
        onChange(now);
      }
    };
    win.addEventListener('popstate', check);
    win.addEventListener('hashchange', check);
    try {
      if (win.navigation && win.navigation.addEventListener) {
        win.navigation.addEventListener('currententrychange', check);
      }
    } catch (e) {
      /* Navigation API není k dispozici */
    }
    win.document.addEventListener('click', () => win.setTimeout(check, 60), true);
    return check;
  }

  const MAX_PENDING = 400;

  // Sleduje přidané uzly a předává je dávkově (nejvýš jednou za `delay` ms).
  // Když je stránka na pozadí (document.hidden), skenování se odkládá – šetří baterii.
  function watchMutations(win, { onMutation, onBatch, delay = 300 }) {
    const doc = win.document;
    let pending = new Set();
    let full = false;
    let timer = null;

    const flush = () => {
      timer = null;
      if (doc.hidden) return;
      const roots = full ? [doc.body || doc.documentElement] : [...pending];
      pending = new Set();
      full = false;
      onBatch(roots.filter((n) => n.isConnected));
    };
    const schedule = () => {
      if (!timer && !doc.hidden && (full || pending.size)) timer = win.setTimeout(flush, delay);
    };

    const mo = new win.MutationObserver((records) => {
      onMutation();
      if (!full) {
        for (const r of records) {
          for (const n of r.addedNodes) {
            if (n.nodeType === 1) pending.add(n);
            else if (n.nodeType === 3 && n.parentElement) pending.add(n.parentElement);
          }
        }
        if (pending.size > MAX_PENDING) {
          full = true;
          pending = new Set();
        }
      }
      schedule();
    });
    mo.observe(doc.documentElement, { childList: true, subtree: true });
    doc.addEventListener('visibilitychange', schedule);
    return mo;
  }

  // ---- src/sites/youtube.js ----
  // YouTube (m.youtube.com – mobilní layout; základní pravidla i pro www.youtube.com).
  // Selektory stojí na názvech custom elementů YouTube (ytm-*, ytd-*) a na href /shorts/,
  // ne na generovaných CSS třídách.

  const YT_SHORTS_LINK = 'a[href^="/shorts/"]';
  const YT_SHORTS_ITEMS = 'ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2';

  // /shorts, /shorts/ID, /@kanal/shorts, /channel/ID/shorts, /c/jmeno/shorts, /user/jmeno/shorts
  const YT_SHORTS_PATH = /^\/(?:(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/)?shorts(?:\/|$)/i;

  const youtubeSite = registerSite({
    id: 'youtube',

    matches(host) {
      return host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com';
    },

    home(url) {
      return url.origin + '/';
    },

    blocked(url, cfg) {
      if (cfg.blockShorts && YT_SHORTS_PATH.test(url.pathname)) return 'YouTube Shorts';
      return null;
    },

    pageFlags(url, cfg) {
      const flags = [];
      if (cfg.hideHomeFeed && (url.pathname === '/' || url.pathname === '')) flags.push('yt-home');
      return flags;
    },

    rules(cfg) {
      const rules = [];
      const add = (reason, ...selectors) => selectors.forEach((css) => rules.push({ css, reason }));

      if (cfg.blockShorts) {
        add(
          'police se Shorts',
          'ytm-reel-shelf-renderer',
          'ytd-reel-shelf-renderer',
          'ytd-rich-shelf-renderer[is-shorts]',
          `ytm-rich-section-renderer:has(${YT_SHORTS_ITEMS})`,
          `ytd-rich-section-renderer:has(${YT_SHORTS_ITEMS})`,
          `grid-shelf-view-model:has(${YT_SHORTS_ITEMS})`,
          `ytm-item-section-renderer:has(> ytm-reel-shelf-renderer)`
        );
        add(
          'Short ve výsledcích/na kanálu',
          'ytm-shorts-lockup-view-model',
          'ytm-shorts-lockup-view-model-v2',
          `ytm-rich-item-renderer:has(${YT_SHORTS_LINK})`,
          `ytd-rich-item-renderer:has(${YT_SHORTS_LINK})`,
          `ytm-video-with-context-renderer:has(${YT_SHORTS_LINK})`,
          `ytm-compact-video-renderer:has(${YT_SHORTS_LINK})`,
          `ytd-video-renderer:has(${YT_SHORTS_LINK})`,
          `ytd-grid-video-renderer:has(${YT_SHORTS_LINK})`
        );
        add(
          'záložka Shorts',
          'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
          'ytm-pivot-bar-item-renderer:has(a[href^="/shorts"])',
          'yt-tab-shape[tab-title="Shorts"]',
          '[role="tab"]:has(> a[href$="/shorts"])',
          'ytd-guide-entry-renderer:has(a[title="Shorts"])',
          'ytd-mini-guide-entry-renderer[aria-label="Shorts"]'
        );
        // Pojistka: jakýkoli zbývající odkaz na Short.
        add('odkaz na Short', YT_SHORTS_LINK, 'a[href$="/shorts"]');
      }

      if (cfg.hideHomeFeed) {
        const home = flagSel('yt-home');
        add(
          'doporučení na hlavní stránce',
          `${home} ytm-browse ytm-rich-grid-renderer`,
          `${home} ytm-browse ytm-section-list-renderer`,
          'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer'
        );
      }
      return rules;
    },

    // Vše řeší statická pravidla (CSS); dynamické skenování není potřeba.
    scan() {},
  });

  // ---- src/main.js ----
  // Vstupní bod: vybere modul podle webu a spustí ho. Každý krok modulu je v try/catch,
  // aby chyba v jednom pravidle neshodila zbytek.

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

  function boot(win) {
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

  boot(window);
})();
