// YouTube (m.youtube.com – mobilní layout; základní pravidla i pro www.youtube.com).
// Selektory stojí na názvech custom elementů YouTube (ytm-*, ytd-*) a na href /shorts/,
// ne na generovaných CSS třídách.
import { registerSite } from '../core/registry.js';
import { flagSel } from '../core/style.js';

const YT_SHORTS_LINK = 'a[href^="/shorts/"]';
const YT_SHORTS_ITEMS = 'ytm-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2';

// /shorts, /shorts/ID, /@kanal/shorts, /channel/ID/shorts, /c/jmeno/shorts, /user/jmeno/shorts
const YT_SHORTS_PATH = /^\/(?:(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/)?shorts(?:\/|$)/i;

export const youtubeSite = registerSite({
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
