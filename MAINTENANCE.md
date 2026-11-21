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

> **Zjištěno 2026-11-20/21 (mobilní web, Firefox s iPhone UA):** reel ze zprávy se otevírá
> jako **overlay uvnitř `/direct/t/ID/`**. URL se nemění při otevření ani při swipu
> (žádný pushState/replaceState) a viewer má předem načtených **9 `<video>`**.
> Každá položka vieweru má atribut **`data-reel-type`**: `reshared` je reel poslaný ve zprávě,
> `suggested` je 8 dalších reelů. Odkazy v položkách vedou na `/<uživatel>/reels/`
> a `/reels/audio/<číslo>/` (ne na ID reelu). DOM se při swipu nemění, posune se jen scroll.
>
> Skript proto ve zprávách skryje každou položku `data-reel-type` kromě `reshared`, zakáže
> scroll kolem poslaného videa, a když se spustí jiné video (událost `play`), zobrazí
> „Zablokováno“.

| Příznak | Pravděpodobná příčina |
|---|---|
| Po reelu ze zprávy jsou vidět další reely / jde swipovat | Instagram přejmenoval atribut `data-reel-type` nebo jeho hodnoty (`reshared`, `suggested`). V Inspektoru vyhledej `data-reel-type`; pošli snapshot vieweru. |
| Další reel se přehraje a „Zablokováno“ nepřijde | další položka hraje uvnitř `data-reel-type="reshared"` (změnila se struktura), nebo viewer už nemá žádný `data-reel-type`. Pošli snapshot před a po swipu. |
| „Zablokováno“ hned po otevření reelu ze zprávy | Instagram při otevření spouští i předem načtené video. Pošli snapshot hned po otevření. |
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

### Instagram: čtení kanálu

> **Zjištěno 2026-11-21 (HAR, mobilní i desktopový web):** stránka `/channel/KÓD/` pošle
> GraphQL dotaz `PolarisChannelLinkRootQuery` (proměnné `{"input":{"num_items":20,"thread_igid":…}}`).
> Odpověď `data.xfb_igd_channel_web_preview.channel_preview` má `title`, `number_of_members`
> a `items` (nejnovější první): `item_type` (`TEXT`, `LINK`, `MEDIA`, `MEDIA_SHARE`,
> `ACTION_LOG`), `text`, `timestamp` (µs), `sender` a `full_item_dict` (JSON jako text:
> `link.link_context`, `media.image_versions2`/`video_versions`, `direct_media_share.media`,
> `action_log.description`). Web zprávy nevykreslí. V HTML stránky tahle data nejsou.
>
> Jednorázovky (`RAVEN_IMAGE`/`RAVEN_VIDEO` v `IGDThreadDetailQuery`) mají `attachment: null`,
> médium web nedostane vůbec.

Skript vloží do stránky hook (`igChannelPageHook`), který u dotazů s `ChannelLink`
v těle (nebo na stránce `/channel/…`) přečte odpověď XHR/fetch a pošle ji událostí
`noshorts-ig-channel`. CSP Instagramu povoluje jen skripty s nonce, proto hook převezme
nonce z existujícího `<script nonce>`; záloha je `blob:` URL.

| Příznak | Pravděpodobná příčina |
|---|---|
| Na kanálu je dál jen „Use the Instagram app…“ | Hook se nevložil (zapni `debug`, v konzoli hledej `[no-shorts] hook kanálu: …`; `html[data-noshorts-ig-hook]` musí existovat), nebo se změnila odpověď (hledá se klíč `channel_preview`). Pošli HAR stránky kanálu (postup ve `fixtures/README.md`). |
| Panel je, ale chybí fotky/odkazy | změnila se struktura `full_item_dict`. Pošli HAR. |
| Panel ukazuje jiný kanál | data přišla k jinému kanálu; pošli postup (odkud jsi kanál otevřel). |

## Kde co je

| Web | Soubor | Kde hledat |
|---|---|---|
| YouTube | `src/sites/youtube.js` | `YT_SHORTS_PATH` (blokované URL), `rules()` (police, záložka, výsledky, hlavní stránka) |
| Instagram | `src/sites/instagram.js` | `IG_REELS_PATH`, `rules()` (Reels, Explore), `IG_SUGGESTED` + `scan()` (navrhované). Jeden reel: `IG_SINGLE_REEL_PATH` + `blocked()` (zámek ID), `igPickAllowedVideo` (které video je „to jedno“), `igSingleReelScan` (skrytí sousedů, odkazy na jiná ID), `igLockScroll`, `IG_OUTSIDE_EXCEPTIONS` (výjimky pro zprávy). Reel ze zprávy (overlay v `/direct/`): `IG_REEL_ITEM`/`IG_SHARED_ITEM` (`data-reel-type`), `igDirectViewerScan`, `igInstallPlayGuard`. Kanály: `src/sites/instagram-channel.js` – `igChannelPageHook` (hook ve stránce), `igParseChannelResponse` (rozbor odpovědi), `igChannelSync` (panel podle URL) |
| Facebook | `src/sites/facebook.js` | `FB_REELS_PATH`, `FB_WATCH_PATH`, `FB_UNIT_SELECTORS`/`FB_FEED` (jak se pozná příspěvek), `*_LABELS` + `scan()` |
| TikTok | `src/sites/tiktok.js` | blokuje se vše |
| Společné | `src/core/` | `text.js` (porovnávání popisků CZ/EN), `dom.js` (hledání příspěvku), `blockScreen.js`, `watch.js` (SPA, MutationObserver) |

Když Meta nebo YouTube přejmenuje text v UI (např. „Navrhované pro vás“), stačí přidat
nový popisek do příslušného seznamu `…_LABELS` / `IG_SUGGESTED`. Vždy česky i anglicky.
