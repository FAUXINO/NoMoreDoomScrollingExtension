// Instagram (mobilní web). Selektory: href (/reel/, /reels/, /p/), <article>, aria-label, text CZ/EN.
import { registerSite } from '../core/registry.js';
import { flagSel } from '../core/style.js';
import { labelSet, findLabelElements } from '../core/text.js';
import { climbBelow, inNavigation } from '../core/dom.js';

// /reels/, /reels/ID/, /reel/ID/, /uzivatel/reels/
const IG_REELS_PATH = /^\/(?:[^/]+\/)?reels?(?:\/|$)/i;
const IG_REEL_LINK = 'a[href*="/reel/"]';

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

export const instagramSite = registerSite({
  id: 'instagram',

  matches(host) {
    return host === 'instagram.com' || host === 'www.instagram.com' || host === 'm.instagram.com';
  },

  home(url) {
    return url.origin + '/';
  },

  blocked(url, cfg) {
    if (cfg.blockReels && IG_REELS_PATH.test(url.pathname)) return 'Instagram Reels';
    return null;
  },

  pageFlags(url, cfg) {
    const flags = [];
    if (cfg.hideExplore && /^\/explore\/?$/.test(url.pathname)) flags.push('ig-explore');
    return flags;
  },

  rules(cfg) {
    const rules = [];
    const add = (reason, ...selectors) => selectors.forEach((css) => rules.push({ css, reason }));

    if (cfg.blockReels) {
      add('Reel ve feedu', `article:has(${IG_REEL_LINK})`);
      add('odkaz na Reels (navigace/profil)', 'a[href^="/reels/"]', 'a[href$="/reels/"]', 'a:has(svg[aria-label="Reels"])');
      add('odkaz na Reel', IG_REEL_LINK);
    }

    if (cfg.hideExplore) {
      const explore = flagSel('ig-explore');
      add('mřížka Explore', `${explore} main a[href^="/p/"]`, `${explore} main ${IG_REEL_LINK}`);
    }
    return rules;
  },

  scan(roots, { cfg, url, hide }) {
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
