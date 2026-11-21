// ==UserScript==
// @name         No Shorts
// @namespace    https://github.com/FAUXINO/NoMoreDoomScrollingExtension
// @version      0.4.0
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
      channelReader: true, // kanál (/channel/…): ukázat posledních 20 zpráv, které web stáhne, ale nezobrazí (jen čtení)
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
  //   css(cfg)                    volitelné: další CSS modulu (např. vzhled vlastního panelu)
  //   init(win, { cfg, state })   volitelné: jednorázová příprava při startu (posluchače, hook do stránky)
  //   onUrl(url, { cfg, state, doc })  volitelné: při startu a každé změně URL
  //   scan(roots, ctx)            dynamické skrývání; ctx = { cfg, url, hide, state }
  // `state` je objekt modulu po dobu života stránky (např. zamčené ID reelu). Nastavením
  // state.forceBlock = { reason, … } může scan zablokovat stránku i bez změny URL.
  // Mimo scan (např. v posluchači události) pak zavolá state.requestApply().
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

  // ---- src/sites/instagram-channel.js ----
  // Instagram: čtení kanálu (/channel/KÓD/) na mobilním webu (CONFIG.instagram.channelReader).
  //
  // Web u kanálu ukáže jen „Use the Instagram app … to join this channel“. Na pozadí ale
  // stáhne náhled kanálu – GraphQL dotaz PolarisChannelLinkRootQuery (ověřeno HAR 2026-11),
  // odpověď data.xfb_igd_channel_web_preview.channel_preview.items = posledních 20 zpráv
  // (TEXT, LINK, MEDIA, MEDIA_SHARE, ACTION_LOG; každá s full_item_dict jako JSON string).
  // Skript tuhle odpověď zachytí a zprávy vykreslí jen pro čtení. Žádné vlastní požadavky.
  //
  // Odpověď čte jen svět stránky (content script nevidí její XHR/fetch). Proto se do stránky
  // vloží malý hook (igChannelPageHook), který odpověď pošle událostí na document.
  // CSP Instagramu nepovoluje inline skripty bez nonce: hook dostane nonce z existujícího
  // <script nonce>, záloha je blob: URL (CSP ho ve script-src povoluje).
  //
  // Jednorázové fotky/videa web zobrazit neumí: server u nich posílá attachment: null.

  const IG_CHANNEL_EVENT = 'noshorts-ig-channel';
  const IG_CHANNEL_HOOK_ATTR = 'data-noshorts-ig-hook';
  const IG_CHANNEL_PANEL_ID = 'noshorts-ig-channel';
  const IG_CHANNEL_PATH = /^\/channel\/[^/]+\/?$/;
  // Data stažená těsně před navigací (Instagram dotaz někdy pošle už při kliknutí) platí jen chvíli.
  const IG_CHANNEL_PREFETCH_MS = 4000;

  function igIsChannelPath(pathname) {
    return IG_CHANNEL_PATH.test(pathname);
  }

  // --- hook ve světě stránky ---------------------------------------------------
  // Pozor: funkce se do stránky vkládá jako text (toString), nesmí používat nic zvenku.
  function igChannelPageHook(eventName, hookAttr) {
    const root = document.documentElement;
    if (root.hasAttribute(hookAttr)) return;
    root.setAttribute(hookAttr, '1');
    const MARKER = 'channel_preview';
    const isChannelRequest = (body) => {
      try {
        if (location.pathname.indexOf('/channel/') === 0) return true;
        if (typeof body === 'string') return body.indexOf('ChannelLink') !== -1;
        if (body && typeof body.get === 'function') return String(body.get('fb_api_req_friendly_name') || '').indexOf('ChannelLink') !== -1;
      } catch (e) {
        /* ignorovat */
      }
      return false;
    };
    const emit = (text) => {
      if (typeof text !== 'string' || text.indexOf(MARKER) === -1) return;
      document.dispatchEvent(new CustomEvent(eventName, { detail: text }));
    };
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (proto && proto.send) {
      const send = proto.send;
      proto.send = function (body) {
        try {
          if (isChannelRequest(body)) {
            this.addEventListener('load', function () {
              try {
                if (this.responseType === '' || this.responseType === 'text') emit(this.responseText);
                else if (this.responseType === 'json') emit(JSON.stringify(this.response));
              } catch (e) {
                /* ignorovat */
              }
            });
          }
        } catch (e) {
          /* ignorovat */
        }
        return send.apply(this, arguments);
      };
    }
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input, init) {
        const p = origFetch.apply(this, arguments);
        try {
          if (isChannelRequest(init && init.body)) {
            p.then((res) => res.clone().text()).then(emit, () => {});
          }
        } catch (e) {
          /* ignorovat */
        }
        return p;
      };
    }
  }

  function igHookInstalled(doc) {
    return doc.documentElement.hasAttribute(IG_CHANNEL_HOOK_ATTR);
  }

  function igInjectCode(doc, code) {
    const win = doc.defaultView;
    const parent = doc.head || doc.documentElement;
    // 1) Inline skript s nonce stránky (CSP Instagramu: 'nonce-…').
    const withNonce = doc.querySelector('script[nonce]');
    const nonce = withNonce ? withNonce.nonce || withNonce.getAttribute('nonce') : '';
    const s = doc.createElement('script');
    if (nonce) s.setAttribute('nonce', nonce);
    s.textContent = code;
    parent.appendChild(s);
    s.remove();
    if (igHookInstalled(doc)) return 'inline';
    // 2) Záloha: blob: URL (script-src 'blob:'). Spustí se asynchronně.
    if (!win.URL || typeof win.URL.createObjectURL !== 'function' || !win.Blob) return 'nepovedlo se';
    try {
      const url = win.URL.createObjectURL(new win.Blob([code], { type: 'text/javascript' }));
      const b = doc.createElement('script');
      if (nonce) b.setAttribute('nonce', nonce);
      b.src = url;
      b.onload = b.onerror = () => {
        b.remove();
        win.URL.revokeObjectURL(url);
        logInfo('hook kanálu přes blob:', igHookInstalled(doc) ? 'OK' : 'nepovedlo se');
      };
      parent.appendChild(b);
    } catch (e) {
      logError('instagram.channelHook', e);
    }
    return 'blob';
  }

  // Vloží hook co nejdřív, ale až když stránka má <script nonce> (na document-start ještě není).
  function igInstallPageHook(doc) {
    const code = `(${igChannelPageHook.toString()})(${JSON.stringify(IG_CHANNEL_EVENT)}, ${JSON.stringify(IG_CHANNEL_HOOK_ATTR)});`;
    let done = false;
    let mo = null;
    const attempt = () => {
      if (done) return;
      done = true;
      if (mo) mo.disconnect();
      try {
        logInfo('hook kanálu:', igInjectCode(doc, code));
      } catch (e) {
        logError('instagram.channelHook', e);
      }
    };
    if (doc.querySelector('script[nonce]')) return attempt();
    const win = doc.defaultView;
    mo = new win.MutationObserver(() => {
      if (doc.querySelector('script[nonce]')) attempt();
    });
    mo.observe(doc, { childList: true, subtree: true });
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', attempt, { once: true });
    else attempt();
  }

  // --- zpracování odpovědi ---------------------------------------------------------

  function igFindChannelPreview(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return null;
    if (obj.channel_preview && Array.isArray(obj.channel_preview.items)) return obj.channel_preview;
    for (const key of Object.keys(obj)) {
      const found = igFindChannelPreview(obj[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Jen http(s) URL; přesměrování l.instagram.com/?u=… se rozbalí na cílovou adresu.
  function igSafeUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    let u;
    try {
      u = new URL(value, 'https://www.instagram.com/');
    } catch (e) {
      return null;
    }
    if (u.hostname === 'l.instagram.com' && u.searchParams.get('u')) return igSafeUrl(u.searchParams.get('u'));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  }

  function igBestUrl(list) {
    if (!Array.isArray(list)) return null;
    for (const c of list) {
      const url = c && igSafeUrl(c.url);
      if (url) return url;
    }
    return null;
  }

  function igMediaInfo(media) {
    if (!media || typeof media !== 'object') return [];
    if (Array.isArray(media.carousel_media) && media.carousel_media.length) {
      return media.carousel_media.flatMap((m) => igMediaInfo(m));
    }
    const image = igBestUrl(media.image_versions2 && media.image_versions2.candidates);
    const video = media.media_type === 2 ? igBestUrl(media.video_versions) : null;
    return image || video ? [{ image, video }] : [];
  }

  function igParseItem(raw) {
    let full = {};
    try {
      full = typeof raw.full_item_dict === 'string' ? JSON.parse(raw.full_item_dict) : raw.full_item_dict || {};
    } catch (e) {
      full = {};
    }
    const type = String(raw.item_type || full.item_type || '').toUpperCase();
    const sender = raw.sender || {};
    const ts = Number(raw.timestamp || full.timestamp);
    const item = {
      id: String(raw.message_id || full.item_id || ''),
      type,
      time: Number.isFinite(ts) && ts > 0 ? new Date(ts / 1000) : null,
      sender: sender.full_name || sender.username || '',
      text: typeof raw.text === 'string' ? raw.text : typeof full.text === 'string' ? full.text : '',
      media: [],
      link: null,
      share: null,
      action: null,
    };
    if (type === 'LINK' && full.link) {
      const ctx = full.link.link_context || {};
      item.text = item.text || full.link.text || '';
      item.link = {
        url: igSafeUrl(ctx.link_url),
        title: ctx.link_title || '',
        summary: ctx.link_summary || '',
        image: igSafeUrl(ctx.link_image_url),
      };
    } else if (type === 'MEDIA') {
      item.media = igMediaInfo(full.media);
    } else if (type === 'MEDIA_SHARE') {
      const m = (full.direct_media_share && full.direct_media_share.media) || full.media_share || null;
      if (m) {
        const isReel = m.product_type === 'clips';
        const code = typeof m.code === 'string' && /^[A-Za-z0-9_-]+$/.test(m.code) ? m.code : null;
        const preview = igMediaInfo(m)[0];
        item.share = {
          href: code ? (isReel ? '/reel/' : '/p/') + code + '/' : null,
          kind: isReel ? 'Reel' : 'Příspěvek',
          author: (m.user && m.user.username) || '',
          caption: (m.caption && m.caption.text) || '',
          image: preview ? preview.image : null,
        };
      }
    } else if (type === 'ACTION_LOG') {
      item.action = (full.action_log && full.action_log.description) || '';
    }
    return item;
  }

  // Vrátí { title, members, items } (zprávy od nejstarší po nejnovější) nebo null.
  function igParseChannelResponse(text) {
    if (typeof text !== 'string' || text.indexOf('channel_preview') === -1) return null;
    // Odpověď může mít prefix „for (;;);“ a víc JSON objektů na řádcích.
    const body = text.replace(/^\s*for\s*\(;;\);/, '');
    for (const line of body.split('\n')) {
      if (line.indexOf('channel_preview') === -1) continue;
      let json;
      try {
        json = JSON.parse(line);
      } catch (e) {
        continue;
      }
      const preview = igFindChannelPreview(json);
      if (!preview) continue;
      const items = preview.items.filter((it) => it && typeof it === 'object').map(igParseItem);
      items.sort((a, b) => (a.time ? a.time.getTime() : 0) - (b.time ? b.time.getTime() : 0));
      return {
        threadId: String(preview.thread_igid || ''),
        title: typeof preview.title === 'string' ? preview.title : '',
        members: Number.isFinite(preview.number_of_members) ? preview.number_of_members : null,
        items,
      };
    }
    return null;
  }

  // --- vykreslení ----------------------------------------------------------------

  const IG_CHANNEL_CSS = `
  #${IG_CHANNEL_PANEL_ID}{all:initial;position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;
    box-sizing:border-box;font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#fff;color:#18181b}
  #${IG_CHANNEL_PANEL_ID} *{all:revert;font-family:inherit;box-sizing:border-box}
  #${IG_CHANNEL_PANEL_ID} .ns-head{display:flex;align-items:center;gap:12px;padding:10px 12px;
    padding-top:max(10px,env(safe-area-inset-top));border-bottom:1px solid #e4e4e7}
  #${IG_CHANNEL_PANEL_ID} .ns-back{border:0;background:none;color:inherit;font-size:26px;line-height:1;padding:4px 8px;cursor:pointer}
  #${IG_CHANNEL_PANEL_ID} .ns-head-text{min-width:0}
  #${IG_CHANNEL_PANEL_ID} .ns-title{margin:0;font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #${IG_CHANNEL_PANEL_ID} .ns-sub{margin:0;font-size:13px;color:#71717a}
  #${IG_CHANNEL_PANEL_ID} .ns-list{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
    padding:12px 12px max(24px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px}
  #${IG_CHANNEL_PANEL_ID} .ns-msg{max-width:90%;align-self:flex-start;background:#f4f4f5;border-radius:16px;padding:8px 12px}
  #${IG_CHANNEL_PANEL_ID} .ns-meta{margin:0 0 2px;font-size:12px;color:#71717a}
  #${IG_CHANNEL_PANEL_ID} .ns-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
  #${IG_CHANNEL_PANEL_ID} .ns-action{align-self:center;max-width:none;background:none;text-align:center;font-size:13px;color:#71717a}
  #${IG_CHANNEL_PANEL_ID} .ns-note{align-self:center;font-size:13px;color:#71717a;text-align:center;margin:4px 0 0}
  #${IG_CHANNEL_PANEL_ID} img,#${IG_CHANNEL_PANEL_ID} video{display:block;max-width:100%;max-height:70vh;border-radius:12px;margin-top:6px}
  #${IG_CHANNEL_PANEL_ID} a{color:#2563eb;overflow-wrap:anywhere}
  #${IG_CHANNEL_PANEL_ID} .ns-card{display:block;margin-top:6px;padding:8px;border-radius:12px;background:#fff;text-decoration:none;color:inherit}
  #${IG_CHANNEL_PANEL_ID} .ns-card-title{margin:0;font-weight:600}
  #${IG_CHANNEL_PANEL_ID} .ns-card-text{margin:2px 0 0;font-size:13px;color:#52525b}
  @media (prefers-color-scheme: dark){
    #${IG_CHANNEL_PANEL_ID}{background:#000;color:#f4f4f5}
    #${IG_CHANNEL_PANEL_ID} .ns-head{border-color:#27272a}
    #${IG_CHANNEL_PANEL_ID} .ns-msg{background:#27272a}
    #${IG_CHANNEL_PANEL_ID} .ns-action{background:none}
    #${IG_CHANNEL_PANEL_ID} .ns-card{background:#18181b}
    #${IG_CHANNEL_PANEL_ID} .ns-card-text{color:#a1a1aa}
    #${IG_CHANNEL_PANEL_ID} a{color:#60a5fa}
  }`;

  const IG_TYPE_LABELS = {
    VOICE_MEDIA: 'Hlasová zpráva',
    ANIMATED_MEDIA: 'GIF',
    CLIP: 'Reel',
    STORY_SHARE: 'Příběh',
    POLL: 'Anketa',
  };

  function el(doc, tag, className, text) {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text) e.textContent = text;
    return e;
  }

  function igFormatTime(date) {
    if (!date) return '';
    try {
      return date.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return date.toISOString();
    }
  }

  function igExternalLink(doc, href, text, className) {
    const a = el(doc, 'a', className, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function igRenderItem(doc, item) {
    if (item.type === 'ACTION_LOG') return el(doc, 'p', 'ns-msg ns-action', item.action || 'Změna v kanálu');
    const box = el(doc, 'div', 'ns-msg');
    box.dataset.type = item.type;
    const meta = [item.sender, igFormatTime(item.time)].filter(Boolean).join(' · ');
    if (meta) box.append(el(doc, 'p', 'ns-meta', meta));
    if (item.text) box.append(el(doc, 'p', 'ns-text', item.text));

    if (item.link && item.link.url) {
      const card = igExternalLink(doc, item.link.url, '', 'ns-card');
      if (item.link.image) {
        const img = el(doc, 'img');
        img.src = item.link.image;
        img.alt = '';
        img.loading = 'lazy';
        card.append(img);
      }
      card.append(el(doc, 'p', 'ns-card-title', item.link.title || item.link.url));
      if (item.link.summary) card.append(el(doc, 'p', 'ns-card-text', item.link.summary));
      box.append(card);
    }

    for (const m of item.media) {
      if (m.video) {
        const v = el(doc, 'video');
        v.controls = true;
        v.preload = 'none';
        v.setAttribute('playsinline', '');
        if (m.image) v.poster = m.image;
        v.src = m.video;
        box.append(v);
      } else if (m.image) {
        const img = el(doc, 'img');
        img.src = m.image;
        img.alt = '';
        img.loading = 'lazy';
        box.append(img);
      }
    }

    if (item.share) {
      const card = item.share.href ? el(doc, 'a', 'ns-card') : el(doc, 'div', 'ns-card');
      if (item.share.href) card.href = item.share.href;
      if (item.share.image) {
        const img = el(doc, 'img');
        img.src = item.share.image;
        img.alt = '';
        img.loading = 'lazy';
        card.append(img);
      }
      card.append(el(doc, 'p', 'ns-card-title', item.share.kind + (item.share.author ? ' od @' + item.share.author : '')));
      if (item.share.caption) card.append(el(doc, 'p', 'ns-card-text', item.share.caption));
      box.append(card);
    }

    const empty = !item.text && !item.link && !item.media.length && !item.share;
    if (empty) {
      const label = IG_TYPE_LABELS[item.type] || 'Zpráva typu ' + (item.type || '?');
      box.append(el(doc, 'p', 'ns-text', label + ' – zobrazí se jen v aplikaci.'));
    }
    return box;
  }

  function igBuildPanel(doc, data) {
    const panel = el(doc, 'div');
    panel.id = IG_CHANNEL_PANEL_ID;
    const head = el(doc, 'div', 'ns-head');
    const back = el(doc, 'button', 'ns-back', '‹');
    back.type = 'button';
    back.setAttribute('aria-label', 'Zpět');
    back.addEventListener('click', () => {
      const win = doc.defaultView;
      if (win.history.length > 1) win.history.back();
      else win.location.assign('/direct/inbox/');
    });
    const headText = el(doc, 'div', 'ns-head-text');
    headText.append(el(doc, 'p', 'ns-title', data.title || 'Kanál'));
    const sub = [data.members != null ? data.members + ' členů' : '', 'jen čtení'].filter(Boolean).join(' · ');
    headText.append(el(doc, 'p', 'ns-sub', sub));
    head.append(back, headText);

    const list = el(doc, 'div', 'ns-list');
    for (const item of data.items) list.append(igRenderItem(doc, item));
    list.append(
      el(
        doc,
        'p',
        'ns-note',
        `Posledních ${data.items.length} zpráv – víc web nedostane. Odpovídat a reagovat jde jen v aplikaci.`,
      ),
    );
    panel.append(head, list);
    return panel;
  }

  // Zobrazí/skryje panel podle aktuální URL a uložených dat. Volá se po přijetí dat i při každé dávce mutací.
  function igChannelSync(doc, state, now = Date.now()) {
    const path = doc.defaultView.location.pathname;
    if (state.channelPath !== path) {
      state.channelPath = path;
      // Po navigaci platí jen čerstvá data (k novému kanálu), jinak by se ukázal předchozí.
      if (state.channel && now - state.channel.at > IG_CHANNEL_PREFETCH_MS) state.channel = null;
    }
    const onChannel = igIsChannelPath(path);
    let panel = doc.getElementById(IG_CHANNEL_PANEL_ID);
    if (!onChannel || !state.channel) {
      if (panel) panel.remove();
      return;
    }
    if (panel && panel.dataset.key !== state.channel.key) {
      panel.remove();
      panel = null;
    }
    if (!panel) {
      panel = igBuildPanel(doc, state.channel.data);
      panel.dataset.key = state.channel.key;
      logInfo('kanál: zobrazeno', state.channel.data.items.length, 'zpráv');
    }
    // Do <html> (vedle <body>), aby panel nesmazal React při překreslení stránky.
    if (!panel.isConnected) doc.documentElement.appendChild(panel);
  }

  // Přijme odpověď z hooku (detail = text odpovědi) a uloží ji do stavu.
  function igChannelReceive(doc, state, text, now = Date.now()) {
    const data = igParseChannelResponse(text);
    if (!data) return false;
    state.channel = { key: data.threadId + ':' + data.items.map((i) => i.id).join(','), data, at: now };
    igChannelSync(doc, state, now);
    return true;
  }

  function igChannelInit(win, state) {
    const doc = win.document;
    doc.addEventListener(IG_CHANNEL_EVENT, (e) => {
      try {
        if (typeof e.detail === 'string') igChannelReceive(doc, state, e.detail);
      } catch (err) {
        logError('instagram.channel', err);
      }
    });
    igInstallPageHook(doc);
  }

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
  //
  // Reel ze zprávy (mobilní web, ověřeno snapshotem 2026-11): otevře se jako overlay přímo
  // v /direct/t/ID/, URL se nemění ani při swipu. Viewer má položky s atributem
  // data-reel-type: "reshared" = reel poslaný ve zprávě, "suggested" = předem načtené
  // další reely (u nás 8). Ve zprávách proto:
  //  - CSS skryje každou položku data-reel-type kromě "reshared" (sousedé, swipe nemá kam),
  //  - scroll kontejnery kolem povoleného videa dostanou overflow:hidden,
  //  - když se přesto spustí jiné video než to poslané → „Zablokováno“ (pojistka přes
  //    událost play, kdyby Instagram atribut přejmenoval).

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

  function igSingleReelId(pathname) {
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

  const instagramSite = registerSite({
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
    const siteCss = safe(site.id + '.css', () => (site.css ? site.css(cfg) : ''), '');
    const css = [BASE_CSS, BLOCK_CSS, siteCss, rulesToCss(rules)].join('\n');
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
      if (site.onUrl) safe(site.id + '.onUrl', () => site.onUrl(url, { cfg, state, doc }));
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

    if (site.init) safe(site.id + '.init', () => site.init(win, { cfg, state }));
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
