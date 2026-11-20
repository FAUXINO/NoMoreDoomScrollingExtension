# No Shorts – userscript proti krátkým videím

Userscript pro **Safari na iPhonu** (rozšíření [Userscripts](https://github.com/quoid/userscripts)),
který odstraní krátká videa ze sociálních sítí. Zbytek webů funguje dál: feed od lidí,
které sleduješ, zprávy, profily i běžná videa na YouTube.

| Web | Co skript dělá |
|---|---|
| **YouTube** | Blokuje `/shorts/…`. Skrývá Shorts police, záložku Shorts, Shorts ve výsledcích hledání a na kanálech. Hlavní stránka je bez doporučených videí. |
| **Instagram** | Blokuje `/reels/` a `/reel/…`. Skrývá Reels ve feedu, v navigaci a na profilech, mřížku na Explore (vyhledávání zůstává) a navrhované příspěvky a účty. |
| **Facebook** | Blokuje `/reel/…` a záložku Video (`/watch`). Skrývá Reels ve feedu a v navigaci, příspěvky „Navrhované pro vás“ a Příběhy. Jednotlivá videa od přátel zůstávají. |
| **TikTok** | Blokuje celý web. |

Na zablokované stránce se místo obsahu zobrazí obrazovka **„Zablokováno“** s tlačítkem
zpět na hlavní stránku. Skript nedělá žádné síťové požadavky a nemá žádnou telemetrii.

---

## Instalace na iPhonu

Potřebuješ iOS 15.1 nebo novější.

### 1. Aplikace Userscripts

1. Z App Store nainstaluj **Userscripts** (projekt quoid/userscripts, zdarma, open source).
2. Jednou aplikaci otevři. Od verze 1.5 si sama nastaví výchozí složku na skripty,
   takže nic dalšího dělat nemusíš.
   - *Volitelně:* přes **Set Userscripts Directory** můžeš vybrat složku v iCloud Drive.
     Na iOS 18+ pak v aplikaci Soubory u té složky zapni „Ponechat staženo“, jinak ji
     systém může uvolnit a skripty přestanou fungovat.

### 2. Povolení rozšíření v Safari

1. **Nastavení → Aplikace → Safari → Rozšíření → Userscripts** (na starším iOS
   **Nastavení → Safari → Rozšíření**).
2. Zapni **Povolit rozšíření**.
3. V části oprávnění u **Ostatní webové stránky** nastav **Povolit** (Always Allow).
   Rozšíření tak poběží na všech webech a nebude se pokaždé ptát.
4. Doporučené: **Nastavení → Aplikace → Safari** → vypni **Předem načíst nejlepší
   výsledek** (anglicky *Preload Top Hit*). Safari jinak někdy načte stránku dřív,
   než se rozšíření stihne spustit, a krátká videa na okamžik probliknou.

### 3. Instalace skriptu

> **Podmínka:** repozitář na GitHubu musí být **veřejný**, jinak iPhone soubor nestáhne
> (GitHub → Settings → General → Danger Zone → Change visibility → Public).

1. V Safari otevři:
   **https://raw.githubusercontent.com/FAUXINO/NoMoreDoomScrollingExtension/main/no-shorts.user.js**
2. Klepni na ikonu rozšíření v adresním řádku (puzzle, případně „aA“) → **Userscripts**.
3. Objeví se nabídka instalace skriptu „No Shorts“ → **Install**.
4. Ověř, že skript funguje: otevři `https://m.youtube.com/shorts/` a měla by se zobrazit
   obrazovka „Zablokováno“.

*Alternativa bez GitHubu:* soubor `no-shorts.user.js` nahraj přes icloud.com do složky,
kterou má Userscripts nastavenou (viz krok 1). Potom jednou otevři popup rozšíření v Safari,
aby skript načetl.

### 4. Záložky na ploše (důležité)

Rozšíření Safari fungují **jen v Safari**. Nefungují ve webových aplikacích na ploše
ani v aplikacích Instagram, Facebook, YouTube a TikTok. Ty aplikace je proto dobré smazat
a místo nich používat záložky:

1. V Safari otevři web, např. `https://www.instagram.com/`.
2. Klepni na **Sdílet** (čtvereček se šipkou) → **Přidat na plochu**.
3. **VYPNI přepínač „Otevřít jako webovou aplikaci“.** S ním by se web otevíral
   v samostatném okně bez rozšíření a skript by nefungoval.
4. Klepni na **Přidat**.

Stejně tak přidej `https://m.youtube.com/` a `https://m.facebook.com/`.

---

## Nastavení

Na začátku souboru `no-shorts.user.js` je objekt `CONFIG` s přepínači (`true`/`false`),
například `hideHomeFeed` (prázdná hlavní stránka YouTube) nebo `hideStories` (Příběhy
na Facebooku). Všechny volby jsou v souboru popsané.

- **Trvalá změna:** uprav `src/config.js` v repozitáři, sestav skript (`npm run build`),
  zvyš verzi a pushni (viz „Aktualizace“). Na iPhonu pak skript aktualizuj.
- Úprava přímo na iPhonu (v aplikaci Soubory s textovým editorem) se při další
  aktualizaci přepíše.

## Aktualizace

**Vydání nové verze (na počítači):**

```bash
# 1. zvyš "version" v package.json (např. 0.1.0 → 0.1.1)
npm test          # sestaví no-shorts.user.js a spustí testy
git add -A && git commit -m "…" && git push
```

**Na iPhonu:**

- Userscripts podle `@updateURL` občas sám zkontroluje novou verzi a v popupu rozšíření
  ukáže dostupné aktualizace. Tahle funkce ale v Userscripts zatím není úplně dotažená
  ([issue #248](https://github.com/quoid/userscripts/issues/248)).
- **Spolehlivá cesta:** znovu otevři raw URL z kroku 3 a skript znovu nainstaluj
  (přepíše starou verzi). GitHub raw soubory cachuje zhruba 5 minut, takže nová verze
  může být vidět až chvíli po pushi.

---

## Vývoj a testování na Fedoře (bez iPhonu)

```bash
npm install       # jediná závislost: jsdom (jen pro testy)
npm run build     # src/ → no-shorts.user.js + no-shorts.meta.js
npm test          # build + testy (node --test)
```

Struktura:

```
src/config.js        nastavení (CONFIG)
src/core/            společné jádro: CSS, skrývání, obrazovka Zablokováno, sledování URL a DOM
src/sites/*.js       jeden modul na web (youtube, instagram, facebook, tiktok)
src/main.js          spuštění modulu podle webu (každý krok v try/catch)
scripts/build.mjs    spojí moduly do jednoho souboru
tests/               testy (jsdom); fixtures/ = snapshoty skutečných stránek
```

### Ruční test ve Firefoxu

1. Do Firefoxu nainstaluj doplněk **Violentmonkey**. Podporuje `@run-at document-start`
   i `@inject-into content` stejně jako Userscripts.
2. Ve složce projektu spusť `python3 -m http.server 8000` a ve Firefoxu otevři
   `http://localhost:8000/no-shorts.user.js`. Violentmonkey nabídne instalaci.
   Volba „Sledovat místní soubor“ zajistí, že se po každém `npm run build` načte nová verze.
3. Pro ladění nastav v `src/config.js` hodnotu `debug: true` a znovu sestav.
   V konzoli (`Ctrl+Shift+K`) se pak vypisuje `[no-shorts] skryto: …` s důvodem.
   Skryté prvky mají v Inspektoru atribut `data-noshorts-hidden="důvod"`.
4. Zapni responzivní režim (`Ctrl+Shift+M`), vyber **iPhone** a stránku znovu načti,
   ať web pošle mobilní verzi.
5. Projdi stránky:
   - YouTube: hlavní stránka, hledání, kanál, `/shorts/ID`, běžné video
   - Instagram: feed, profil, `/explore/`, `/reels/`, `/reel/ID`, zprávy
   - Facebook: feed, `/reel/ID`, `/watch/`, video od kamaráda
   - TikTok

Automatické testy nad snapshoty stránek: viz [fixtures/README.md](fixtures/README.md).
Co dělat, když web změní vzhled: viz [MAINTENANCE.md](MAINTENANCE.md).
