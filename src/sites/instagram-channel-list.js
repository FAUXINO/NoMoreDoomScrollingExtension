// Instagram: kanály v seznamu chatů (CONFIG.instagram.channelsInInbox).
//
// Web kanály do seznamu chatů vůbec nenačítá (ověřeno HAR 2026-11-21: první stránka
// PolarisDirectInboxMobileQuery pokrývala aktivitu, ve které kanál měl zprávu, a kanál v ní nebyl).
// Skript si proto kanály pamatuje sám (localStorage):
//  - kanál se zapamatuje při otevření /channel/KÓD/ (panel kanálu), tlačítkem v panelu jde odebrat,
//  - v seznamu chatů se pro každý kanál vloží řádek – klon existujícího řádku Instagramu
//    (stejný vzhled), zařazený podle času poslední zprávy mezi ostatní konverzace,
//  - data řádků se v seznamu chatů obnovují dotazem PolarisChannelLinkRootQuery (stejný dotaz,
//    jaký posílá stránka kanálu; nejvýš jednou za IG_CHANNEL_REFRESH_MS). Dotaz posílá hook
//    ve stránce (instagram-channel.js) s parametry relace z posledního dotazu Instagramu.
//
// Řádky Instagramu nemají v DOM ID vlákna ani přesný čas. Řazení proto bere čas z
// <abbr aria-label="14 minutes ago"> (nebo zkráceného textu „14m“); řádky bez času se přeskočí.
// Kanál se vloží před první nepřipnutý řádek se starším časem. Když React seznam překreslí
// a řádek kanálu zmizí nebo se posune, další dávka mutací ho vrátí na místo.
import { logInfo } from '../core/log.js';

export const IG_CHANNEL_STORE_KEY = 'noshorts-ig-channels';
export const IG_CHANNEL_REFRESH_MS = 10 * 60 * 1000;
const IG_CHANNEL_ROW_ATTR = 'data-noshorts-channel-row';
const IG_INBOX_LIST = '[data-pagelet^="IGDInboxThreadListScrollableArea"]';
const IG_PINNED = /^(?:pinned|připnut)/i;
const IG_CHANNEL_CODE = /^[A-Za-z0-9_-]+$/;
const IG_THREAD_ID = /^\d+$/;

// --- úložiště ----------------------------------------------------------------
// { version: 1, docId: '…', channels: { KÓD: { code, threadId, title, image, lastText, lastTime, openedAt, refreshedAt, hidden } } }

export function igLoadChannels(win) {
  try {
    const raw = win.localStorage.getItem(IG_CHANNEL_STORE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && typeof data === 'object' && data.channels && typeof data.channels === 'object') return data;
  } catch (e) {
    /* poškozená nebo nedostupná data – začít znovu */
  }
  return { version: 1, docId: null, channels: {} };
}

export function igSaveChannels(win, store) {
  try {
    win.localStorage.setItem(IG_CHANNEL_STORE_KEY, JSON.stringify(store));
  } catch (e) {
    /* plné nebo zakázané úložiště – řádky se jen nezapamatují */
  }
}

export function igChannelCodeFromPath(pathname) {
  const m = /^\/channel\/([^/]+)\/?$/.exec(pathname || '');
  return m && IG_CHANNEL_CODE.test(m[1]) ? m[1] : null;
}

// Text poslední zprávy pro řádek (jako náhled v seznamu chatů).
export function igChannelPreviewText(item) {
  if (!item) return '';
  if (item.type === 'ACTION_LOG') return item.action || '';
  if (item.text) return item.text.replace(/\s+/g, ' ').trim();
  if (item.link) return item.link.title || item.link.url || 'Odkaz';
  if (item.media && item.media.length) return item.media[0].video ? 'Video' : 'Fotka';
  if (item.share) return item.share.kind;
  return 'Zpráva';
}

