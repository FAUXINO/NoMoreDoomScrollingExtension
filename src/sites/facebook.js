// Facebook (m.facebook.com / www.facebook.com v mobilním layoutu).
// Meta generuje náhodné CSS třídy, proto se opíráme jen o href (/reel/, /watch),
// aria-label, role, data-atributy struktury feedu a text (CZ/EN).
import { registerSite } from '../core/registry.js';
import { labelSet, findLabelElements } from '../core/text.js';
import { findUnit, inNavigation } from '../core/dom.js';
import { logInfo, describeEl } from '../core/log.js';

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

export const facebookSite = registerSite({
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
