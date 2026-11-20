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
export const SITES = [];

export function registerSite(site) {
  SITES.push(site);
  return site;
}
