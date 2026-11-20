# Údržba: co dělat, když web změní vzhled

Meta (Instagram, Facebook), YouTube i TikTok své weby často mění. Skript pak může
přestat něco skrývat, nebo naopak skrýt něco, co skrývat nemá. Tady je postup, jak
problém najít a nahlásit, abych mohl selektory opravit.

## Typické příznaky

| Příznak | Pravděpodobná příčina |
|---|---|
| Reels/Shorts se znovu objevují ve feedu nebo v navigaci | změnil se element nebo `href`, na který se cílí |
| Zmizelo něco, co zmizet nemělo (celý feed, lišta…) | pravidlo je moc obecné nebo se změnila struktura stránky |
| Obrazovka „Zablokováno“ na stránce, která má fungovat | změnila se URL (např. nový formát odkazů) |
| Reels na zlomek sekundy probliknou | Safari spustilo skript pozdě (Preload Top Hit, viz README) nebo se na prvek chytá jen JS, ne CSS |
| Na iPhonu nefunguje nic | rozšíření není povolené pro web, záložka je webová aplikace, nebo skript chybí ve složce |

### Instagram: „jeden reel ze zprávy“

| Příznak | Pravděpodobná příčina |
|---|---|
| Po reelu ze zprávy jde swipovat na další | viewer má nový scroll kontejner (bez `overflow-y:auto/scroll`) nebo další položky nemají vlastní `<video>`. Pomůže snapshot vieweru. |
| Další reel se přehraje a „Zablokováno“ nepřijde | při swipu se nemění URL (`/reel/ID`) a v položce není odkaz s ID. Pošli log navigace (níže) a snapshot před a po swipu. |
| „Zablokováno“ hned u reelu ze zprávy | IG otevírá reel pod jiným tvarem URL (ne `/reel/ID/` ani `/reels/ID/`), nebo hned při otevření přepíše URL na jiné ID |
| Náhledy reelů v chatu zmizely | změnila se URL zpráv (není `/direct/…`) |

**Log navigace.** Ukáže, jestli a jak se při swipu mění URL. Vlož ho do konzole
před otevřením reelu (skript ve Violentmonkey nech na chvíli vypnutý):

```js
for (const m of ['pushState','replaceState']) { const o = history[m]; history[m] = function (...a) { console.log('[nav]', m, a[2]); return o.apply(this, a); }; }
addEventListener('popstate', () => console.log('[nav] popstate', location.href));
```

Pošli mi pak řádky `[nav] …` a snapshoty `fixtures/instagram/direct-thread.html`
(konverzace), `dm-reel-open.html` (otevřený reel) a `dm-reel-next.html` (po swipu),
vždy se skutečnou URL z adresního řádku v prvním komentáři.

## 1. Ověř to na Fedoře

Na iPhonu se do konzole bez Macu nepodíváš, proto se ladí ve Firefoxu
(postup v README, „Ruční test ve Firefoxu“):

1. Nastav v `src/config.js` hodnotu `debug: true`, spusť `npm run build` a aktualizuj
   skript ve Violentmonkey.
2. Responzivní režim s iPhonem, stránku načti znovu.
3. V konzoli (`Ctrl+Shift+K`) uvidíš řádky `[no-shorts] skryto: <web>: <důvod> <element>`
   a `[no-shorts] zablokováno: …`.
   - Co skript skryl, najdeš v Inspektoru vyhledáním `data-noshorts-hidden`.
     Hodnota atributu je důvod a podle něj se dá dohledat pravidlo v `src/sites/<web>.js`.
   - Hláška `nenalezen příspěvek pro …` znamená, že skript našel štítek (např.
     „Navrhované pro vás“), ale nenašel příspěvek, do kterého patří. Feed má novou strukturu.

## 2. Co mi poslat

Napiš do Claude Code v tomhle repozitáři zprávu podle šablony:

```
Web: Instagram (feed)
URL: https://www.instagram.com/
Problém: Reels se zase zobrazují ve feedu / zmizel celý feed / …
Co má zůstat: příspěvky od lidí, které sleduju
Snapshot: fixtures/instagram/feed.html
Debug log: (zkopírované řádky [no-shorts] z konzole, pokud nějaké jsou)
```

A k tomu přilož:

1. **Snapshot stránky** podle [fixtures/README.md](fixtures/README.md). Je to nejdůležitější
   podklad, protože z něj vidím skutečnou strukturu. Pojmenuj ho podle stránky,
   např. `fixtures/instagram/feed.html`.
2. **HTML konkrétního prvku**, pokud ho dokážeš najít: v Inspektoru klikni pravým na
   problémový Reel nebo příspěvek → Kopírovat → Vnější HTML → vlož do zprávy
   (nebo ulož do `fixtures/<web>/<něco>-prvek.html`). Stačí kontejner jednoho příspěvku.
3. **Screenshot** z iPhonu nebo Firefoxu, pokud jde o vzhled (obrázek můžeš přetáhnout do terminálu).
4. Jestli se problém děje i ve Firefoxu, nebo jen na iPhonu.

## 3. Co udělám já (pro přehled)

1. Podle snapshotu najdu nový stabilní selektor (href, aria-label, role, struktura,
   nikdy generované třídy Mety).
2. Upravím pravidlo v `src/sites/<web>.js` a přidám test do `tests/<web>.test.mjs`.
   Snapshot zároveň hlídá `tests/fixtures.test.mjs`.
3. `npm test`, zvýším verzi v `package.json`, sestavím a commitnu.
4. Ty pushneš (nebo pushnu já, když řekneš) a na iPhonu skript aktualizuješ (README → Aktualizace).

## Kde co je

| Web | Soubor | Kde hledat |
|---|---|---|
| YouTube | `src/sites/youtube.js` | `YT_SHORTS_PATH` (blokované URL), `rules()` (police, záložka, výsledky, hlavní stránka) |
| Instagram | `src/sites/instagram.js` | `IG_REELS_PATH`, `rules()` (Reels, Explore), `IG_SUGGESTED` + `scan()` (navrhované). Jeden reel: `IG_SINGLE_REEL_PATH` + `blocked()` (zámek ID), `igPickAllowedVideo` (které video je „to jedno“), `igSingleReelScan` (skrytí sousedů, odkazy na jiná ID), `igLockScroll`, `IG_OUTSIDE_EXCEPTIONS` (výjimky pro zprávy) |
| Facebook | `src/sites/facebook.js` | `FB_REELS_PATH`, `FB_WATCH_PATH`, `FB_UNIT_SELECTORS`/`FB_FEED` (jak se pozná příspěvek), `*_LABELS` + `scan()` |
| TikTok | `src/sites/tiktok.js` | blokuje se vše |
| Společné | `src/core/` | `text.js` (porovnávání popisků CZ/EN), `dom.js` (hledání příspěvku), `blockScreen.js`, `watch.js` (SPA, MutationObserver) |

Když Meta nebo YouTube přejmenuje text v UI (např. „Navrhované pro vás“), stačí přidat
nový popisek do příslušného seznamu `…_LABELS` / `IG_SUGGESTED`. Vždy česky i anglicky.