// Uloží/aktualizuje kanál z rozebrané odpovědi (igParseChannelResponse).
// `code` je jen u otevřené stránky kanálu; obnova ze seznamu chatů páruje podle threadId.
export function igRememberChannel(store, data, { code = null, now = Date.now(), opened = false } = {}) {
  let entry = null;
  if (code) entry = store.channels[code];
  if (!entry && data.threadId) entry = Object.values(store.channels).find((c) => c.threadId === data.threadId) || null;
  if (!entry) {
    if (!code) return null; // neznámý kanál z obnovy – nepřidávat
    entry = store.channels[code] = { code, hidden: false };
  }
  if (data.threadId && IG_THREAD_ID.test(data.threadId)) entry.threadId = data.threadId;
  if (data.title) entry.title = data.title;
  if (data.image) entry.image = data.image;
  const last = data.items.length ? data.items[data.items.length - 1] : null;
  if (last && last.time) {
    const t = last.time.getTime();
    if (!entry.lastTime || t >= entry.lastTime) {
      entry.lastTime = t;
      entry.lastText = igChannelPreviewText(last);
    }
  }
  if (opened) entry.openedAt = now;
  entry.refreshedAt = now;
  return entry;
}

// Kanály k zobrazení, nejnovější první.
export function igVisibleChannels(store) {
  return Object.values(store.channels)
    .filter((c) => c && !c.hidden && c.code && IG_CHANNEL_CODE.test(c.code))
    .sort((a, b) => (b.lastTime || b.openedAt || 0) - (a.lastTime || a.openedAt || 0));
}

// Kanály, které je potřeba obnovit (známe threadId, poslední obnova je starší než limit).
export function igChannelsToRefresh(store, now = Date.now()) {
  return igVisibleChannels(store).filter(
    (c) => c.threadId && IG_THREAD_ID.test(c.threadId) && !(c.refreshedAt && now - c.refreshedAt < IG_CHANNEL_REFRESH_MS),
  );
}

// --- čas -------------------------------------------------------------------------

const IG_UNIT_MS = [
  [/^(?:mo|month|měs)/, 30 * 86400000],
  [/^(?:s|sec|second|sekund|vteř)/, 1000],
  [/^(?:m|min)/, 60000],
  [/^(?:h|hour|hod)/, 3600000],
  [/^(?:d|day|den|dn)/, 86400000],
  [/^(?:w|week|t|týd)/, 7 * 86400000],
  [/^(?:y|year|r|rok|let)/, 365 * 86400000],
];

