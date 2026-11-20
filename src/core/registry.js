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
export const SITES = [];

export function registerSite(site) {
  SITES.push(site);
  return site;
}
