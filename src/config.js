// ============================================================================
// NASTAVENÍ – uprav podle potřeby (true = zapnuto, false = vypnuto).
// Pozor: aktualizace skriptu z GitHubu tyto hodnoty přepíše na výchozí.
// ============================================================================
export const CONFIG = {
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
