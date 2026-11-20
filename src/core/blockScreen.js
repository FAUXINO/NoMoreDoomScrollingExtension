// Obrazovka „Zablokováno“ – nahradí obsah stránky, když je otevřená blokovaná URL.
import { logInfo } from './log.js';

const BLOCK_ID = 'noshorts-block';
const BLOCKED_ATTR = 'data-noshorts-blocked';

export const BLOCK_CSS = `
html[${BLOCKED_ATTR}] > body{display:none!important}
html[${BLOCKED_ATTR}]{overflow:hidden!important}
#${BLOCK_ID}{all:initial;position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;text-align:center;
  font:17px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f4f5;color:#18181b}
#${BLOCK_ID} *{all:revert;font-family:inherit}
#${BLOCK_ID} .ns-title{font-size:28px;font-weight:700;margin:0}
#${BLOCK_ID} .ns-text{margin:0;max-width:22em;color:#52525b}
#${BLOCK_ID} .ns-btn{display:inline-block;padding:12px 20px;border-radius:12px;background:#2563eb;color:#fff;
  text-decoration:none;font-weight:600}
@media (prefers-color-scheme: dark){
  #${BLOCK_ID}{background:#18181b;color:#f4f4f5}
  #${BLOCK_ID} .ns-text{color:#a1a1aa}
}`;

export function isBlocked(doc) {
  return doc.documentElement.hasAttribute(BLOCKED_ATTR);
}

export function showBlock(doc, { reason, homeUrl, homeLabel = 'Zpět na hlavní stránku' }) {
  const html = doc.documentElement;
  if (!html.hasAttribute(BLOCKED_ATTR)) logInfo('zablokováno:', reason, doc.location && doc.location.href);
  html.setAttribute(BLOCKED_ATTR, reason);
  const key = reason + '|' + (homeUrl || '');
  let box = doc.getElementById(BLOCK_ID);
  if (!box || box.dataset.key !== key) {
    if (box) box.remove();
    box = doc.createElement('div');
    box.id = BLOCK_ID;
    box.dataset.key = key;
    const title = doc.createElement('p');
    title.className = 'ns-title';
    title.textContent = 'Zablokováno';
    const text = doc.createElement('p');
    text.className = 'ns-text';
    text.textContent = reason + ' – tuhle stránku blokuje skript No Shorts.';
    box.append(title, text);
    if (homeUrl) {
      const btn = doc.createElement('a');
      btn.className = 'ns-btn';
      btn.href = homeUrl;
      btn.textContent = homeLabel;
      box.append(btn);
    }
  }
  // Vkládá se do <html> (vedle <body>), protože <body> je skryté a na document-start ani nemusí existovat.
  if (!box.isConnected) html.appendChild(box);
  silenceMedia(doc);
}

export function hideBlock(doc) {
  const html = doc.documentElement;
  if (!html.hasAttribute(BLOCKED_ATTR)) return;
  html.removeAttribute(BLOCKED_ATTR);
  const box = doc.getElementById(BLOCK_ID);
  if (box) box.remove();
  logInfo('odblokováno:', doc.location && doc.location.href);
}

// Skrytá stránka by mohla dál přehrávat zvuk – zastavit všechna média.
export function silenceMedia(doc) {
  for (const m of doc.querySelectorAll('video, audio')) {
    try {
      if (!m.paused) m.pause();
    } catch (e) {
      /* ignorovat */
    }
  }
}
