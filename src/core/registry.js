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
export const SITES = [];

export function registerSite(site) {
  SITES.push(site);
  return site;
}
