// TikTok – celý web je krátká videa, proto se blokuje úplně (bez tlačítka „domů“).
import { registerSite } from '../core/registry.js';

export const tiktokSite = registerSite({
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
