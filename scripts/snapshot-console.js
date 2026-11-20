// Uloží snapshot aktuální stránky jako soubor (pro fixtures/). Vlož celé do konzole
// prohlížeče (Firefox: Ctrl+Shift+K) a stiskni Enter. Soubor se uloží do Stažených.
//
// Navíc označí, co se z HTML jinak poznat nedá (CSS stránky se do snapshotu neukládá):
//   data-snap-playing="true|false"   – jestli video právě hraje
//   data-snap-in-view="true|false"   – jestli je video vidět na obrazovce
//   data-snap-scroll="…"             – prvek, který se dá scrollovat (overflow + scroll-snap)
//   data-snap-fixed                  – prvek s position:fixed (typicky overlay/viewer)
// Skripty, styly a <head> se vynechají, takže soubor je malý.
(() => {
  const name = prompt('Název souboru (např. dm-reel-open.html)', 'snapshot.html');
  if (!name) return;
  const vh = innerHeight;
  const vw = innerWidth;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    v.setAttribute('data-snap-playing', String(!v.paused));
    v.setAttribute('data-snap-in-view', String(r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw));
  }
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const scrollable =
      /(auto|scroll)/.test(s.overflowY + ' ' + s.overflowX) &&
      (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
    if (scrollable) el.setAttribute('data-snap-scroll', s.overflowY + '/' + s.overflowX + ' snap:' + s.scrollSnapType);
    if (s.position === 'fixed') el.setAttribute('data-snap-fixed', '');
  }
  const body = document.body.cloneNode(true);
  body.querySelectorAll('script, style, link, noscript').forEach((e) => e.remove());
  const html = '<!-- url: ' + location.href + ' -->\n<html><body>' + body.innerHTML + '</body></html>\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = name;
  a.click();
  console.log('[snapshot] uloženo:', name, Math.round(html.length / 1024) + ' KB');
})();