// „14 minutes ago“, „a day ago“, „před 2 dny“, „před minutou“, „14m“, „1 d“ → přibližný čas v ms.
export function igParseRelativeTime(label, now = Date.now()) {
  let s = String(label || '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (/^(?:just now|now|právě teď|teď|nyní)$/.test(s)) return now;
  s = s.replace(/^před\s+/, '').replace(/^(?:an?|one)\s+/, '1 ');
  const m = /^(\d+)?\s*([^\d\s.,]+)/.exec(s);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : 1;
  const unit = IG_UNIT_MS.find(([re]) => re.test(m[2]));
  return unit ? now - n * unit[1] : null;
}

export function igFormatShortTime(time, now = Date.now(), czech = false) {
  const diff = Math.max(0, now - time);
  const min = Math.floor(diff / 60000);
  if (min < 1) return czech ? 'teď' : 'now';
  if (min < 60) return czech ? min + ' min' : min + 'm';
  const h = Math.floor(min / 60);
  if (h < 24) return czech ? h + ' h' : h + 'h';
  const d = Math.floor(h / 24);
  if (d < 7) return czech ? d + ' d' : d + 'd';
  const w = Math.floor(d / 7);
  return czech ? w + ' týd.' : w + 'w';
}

// --- DOM seznamu chatů -----------------------------------------------------------

function igIsOurRow(el) {
  return el.hasAttribute(IG_CHANNEL_ROW_ATTR);
}

// Najde kontejner seznamu konverzací a jeho řádky (přímé děti s role="button").
// Lišta poznámek (ul > li) se vynechá.
export function igFindInboxList(doc) {
  const area = doc.querySelector(IG_INBOX_LIST);
  if (!area) return null;
  const buttons = [...area.querySelectorAll('[role="button"]')].filter(
    (b) => !b.closest('ul, li, [' + IG_CHANNEL_ROW_ATTR + ']') && b.querySelector('img'),
  );
  if (buttons.length < 1) return null;
  // Kontejner = nejbližší předek prvního řádku, jehož děti obsahují aspoň dva různé řádky
  // (u jediného řádku jeho nejvyšší předek pod oblastí s víc dětmi).
  let child = buttons[0];
  let container = child.parentElement;
  while (container && container !== area) {
    const rowsInside = buttons.filter((b) => container.contains(b));
    if (rowsInside.length > 1 && !child.contains(rowsInside[1])) break;
    if (buttons.length === 1 && container.children.length > 1) break;
    child = container;
    container = container.parentElement;
  }
  if (!container || container === area) return null;
  const rows = [...container.children].filter((c) => !igIsOurRow(c) && buttons.some((b) => c.contains(b)));
  return rows.length ? { container, rows } : null;
}

function igRowIsPinned(row) {
  for (const el of row.querySelectorAll('svg[aria-label], [aria-label] title, svg title')) {
    const label = el.getAttribute('aria-label') || el.textContent;
    if (IG_PINNED.test((label || '').trim())) return true;
  }
  return false;
}

export function igRowTime(row, now = Date.now()) {
  const abbr = row.querySelector('abbr');
  if (!abbr) return null;
  return igParseRelativeTime(abbr.getAttribute('aria-label'), now) ?? igParseRelativeTime(abbr.textContent, now);
}

// Šablona = řádek s časem a bez připnutí (jinak první řádek).
function igPickTemplate(rows) {
  return rows.find((r) => r.querySelector('abbr') && !igRowIsPinned(r)) || rows.find((r) => !igRowIsPinned(r)) || rows[0];
}

function igLetterAvatar(title) {
  const letter = ((title || '?').trim()[0] || '?').toUpperCase();
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#a1a1aa"/>' +
    '<text x="28" y="36" font-size="24" font-family="sans-serif" text-anchor="middle" fill="#fff">' +
    letter.replace(/[<>&"']/g, '') +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Text do nejhlubšího prvku (zachová vnořené <span> se styly Instagramu).
function igSetText(el, text) {
  let t = el;
  while (t.children.length === 1) t = t.children[0];
  t.textContent = text;
}

export function igBuildChannelRow(doc, template, channel, now = Date.now()) {
  const row = template.cloneNode(true);
  row.setAttribute(IG_CHANNEL_ROW_ATTR, channel.code);
  row.removeAttribute('id');
  for (const el of row.querySelectorAll('[id]')) el.removeAttribute('id');
  // Připnutí, odznaky nepřečtených apod. ze šablony pryč.
  for (const el of row.querySelectorAll('svg[aria-label]')) {
    if (IG_PINNED.test(el.getAttribute('aria-label'))) el.remove();
  }

  const img = row.querySelector('img');
  if (img) {
    img.removeAttribute('srcset');
    img.setAttribute('src', channel.image || igLetterAvatar(channel.title));
    img.setAttribute('alt', '');
    img.addEventListener('error', () => img.setAttribute('src', igLetterAvatar(channel.title)), { once: true });
  }

  const texts = [...row.querySelectorAll('span[dir="auto"]')].filter((s) => !s.querySelector('abbr') && !s.closest('abbr'));
  if (texts[0]) igSetText(texts[0], channel.title || 'Kanál');
  if (texts[1]) igSetText(texts[1], channel.lastText || 'Kanál');
  for (const extra of texts.slice(2)) igSetText(extra, '');

  const abbr = row.querySelector('abbr');
  if (abbr) {
    const czech = /^cs/i.test(doc.documentElement.getAttribute('lang') || '');
    if (channel.lastTime) {
      abbr.setAttribute('aria-label', new Date(channel.lastTime).toLocaleString(czech ? 'cs-CZ' : undefined));
      igSetText(abbr, igFormatShortTime(channel.lastTime, now, czech));
    } else {
      abbr.removeAttribute('aria-label');
      igSetText(abbr, '');
    }
  }

  const button = row.matches('[role="button"]') ? row : row.querySelector('[role="button"]');
  if (button) button.setAttribute('aria-label', 'Kanál ' + (channel.title || ''));
  const open = (e) => {
    e.preventDefault();
    e.stopPropagation();
    doc.defaultView.location.assign('/channel/' + channel.code + '/');
  };
  row.addEventListener('click', open, true);
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') open(e);
  }, true);
  return row;
}

// Cílové pořadí: každý kanál před první nepřipnutý řádek Instagramu se starším časem
// (nebo za poslední řádek Instagramu). Vrací [{ channel, before }] (before = řádek nebo null).
export function igChannelPlacement(rows, channels, now = Date.now()) {
  const timed = rows.map((row) => ({ row, pinned: igRowIsPinned(row), time: igRowTime(row, now) }));
  return channels.map((channel) => {
    const t = channel.lastTime || 0;
    const hit = timed.find((r) => !r.pinned && r.time != null && r.time < t);
    return { channel, before: hit ? hit.row : null };
  });
}

// Vloží/aktualizuje řádky kanálů v seznamu chatů. Idempotentní (bez změny DOM, když vše sedí).
export function igSyncChannelRows(doc, channels, now = Date.now()) {
  const list = igFindInboxList(doc);
  const existing = new Map([...doc.querySelectorAll('[' + IG_CHANNEL_ROW_ATTR + ']')].map((el) => [el.getAttribute(IG_CHANNEL_ROW_ATTR), el]));
  if (!list) return 0;
  const { container, rows } = list;
  const template = igPickTemplate(rows);
  const wanted = new Set(channels.map((c) => c.code));
  for (const [code, el] of existing) {
    if (!wanted.has(code)) {
      el.remove();
      existing.delete(code);
    }
  }
  const placement = igChannelPlacement(rows, channels, now);
  const ours = new Map();
  for (const { channel } of placement) {
    const shortTime = channel.lastTime ? igFormatShortTime(channel.lastTime, now) : '';
    const key = [channel.title, channel.lastText, channel.lastTime, shortTime, channel.image].join('|');
    let row = existing.get(channel.code);
    if (row && row.dataset.noshortsKey !== key) {
      row.remove();
      row = null;
    }
    if (!row) {
      row = igBuildChannelRow(doc, template, channel, now);
      row.dataset.noshortsKey = key;
      logInfo('kanál v seznamu chatů:', channel.code);
    }
    ours.set(channel.code, row);
  }

  // Cílové pořadí řádků Instagramu a kanálů vs. skutečné; měnit DOM jen při rozdílu.
  const desired = [];
  for (const r of rows) {
    for (const p of placement) if (p.before === r) desired.push(ours.get(p.channel.code));
    desired.push(r);
  }
  for (const p of placement) if (!p.before) desired.push(ours.get(p.channel.code));
  const known = new Set(desired);
  const actual = [...container.children].filter((c) => known.has(c));
  if (actual.length === desired.length && actual.every((el, i) => el === desired[i])) return channels.length;

  let cursor = rows[rows.length - 1];
  for (const p of placement) {
    const row = ours.get(p.channel.code);
    if (p.before) {
      container.insertBefore(row, p.before);
    } else {
      container.insertBefore(row, cursor.nextSibling);
      cursor = row;
    }
  }
  return channels.length;
}
