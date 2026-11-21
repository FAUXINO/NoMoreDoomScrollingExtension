# Snapshoty stránek (fixtures)

Sem patří HTML snapshoty skutečných stránek v mobilním layoutu. Testy (`npm test`)
nad nimi ověřují, že selektory pořád fungují. Když Meta, YouTube nebo TikTok změní
web, nový snapshot ukáže, co přesně se rozbilo.

## Jak snapshot uložit (Firefox na Fedoře)

1. Otevři Firefox a přihlas se na daný web.
2. Zapni responzivní režim: `Ctrl+Shift+M`. Nahoře vyber zařízení **iPhone**
   (např. „iPhone 12/13 Pro“). Tím se nastaví i user-agent iOS Safari.
   Pokud v seznamu iPhone není: „Upravit seznam…“ → zaškrtni nějaký iPhone.
3. Stránku znovu načti (`F5`), aby web poslal mobilní verzi.
4. Pomalu odscrolluj 3–5 obrazovek dolů, ať se načte víc obsahu (Reels, navrhované příspěvky…).
5. Ulož snapshot skriptem v konzoli. **Nepoužívej kopírování přes schránku**
   (Inspektor → Kopírovat → Vnější HTML): velké stránky se tak uříznou na 100 KB
   a zůstane jen začátek `<head>` bez obsahu.
   - V terminálu ve složce projektu zkopíruj skript do schránky:
     `wl-copy < scripts/snapshot-console.js`
     (balíček `wl-clipboard`: `sudo dnf install wl-clipboard`; na X11 `xclip -selection clipboard < …`).
   - Ve Firefoxu otevři konzoli (`Ctrl+Shift+K`), vlož skript a stiskni Enter.
     Firefox napoprvé chce, abys do konzole napsal `allow pasting` (nebo
     `povolit vkládání`) a skript vložil znovu.
   - Zadej název souboru (např. `dm-reel-open.html`). Soubor se uloží do Stažených.
     URL stránky skript zapíše na první řádek sám.
   - Pokud se soubor uloží pod jiným jménem (např. `downloaded-file-123`), hned ho
     přejmenuj na `<stránka>.html`.
6. Přesuň soubor do projektu:

   ```bash
   mkdir -p fixtures/instagram
   mv "$(xdg-user-dir DOWNLOAD)/dm-reel-open.html" fixtures/instagram/
   ```

7. Volitelně přidej pod první řádek, co musí zůstat vidět (CSS selektor), např.:

   ```html
   <!-- expect-visible: article a[href^="/p/"] -->
   ```

## Pojmenování

`fixtures/<web>/<stránka>.html`, kde `<web>` je `youtube`, `instagram` nebo `facebook`:

| Web | Doporučené snapshoty |
|---|---|
| YouTube | `home.html` (m.youtube.com/), `search.html` (výsledky hledání), `channel.html` (stránka kanálu), `watch.html` (přehrávač) |
| Instagram | `feed.html` (/), `profile.html` (profil kamaráda), `explore.html` (/explore/), `direct-thread.html` (konverzace s posdíleným reelem), `dm-reel-open.html` (reel otevřený ze zprávy), `dm-reel-next.html` (po swipu na další) |
| Facebook | `feed.html` (m.facebook.com/), `profile.html`, `video.html` (záložka Video) |

U snapshotů reelů nech skript No Shorts ve Violentmonkey **vypnutý**, jinak by
viewer upravil nebo zablokoval. Snapshot ulož ve chvíli, kdy je reel otevřený
a hraje (u `dm-reel-next.html` až po swipu na další). Postup s logováním navigace
je v [MAINTENANCE.md](../MAINTENANCE.md).

## HAR soubory (záznam ze Sítě)

Někdy je potřeba zjistit, jaká data web stahuje (např. jestli server webu posílá obsah,
který web nevykreslí). K tomu slouží HAR export z panelu Síť:

1. Firefox: `Ctrl+Shift+M` (iPhone), `Ctrl+Shift+E` (Síť) → ⚙ zaškrtni
   „Zachovat záznamy“ a „Vypnout mezipaměť“. Skript No Shorts ve Violentmonkey vypni.
2. Načti stránku (`F5`) a proveď, co je potřeba.
3. Pravý klik v seznamu požadavků → „Uložit vše jako HAR“ → ulož do
   `fixtures/instagram/<název>.har`.

**HAR obsahuje cookies a přihlašovací tokeny** (např. `sessionid`). Kdo je má, dostane se
do tvého účtu. Proto:
- ukládej ho jen do podsložky `fixtures/<web>/` (a `*.har` je navíc v `.gitignore`),
- nikam ho neposílej a nepřikládej k issue,
- po analýze ho smaž: `rm fixtures/instagram/*.har`.

## Soukromí

Snapshot obsahuje všechno, co jsi na stránce viděl: jména, příspěvky, někdy i náhledy zpráv.
Proto jsou soubory `fixtures/*/*.html` v `.gitignore` a necommitují se, ani automatickým
commitem po každé odpovědi. Testy s nimi fungují lokálně i tak.
Když chceš snapshot do repa přidat (repo je veřejné), nejdřív z něj odstraň osobní údaje
a pak ho přidej ručně: `git add -f fixtures/instagram/feed.html`.
