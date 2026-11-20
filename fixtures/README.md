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
5. Otevři Inspektor (`Ctrl+Shift+C`), v panelu HTML klikni pravým tlačítkem na úplně
   horní řádek `<html …>` → **Kopírovat** → **Vnější HTML**.
6. V terminálu ve složce projektu ulož schránku do souboru a na začátek přidej URL:

   ```bash
   mkdir -p fixtures/instagram
   { echo '<!-- url: https://www.instagram.com/ -->'; wl-paste; } > fixtures/instagram/feed.html
   ```

   (`wl-paste` je z balíčku `wl-clipboard`: `sudo dnf install wl-clipboard`.
   Na X11 místo něj `xclip -o -selection clipboard`.)
   URL v komentáři musí být adresa stránky, ze které snapshot je (podle ní se zapnou pravidla).

7. Volitelně přidej pod první řádek, co musí zůstat vidět (CSS selektor), např.:

   ```html
   <!-- expect-visible: article a[href^="/p/"] -->
   ```

## Pojmenování

`fixtures/<web>/<stránka>.html`, kde `<web>` je `youtube`, `instagram` nebo `facebook`:

| Web | Doporučené snapshoty |
|---|---|
| YouTube | `home.html` (m.youtube.com/), `search.html` (výsledky hledání), `channel.html` (stránka kanálu), `watch.html` (přehrávač) |
| Instagram | `feed.html` (/), `profile.html` (profil kamaráda), `explore.html` (/explore/) |
| Facebook | `feed.html` (m.facebook.com/), `profile.html`, `video.html` (záložka Video) |

## Soukromí

Snapshot obsahuje všechno, co jsi na stránce viděl: jména, příspěvky, někdy i náhledy zpráv.
Proto jsou soubory `fixtures/*/*.html` v `.gitignore` a necommitují se, ani automatickým
commitem po každé odpovědi. Testy s nimi fungují lokálně i tak.
Když chceš snapshot do repa přidat (repo je veřejné), nejdřív z něj odstraň osobní údaje
a pak ho přidej ručně: `git add -f fixtures/instagram/feed.html`.
