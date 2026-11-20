// ==UserScript==
// @name         No Shorts
// @namespace    https://github.com/FAUXINO/NoMoreDoomScrollingExtension
// @version      0.2.0
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
      blockReels: true, // blokovat záložku /reels/, skrýt Reels ve feedu, navigaci a profilech
      allowSingleReel: true, // reel ze zprávy/odkazu (/reel/ID) se přehraje, ale jen ten jeden – další jsou zablokované
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
  //   blocked(url, cfg, state)    důvod blokace celé stránky: string, { reason, homeUrl?, homeLabel? }, nebo null
  //   pageFlags(url, cfg, state)  pole příznaků do html[data-noshorts] (pro CSS podle stránky)
  //   rules(cfg)                  [{ css, reason }] – statická pravidla (CSS se vloží hned při startu)
  //   scan(roots, ctx)            dynamické skrývání; ctx = { cfg, url, hide, state }
  // `state` je objekt modulu po dobu života stránky (např. zamčené ID reelu). Nastavením
  // state.forceBlock = { reason, … } může scan zablokovat stránku i bez změny URL.
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

  // Vrátí „větev“ elementu el vzhledem k anchor: potomka nejbližšího společného předka,
  // který obsahuje el (ne anchor). Typicky sousední položka seznamu (další reel ve vieweru).
  function siblingBranch(anchor, el) {
    if (!anchor || !el || anchor === el || anchor.contains(el) || el.contains(anchor)) return null;
    let cur = el;
    while (cur.parentElement && !cur.parentElement.contains(anchor)) cur = cur.parentElement;
    return cur.parentElement ? cur : null;
  }

  function unhideEl(el) {
    if (el && el.removeAttribute) el.removeAttribute(HIDDEN_ATTR);
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

  function showBlock(doc, { reason, homeUrl, homeLabel = 'Zpět na hlavní stránku' }) {
    const html = doc.documentElement;
    if (!html.hasAttribute(BLOCKED_ATTR)) logInfo('zablokováno:', reason, doc.location && doc.location.href);
    html.setAttribute(BLOCKED_ATTR, reason);
    const key = reason + '|' + (homeUrl || '');
    let box = doc.getElementById(BLOCK_ID);
    if (!box || box.dataset.key !== key) {
      if (box) box.remove();
      box = doc.createElement('div');
      box.id = BLOCK_ID;
      box.dataset.key = key;
      const title = doc.createElement('p');
      title.className = 'ns-title';
      title.textContent = 'Zablokováno';
      const text = doc.createElement('p');
      text.className = 'ns-text';
      text.textContent = reason + ' – tuhle stránku blokuje skript No Shorts.';
      box.append(title, text);
      if (homeUrl) {
        const btn = doc.createElement('a');
        btn.className = 'ns-btn';
        btn.href = homeUrl;
        btn.textContent = homeLabel;
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

  // ---- src/sites/facebook.js ----
  // Facebook (m.facebook.com / www.facebook.com v mobilním layoutu).
  // Meta generuje náhodné CSS třídy, proto se opíráme jen o href (/reel/, /watch),
  // aria-label, role, data-atributy struktury feedu a text (CZ/EN).

  // /reel/ID, /reels/, /uzivatel/reels/
  const FB_REELS_PATH = /^\/(?:[^/]+\/)?reels?(?:\/|$)/i;
  // Záložka Video/Watch (nekonečný feed). Konkrétní video (/watch/?v=ID) zůstává povolené.
  const FB_WATCH_PATH = /^\/(?:watch|video)(?:\/|$)/i;

  const FB_REEL_LINK = 'a[href*="/reel/"]';
  // Jednotky feedu (jeden příspěvek / karusel). Poslední možnost: přímý potomek kontejneru feedu.
  const FB_UNIT_SELECTORS = ['[aria-posinset]', '[data-tracking-duration-id]', '[data-pagelet^="FeedUnit"]'];
  const FB_UNIT = FB_UNIT_SELECTORS.join(', ');
  const FB_FEED = '[role="feed"], [data-type="vscroller"]';

  const FB_REELS_LABELS = labelSet([
    'Reels a krátká videa',
    'Reels and short videos',
    'Reels',
    'Krátká videa',
    'Short videos',
  ]);
  const FB_SUGGESTED_LABELS = labelSet([
    'Navrhované pro vás',
    'Navrhované pro tebe',
    'Navrhovaný příspěvek',
    'Suggested for you',
    'Suggested post',
  ]);
  const FB_STORIES_LABELS = labelSet(['Vytvořit příběh', 'Create story', 'Příběhy', 'Stories']);

  function fbUnit(el) {
    return findUnit(el, { unitSel: FB_UNIT, feedSel: FB_FEED }) || el.closest('[role="article"]');
  }

  const facebookSite = registerSite({
    id: 'facebook',

    matches(host) {
      return host === 'facebook.com' || host.endsWith('.facebook.com');
    },

    home(url) {
      return url.origin + '/';
    },

    blocked(url, cfg) {
      if (cfg.blockReels && FB_REELS_PATH.test(url.pathname)) return 'Facebook Reels';
      if (cfg.blockWatch && FB_WATCH_PATH.test(url.pathname) && !url.searchParams.has('v')) {
        return 'Facebook Video';
      }
      return null;
    },

    pageFlags() {
      return [];
    },

    rules(cfg) {
      const rules = [];
      const add = (reason, ...selectors) => selectors.forEach((css) => rules.push({ css, reason }));

      if (cfg.blockReels) {
        add('Reel ve feedu', ...FB_UNIT_SELECTORS.map((u) => `${u}:has(${FB_REEL_LINK})`));
        add(
          'záložka Reels',
          '[role="tab"][aria-label^="Reels"]',
          '[role="tablist"] [aria-label^="Reels"]',
          '[role="navigation"] [aria-label="Reels"]'
        );
        add('odkaz na Reels', FB_REEL_LINK, 'a[href*="/reels/"]');
      }

      if (cfg.blockWatch) {
        add(
          'záložka Video',
          '[role="tab"][aria-label^="Video"]',
          '[role="tab"][aria-label^="Watch"]',
          '[role="tablist"] [aria-label^="Video"]',
          '[role="navigation"] [aria-label="Video"]',
          'a[href="/watch/"]',
          'a[href="/watch"]',
          'a[href^="/watch/?"]:not([href*="v="])',
          'a[href$="facebook.com/watch/"]'
        );
      }

      if (cfg.hideStories) {
        add(
          'Příběhy',
          '[aria-label="Příběhy"]',
          '[aria-label="Stories"]',
          '[role="region"][aria-label*="příběh" i]',
          '[role="region"][aria-label*="stories" i]',
          'a[href^="/stories/"]',
          'a[href*="facebook.com/stories/"]'
        );
      }
      return rules;
    },

    scan(roots, { cfg, hide }) {
      const hideUnitOf = (el, reason) => {
        if (inNavigation(el)) return;
        const unit = fbUnit(el);
        if (unit) hide(unit, reason);
        else logInfo('nenalezen příspěvek pro', reason, describeEl(el));
      };

      for (const root of roots) {
        if (cfg.blockReels) {
          for (const el of findLabelElements(root, FB_REELS_LABELS)) hideUnitOf(el, 'karusel Reels');
          const links = root.matches(FB_REEL_LINK) ? [root] : root.querySelectorAll(FB_REEL_LINK);
          for (const a of links) hideUnitOf(a, 'Reel ve feedu');
        }
        if (cfg.hideSuggested) {
          for (const el of findLabelElements(root, FB_SUGGESTED_LABELS)) hideUnitOf(el, 'navrhovaný příspěvek');
        }
        if (cfg.hideStories) {
          for (const el of findLabelElements(root, FB_STORIES_LABELS)) hideUnitOf(el, 'Příběhy');
        }
      }
    },
  });

  // ---- src/sites/instagram.js ----
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

  // /reels/, /reels/ID/, /reel/ID/, /uzivatel/reels/
  const IG_REELS_PATH = /^\/(?:[^/]+\/)?reels?(?:\/|$)/i;
  // Jeden konkrétní reel: /reel/ID/ nebo /reels/ID/
  const IG_SINGLE_REEL_PATH = /^\/reels?\/([A-Za-z0-9_-]+)\/?$/;
  const IG_REEL_ID_IN_HREF = /\/reels?\/([A-Za-z0-9_-]+)/;
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

  function igSingleReelId(pathname) {
    const m = IG_SINGLE_REEL_PATH.exec(pathname);
    return m ? m[1] : null;
  }

  function igReelIdFromHref(href) {
    const m = IG_REEL_ID_IN_HREF.exec(href || '');
    return m ? m[1] : null;
  }

  function igNextReelBlock(url) {
    return { reason: 'Další reely', homeUrl: url.origin + '/direct/inbox/', homeLabel: 'Zpět do zpráv' };
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

  const instagramSite = registerSite({
    id: 'instagram',

    matches(host) {
      return host === 'instagram.com' || host === 'www.instagram.com' || host === 'm.instagram.com';
    },

    home(url) {
      return url.origin + '/';
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
      if (/^\/direct(?:\/|$)/.test(url.pathname)) flags.push('ig-direct');
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

      const single = cfg.blockReels && cfg.allowSingleReel && igSingleReelId(url.pathname);
      if (single && state.reelId) igSingleReelScan(doc, state, hide);
      else if ((state.singleHidden && state.singleHidden.length) || (state.scrollLocked && state.scrollLocked.length)) {
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

  // ---- src/sites/tiktok.js ----
  // TikTok – celý web je krátká videa, proto se blokuje úplně (bez tlačítka „domů“).

  const tiktokSite = registerSite({
    id: 'tiktok',

    matches(host) {
      return host === 'tiktok.com' || host.endsWith('.tiktok.com');
    },

    home() {
      return null;
    },

    blocked() {
      return 'TikTok';
    },

    pageFlags() {
      return [];
    },

    rules() {
      return [];
    },

    scan() {},
  });

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
