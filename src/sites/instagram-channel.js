// Instagram: čtení kanálu (/channel/KÓD/) na mobilním webu (CONFIG.instagram.channelReader).
//
// Web u kanálu ukáže jen „Use the Instagram app … to join this channel“. Na pozadí ale
// stáhne náhled kanálu – GraphQL dotaz PolarisChannelLinkRootQuery (ověřeno HAR 2026-11),
// odpověď data.xfb_igd_channel_web_preview.channel_preview.items = posledních 20 zpráv
// (TEXT, LINK, MEDIA, MEDIA_SHARE, ACTION_LOG; každá s full_item_dict jako JSON string).
// Skript tuhle odpověď zachytí a zprávy vykreslí jen pro čtení. Panel sám nic nestahuje;
// jediný vlastní dotaz je obnova kanálů v seznamu chatů (instagram-channel-list.js).
//
// Odpověď čte jen svět stránky (content script nevidí její XHR/fetch). Proto se do stránky
// vloží malý hook (igChannelPageHook), který odpověď pošle událostí na document.
// CSP Instagramu nepovoluje inline skripty bez nonce: hook dostane nonce z existujícího
// <script nonce>, záloha je blob: URL (CSP ho ve script-src povoluje).
//
// Jednorázové fotky/videa web zobrazit neumí: server u nich posílá attachment: null.
import { logInfo, logError } from '../core/log.js';
import { igLoadChannels, igSaveChannels, igRememberChannel, igVisibleChannels, igChannelsToRefresh, igSyncChannelRows, igChannelCodeFromPath, IG_CHANNEL_REFRESH_MS } from './instagram-channel-list.js';

const IG_CHANNEL_HOOK = {
  attr: 'data-noshorts-ig-hook',
  data: 'noshorts-ig-channel',
  docId: 'noshorts-ig-channel-docid',
  refresh: 'noshorts-ig-channel-refresh',
  refreshed: 'noshorts-ig-channel-refreshed',
};
const IG_CHANNEL_PANEL_ID = 'noshorts-ig-channel';
const IG_CHANNEL_PATH = /^\/channel\/[^/]+\/?$/;
// Data stažená těsně před navigací (Instagram dotaz někdy pošle už při kliknutí) platí jen chvíli.
const IG_CHANNEL_PREFETCH_MS = 4000;

export function igIsChannelPath(pathname) {
  return IG_CHANNEL_PATH.test(pathname);
}

// --- hook ve světě stránky ---------------------------------------------------
// Pozor: funkce se do stránky vkládá jako text (toString), nesmí používat nic zvenku.
// names = { attr, data, docId, refresh, refreshed } – atribut „hook běží“ a názvy událostí:
//  data      → content script: odpověď dotazu na kanál, který poslal Instagram (detail = text)
//  docId     → content script: doc_id dotazu PolarisChannelLinkRootQuery (detail = číslo jako text)
//  refresh   ← content script: obnov kanály (detail = JSON { docId, threadIds })
//  refreshed → content script: odpověď obnovy (detail = text)
// Obnova použije parametry relace (fb_dtsg, lsd, hlavičky) z posledního GraphQL dotazu
// Instagramu; nic z toho se neukládá mimo paměť stránky.
export function igChannelPageHook(names) {
  const root = document.documentElement;
  if (root.hasAttribute(names.attr)) return;
  root.setAttribute(names.attr, '1');
  const MARKER = 'channel_preview';
  const FRIENDLY = 'PolarisChannelLinkRootQuery';
  const info = new WeakMap(); // xhr → { url, headers }
  const own = new WeakSet(); // vlastní dotazy obnovy
  let template = null; // { url, headers, body } posledního GraphQL dotazu Instagramu
  let pending = null;

  const fire = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  const bodyText = (body) => {
    if (typeof body === 'string') return body;
    if (body && typeof URLSearchParams === 'function' && body instanceof URLSearchParams) return body.toString();
    return '';
  };
  const isChannelRequest = (body) => {
    try {
      if (location.pathname.indexOf('/channel/') === 0) return true;
      const text = bodyText(body);
      if (text) return text.indexOf('ChannelLink') !== -1;
      if (body && typeof body.get === 'function') return String(body.get('fb_api_req_friendly_name') || '').indexOf('ChannelLink') !== -1;
    } catch (e) {
      /* ignorovat */
    }
    return false;
  };
  const noteRequest = (url, headers, body) => {
    const text = bodyText(body);
    if (!text || text.indexOf('doc_id=') === -1 || !/\/api\/graphql\/?(?:\?|$)/.test(String(url))) return;
    const params = new URLSearchParams(text);
    if (String(params.get('fb_api_req_friendly_name') || '').indexOf('ChannelLink') !== -1 && /^\d+$/.test(params.get('doc_id') || '')) {
      fire(names.docId, params.get('doc_id'));
    }
    if (params.get('fb_dtsg')) {
      template = { url: String(url), headers: headers.slice(), body: text };
      if (pending) {
        const job = pending;
        pending = null;
        refresh(job);
      }
    }
  };
  const emit = (name, text) => {
    if (typeof text === 'string' && text.indexOf(MARKER) !== -1) fire(name, text);
  };

  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  const origOpen = proto && proto.open;
  const origSend = proto && proto.send;
  const origSetHeader = proto && proto.setRequestHeader;
  if (proto && origSend && origOpen && origSetHeader) {
    proto.open = function (method, url) {
      try {
        info.set(this, { url: String(url), headers: [] });
      } catch (e) {
        /* ignorovat */
      }
      return origOpen.apply(this, arguments);
    };
    proto.setRequestHeader = function (name, value) {
      try {
        const i = info.get(this);
        if (i) i.headers.push([String(name), String(value)]);
      } catch (e) {
        /* ignorovat */
      }
      return origSetHeader.apply(this, arguments);
    };
    proto.send = function (body) {
      try {
        if (!own.has(this)) {
          const i = info.get(this);
          if (i) noteRequest(i.url, i.headers, body);
          if (isChannelRequest(body)) {
            this.addEventListener('load', function () {
              try {
                if (this.responseType === '' || this.responseType === 'text') emit(names.data, this.responseText);
                else if (this.responseType === 'json') emit(names.data, JSON.stringify(this.response));
              } catch (e) {
                /* ignorovat */
              }
            });
          }
        }
      } catch (e) {
        /* ignorovat */
      }
      return origSend.apply(this, arguments);
    };
  }
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const p = origFetch.apply(this, arguments);
      try {
        const body = init && init.body;
        if (bodyText(body)) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          const h = init && init.headers;
          const headers = !h ? [] : typeof h.forEach === 'function' && !Array.isArray(h) ? (() => { const a = []; h.forEach((v, k) => a.push([k, v])); return a; })() : Array.isArray(h) ? h.slice() : Object.keys(h).map((k) => [k, h[k]]);
          noteRequest(url, headers, body);
        }
        if (isChannelRequest(body)) {
          p.then((res) => res.clone().text()).then((t) => emit(names.data, t), () => {});
        }
      } catch (e) {
        /* ignorovat */
      }
      return p;
    };
  }

  // Obnova kanálů: jeden dotaz na kanál, postupně, se stejnými parametry jako Instagram.
  function refresh(job) {
    if (!template || !origOpen) {
      pending = job;
      return;
    }
    const ids = job.threadIds.filter((id) => /^\d+$/.test(id));
    let i = 0;
    const next = () => {
      if (i >= ids.length) return;
      const id = ids[i++];
      try {
        const params = new URLSearchParams(template.body);
        params.set('fb_api_req_friendly_name', FRIENDLY);
        params.set('variables', '{"input":{"num_items":1,"thread_igid":' + id + '}}');
        params.set('doc_id', job.docId);
        params.set('server_timestamps', 'true');
        const xhr = new XMLHttpRequest();
        own.add(xhr);
        origOpen.call(xhr, 'POST', template.url, true);
        for (const [k, v] of template.headers) {
          if (/^x-fb-friendly-name$/i.test(k)) origSetHeader.call(xhr, k, FRIENDLY);
          else origSetHeader.call(xhr, k, v);
        }
        xhr.addEventListener('loadend', function () {
          try {
            if (this.status === 200) emit(names.refreshed, this.responseText);
          } catch (e) {
            /* ignorovat */
          }
          setTimeout(next, 400);
        });
        origSend.call(xhr, params.toString());
      } catch (e) {
        setTimeout(next, 400);
      }
    };
    next();
  }
  document.addEventListener(names.refresh, (e) => {
    try {
      const job = JSON.parse(e.detail);
      if (job && /^\d+$/.test(String(job.docId)) && Array.isArray(job.threadIds)) refresh({ docId: String(job.docId), threadIds: job.threadIds.map(String) });
    } catch (err) {
      /* ignorovat */
    }
  });
}

function igHookInstalled(doc) {
  return doc.documentElement.hasAttribute(IG_CHANNEL_HOOK.attr);
}

function igInjectCode(doc, code) {
  const win = doc.defaultView;
  const parent = doc.head || doc.documentElement;
  // 1) Inline skript s nonce stránky (CSP Instagramu: 'nonce-…').
  const withNonce = doc.querySelector('script[nonce]');
  const nonce = withNonce ? withNonce.nonce || withNonce.getAttribute('nonce') : '';
  const s = doc.createElement('script');
  if (nonce) s.setAttribute('nonce', nonce);
  s.textContent = code;
  parent.appendChild(s);
  s.remove();
  if (igHookInstalled(doc)) return 'inline';
  // 2) Záloha: blob: URL (script-src 'blob:'). Spustí se asynchronně.
  if (!win.URL || typeof win.URL.createObjectURL !== 'function' || !win.Blob) return 'nepovedlo se';
  try {
    const url = win.URL.createObjectURL(new win.Blob([code], { type: 'text/javascript' }));
    const b = doc.createElement('script');
    if (nonce) b.setAttribute('nonce', nonce);
    b.src = url;
    b.onload = b.onerror = () => {
      b.remove();
      win.URL.revokeObjectURL(url);
      logInfo('hook kanálu přes blob:', igHookInstalled(doc) ? 'OK' : 'nepovedlo se');
    };
    parent.appendChild(b);
  } catch (e) {
    logError('instagram.channelHook', e);
  }
  return 'blob';
}

// Vloží hook co nejdřív, ale až když stránka má <script nonce> (na document-start ještě není).
function igInstallPageHook(doc) {
  const code = `(${igChannelPageHook.toString()})(${JSON.stringify(IG_CHANNEL_HOOK)});`;
  let done = false;
  let mo = null;
  const attempt = () => {
    if (done) return;
    done = true;
    if (mo) mo.disconnect();
    try {
      logInfo('hook kanálu:', igInjectCode(doc, code));
    } catch (e) {
      logError('instagram.channelHook', e);
    }
  };
  if (doc.querySelector('script[nonce]')) return attempt();
  const win = doc.defaultView;
  mo = new win.MutationObserver(() => {
    if (doc.querySelector('script[nonce]')) attempt();
  });
  mo.observe(doc, { childList: true, subtree: true });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', attempt, { once: true });
  else attempt();
}

// --- zpracování odpovědi ---------------------------------------------------------

function igFindChannelPreview(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (obj.channel_preview && Array.isArray(obj.channel_preview.items)) return obj.channel_preview;
  for (const key of Object.keys(obj)) {
    const found = igFindChannelPreview(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// Jen http(s) URL; přesměrování l.instagram.com/?u=… se rozbalí na cílovou adresu.
function igSafeUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  let u;
  try {
    u = new URL(value, 'https://www.instagram.com/');
  } catch (e) {
    return null;
  }
  if (u.hostname === 'l.instagram.com' && u.searchParams.get('u')) return igSafeUrl(u.searchParams.get('u'));
  return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
}

function igBestUrl(list) {
  if (!Array.isArray(list)) return null;
  for (const c of list) {
    const url = c && igSafeUrl(c.url);
    if (url) return url;
  }
  return null;
}

function igMediaInfo(media) {
  if (!media || typeof media !== 'object') return [];
  if (Array.isArray(media.carousel_media) && media.carousel_media.length) {
    return media.carousel_media.flatMap((m) => igMediaInfo(m));
  }
  const image = igBestUrl(media.image_versions2 && media.image_versions2.candidates);
  const video = media.media_type === 2 ? igBestUrl(media.video_versions) : null;
  return image || video ? [{ image, video }] : [];
}

function igParseItem(raw) {
  let full = {};
  try {
    full = typeof raw.full_item_dict === 'string' ? JSON.parse(raw.full_item_dict) : raw.full_item_dict || {};
  } catch (e) {
    full = {};
  }
  const type = String(raw.item_type || full.item_type || '').toUpperCase();
  const sender = raw.sender || {};
  const ts = Number(raw.timestamp || full.timestamp);
  const item = {
    id: String(raw.message_id || full.item_id || ''),
    type,
    time: Number.isFinite(ts) && ts > 0 ? new Date(ts / 1000) : null,
    sender: sender.full_name || sender.username || '',
    text: typeof raw.text === 'string' ? raw.text : typeof full.text === 'string' ? full.text : '',
    media: [],
    link: null,
    share: null,
    action: null,
  };
  if (type === 'LINK' && full.link) {
    const ctx = full.link.link_context || {};
    item.text = item.text || full.link.text || '';
    item.link = {
      url: igSafeUrl(ctx.link_url),
      title: ctx.link_title || '',
      summary: ctx.link_summary || '',
      image: igSafeUrl(ctx.link_image_url),
    };
  } else if (type === 'MEDIA') {
    item.media = igMediaInfo(full.media);
  } else if (type === 'MEDIA_SHARE') {
    const m = (full.direct_media_share && full.direct_media_share.media) || full.media_share || null;
    if (m) {
      const isReel = m.product_type === 'clips';
      const code = typeof m.code === 'string' && /^[A-Za-z0-9_-]+$/.test(m.code) ? m.code : null;
      const preview = igMediaInfo(m)[0];
      item.share = {
        href: code ? (isReel ? '/reel/' : '/p/') + code + '/' : null,
        kind: isReel ? 'Reel' : 'Příspěvek',
        author: (m.user && m.user.username) || '',
        caption: (m.caption && m.caption.text) || '',
        image: preview ? preview.image : null,
      };
    }
  } else if (type === 'ACTION_LOG') {
    item.action = (full.action_log && full.action_log.description) || '';
  }
  return item;
}

// Vrátí { title, members, items } (zprávy od nejstarší po nejnovější) nebo null.
export function igParseChannelResponse(text) {
  if (typeof text !== 'string' || text.indexOf('channel_preview') === -1) return null;
  // Odpověď může mít prefix „for (;;);“ a víc JSON objektů na řádcích.
  const body = text.replace(/^\s*for\s*\(;;\);/, '');
  for (const line of body.split('\n')) {
    if (line.indexOf('channel_preview') === -1) continue;
    let json;
    try {
      json = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const preview = igFindChannelPreview(json);
    if (!preview) continue;
    const items = preview.items.filter((it) => it && typeof it === 'object').map(igParseItem);
    items.sort((a, b) => (a.time ? a.time.getTime() : 0) - (b.time ? b.time.getTime() : 0));
    return {
      threadId: String(preview.thread_igid || ''),
      title: typeof preview.title === 'string' ? preview.title : '',
      image: igSafeUrl(preview.group_image_uri) || igSafeUrl(preview.creator && preview.creator.profile_picture && preview.creator.profile_picture.uri),
      members: Number.isFinite(preview.number_of_members) ? preview.number_of_members : null,
      items,
    };
  }
  return null;
}

// --- vykreslení ----------------------------------------------------------------

export const IG_CHANNEL_CSS = `
#${IG_CHANNEL_PANEL_ID}{all:initial;position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;
  box-sizing:border-box;font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:#fff;color:#18181b}
#${IG_CHANNEL_PANEL_ID} *{all:revert;font-family:inherit;box-sizing:border-box}
#${IG_CHANNEL_PANEL_ID} .ns-head{display:flex;align-items:center;gap:12px;padding:10px 12px;
  padding-top:max(10px,env(safe-area-inset-top));border-bottom:1px solid #e4e4e7}
#${IG_CHANNEL_PANEL_ID} .ns-back{border:0;background:none;color:inherit;font-size:26px;line-height:1;padding:4px 8px;cursor:pointer}
#${IG_CHANNEL_PANEL_ID} .ns-head-text{min-width:0;flex:1}
#${IG_CHANNEL_PANEL_ID} .ns-toggle{border:1px solid currentColor;border-radius:8px;background:none;color:inherit;
  font-size:13px;padding:6px 10px;cursor:pointer;white-space:nowrap}
#${IG_CHANNEL_PANEL_ID} .ns-title{margin:0;font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${IG_CHANNEL_PANEL_ID} .ns-sub{margin:0;font-size:13px;color:#71717a}
#${IG_CHANNEL_PANEL_ID} .ns-list{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
  padding:12px 12px max(24px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px}
#${IG_CHANNEL_PANEL_ID} .ns-msg{max-width:90%;align-self:flex-start;background:#f4f4f5;border-radius:16px;padding:8px 12px}
#${IG_CHANNEL_PANEL_ID} .ns-meta{margin:0 0 2px;font-size:12px;color:#71717a}
#${IG_CHANNEL_PANEL_ID} .ns-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
#${IG_CHANNEL_PANEL_ID} .ns-action{align-self:center;max-width:none;background:none;text-align:center;font-size:13px;color:#71717a}
#${IG_CHANNEL_PANEL_ID} .ns-note{align-self:center;font-size:13px;color:#71717a;text-align:center;margin:4px 0 0}
#${IG_CHANNEL_PANEL_ID} img,#${IG_CHANNEL_PANEL_ID} video{display:block;max-width:100%;max-height:70vh;border-radius:12px;margin-top:6px}
#${IG_CHANNEL_PANEL_ID} a{color:#2563eb;overflow-wrap:anywhere}
#${IG_CHANNEL_PANEL_ID} .ns-card{display:block;margin-top:6px;padding:8px;border-radius:12px;background:#fff;text-decoration:none;color:inherit}
#${IG_CHANNEL_PANEL_ID} .ns-card-title{margin:0;font-weight:600}
#${IG_CHANNEL_PANEL_ID} .ns-card-text{margin:2px 0 0;font-size:13px;color:#52525b}
@media (prefers-color-scheme: dark){
  #${IG_CHANNEL_PANEL_ID}{background:#000;color:#f4f4f5}
  #${IG_CHANNEL_PANEL_ID} .ns-head{border-color:#27272a}
  #${IG_CHANNEL_PANEL_ID} .ns-msg{background:#27272a}
  #${IG_CHANNEL_PANEL_ID} .ns-action{background:none}
  #${IG_CHANNEL_PANEL_ID} .ns-card{background:#18181b}
  #${IG_CHANNEL_PANEL_ID} .ns-card-text{color:#a1a1aa}
  #${IG_CHANNEL_PANEL_ID} a{color:#60a5fa}
}`;

const IG_TYPE_LABELS = {
  VOICE_MEDIA: 'Hlasová zpráva',
  ANIMATED_MEDIA: 'GIF',
  CLIP: 'Reel',
  STORY_SHARE: 'Příběh',
  POLL: 'Anketa',
};

function el(doc, tag, className, text) {
  const e = doc.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function igFormatTime(date) {
  if (!date) return '';
  try {
    return date.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return date.toISOString();
  }
}

function igExternalLink(doc, href, text, className) {
  const a = el(doc, 'a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function igRenderItem(doc, item) {
  if (item.type === 'ACTION_LOG') return el(doc, 'p', 'ns-msg ns-action', item.action || 'Změna v kanálu');
  const box = el(doc, 'div', 'ns-msg');
  box.dataset.type = item.type;
  const meta = [item.sender, igFormatTime(item.time)].filter(Boolean).join(' · ');
  if (meta) box.append(el(doc, 'p', 'ns-meta', meta));
  if (item.text) box.append(el(doc, 'p', 'ns-text', item.text));

  if (item.link && item.link.url) {
    const card = igExternalLink(doc, item.link.url, '', 'ns-card');
    if (item.link.image) {
      const img = el(doc, 'img');
      img.src = item.link.image;
      img.alt = '';
      img.loading = 'lazy';
      card.append(img);
    }
    card.append(el(doc, 'p', 'ns-card-title', item.link.title || item.link.url));
    if (item.link.summary) card.append(el(doc, 'p', 'ns-card-text', item.link.summary));
    box.append(card);
  }

  for (const m of item.media) {
    if (m.video) {
      const v = el(doc, 'video');
      v.controls = true;
      v.preload = 'none';
      v.setAttribute('playsinline', '');
      if (m.image) v.poster = m.image;
      v.src = m.video;
      box.append(v);
    } else if (m.image) {
      const img = el(doc, 'img');
      img.src = m.image;
      img.alt = '';
      img.loading = 'lazy';
      box.append(img);
    }
  }

  if (item.share) {
    const card = item.share.href ? el(doc, 'a', 'ns-card') : el(doc, 'div', 'ns-card');
    if (item.share.href) card.href = item.share.href;
    if (item.share.image) {
      const img = el(doc, 'img');
      img.src = item.share.image;
      img.alt = '';
      img.loading = 'lazy';
      card.append(img);
    }
    card.append(el(doc, 'p', 'ns-card-title', item.share.kind + (item.share.author ? ' od @' + item.share.author : '')));
    if (item.share.caption) card.append(el(doc, 'p', 'ns-card-text', item.share.caption));
    box.append(card);
  }

  const empty = !item.text && !item.link && !item.media.length && !item.share;
  if (empty) {
    const label = IG_TYPE_LABELS[item.type] || 'Zpráva typu ' + (item.type || '?');
    box.append(el(doc, 'p', 'ns-text', label + ' – zobrazí se jen v aplikaci.'));
  }
  return box;
}

function igBuildPanel(doc, data, opts = {}) {
  const panel = el(doc, 'div');
  panel.id = IG_CHANNEL_PANEL_ID;
  const head = el(doc, 'div', 'ns-head');
  const back = el(doc, 'button', 'ns-back', '‹');
  back.type = 'button';
  back.setAttribute('aria-label', 'Zpět');
  back.addEventListener('click', () => {
    const win = doc.defaultView;
    if (win.history.length > 1) win.history.back();
    else win.location.assign('/direct/inbox/');
  });
  const headText = el(doc, 'div', 'ns-head-text');
  headText.append(el(doc, 'p', 'ns-title', data.title || 'Kanál'));
  const sub = [data.members != null ? data.members + ' členů' : '', 'jen čtení'].filter(Boolean).join(' · ');
  headText.append(el(doc, 'p', 'ns-sub', sub));
  head.append(back, headText);
  if (opts.toggle) head.append(opts.toggle);

  const list = el(doc, 'div', 'ns-list');
  for (const item of data.items) list.append(igRenderItem(doc, item));
  list.append(
    el(
      doc,
      'p',
      'ns-note',
      `Posledních ${data.items.length} zpráv – víc web nedostane. Odpovídat a reagovat jde jen v aplikaci.`,
    ),
  );
  panel.append(head, list);
  return panel;
}

// Zobrazí/skryje panel podle aktuální URL a uložených dat. Volá se po přijetí dat i při každé dávce mutací.
export function igChannelSync(doc, state, now = Date.now()) {
  const path = doc.defaultView.location.pathname;
  if (state.channelPath !== path) {
    state.channelPath = path;
    // Po navigaci platí jen čerstvá data (k novému kanálu), jinak by se ukázal předchozí.
    if (state.channel && now - state.channel.at > IG_CHANNEL_PREFETCH_MS) state.channel = null;
  }
  const onChannel = igIsChannelPath(path);
  let panel = doc.getElementById(IG_CHANNEL_PANEL_ID);
  if (!onChannel || !state.channel) {
    if (panel) panel.remove();
    return;
  }
  if (panel && panel.dataset.key !== state.channel.key) {
    panel.remove();
    panel = null;
  }
  if (!panel) {
    const code = igChannelCodeFromPath(path);
    const toggle = state.channelList && code ? igChannelToggle(doc, state, code, state.channel.data, now) : null;
    panel = igBuildPanel(doc, state.channel.data, { toggle });
    panel.dataset.key = state.channel.key;
    logInfo('kanál: zobrazeno', state.channel.data.items.length, 'zpráv');
  }
  // Do <html> (vedle <body>), aby panel nesmazal React při překreslení stránky.
  if (!panel.isConnected) doc.documentElement.appendChild(panel);
}

// Zapamatuje otevřený kanál (pokud ho uživatel neodebral) a vrátí tlačítko Odebrat/Přidat do zpráv.
function igChannelToggle(doc, state, code, data, now) {
  const win = doc.defaultView;
  const store = igLoadChannels(win);
  const known = store.channels[code];
  if (!known || !known.hidden) {
    igRememberChannel(store, data, { code, now, opened: true });
    igSaveChannels(win, store);
  }
  const btn = el(doc, 'button', 'ns-toggle');
  btn.type = 'button';
  const label = () => {
    const c = igLoadChannels(win).channels[code];
    btn.textContent = c && !c.hidden ? 'Odebrat ze zpráv' : 'Přidat do zpráv';
  };
  label();
  btn.addEventListener('click', () => {
    const st = igLoadChannels(win);
    const c = st.channels[code] || igRememberChannel(st, data, { code, now: Date.now(), opened: true });
    c.hidden = !c.hidden;
    igSaveChannels(win, st);
    logInfo('kanál', code, c.hidden ? 'odebrán ze zpráv' : 'přidán do zpráv');
    label();
  });
  return btn;
}

// Seznam chatů: řádky kanálů + obnova jejich dat (nejvýš jednou za IG_CHANNEL_REFRESH_MS).
export function igChannelListSync(doc, state, now = Date.now()) {
  if (!state.channelList) return;
  const win = doc.defaultView;
  if (!/^\/direct(?:\/|$)/.test(win.location.pathname)) return;
  const store = igLoadChannels(win);
  igSyncChannelRows(doc, igVisibleChannels(store), now);
  if (!store.docId) return; // doc_id se dozví až při prvním otevření kanálu
  state.refreshAsked = state.refreshAsked || {};
  const due = igChannelsToRefresh(store, now).filter((c) => !(state.refreshAsked[c.code] && now - state.refreshAsked[c.code] < IG_CHANNEL_REFRESH_MS));
  if (!due.length) return;
  for (const c of due) state.refreshAsked[c.code] = now;
  logInfo('obnova kanálů:', due.map((c) => c.code).join(', '));
  doc.dispatchEvent(
    new win.CustomEvent(IG_CHANNEL_HOOK.refresh, { detail: JSON.stringify({ docId: store.docId, threadIds: due.map((c) => c.threadId) }) }),
  );
}

// Odpověď obnovy z hooku → aktualizovat uložený kanál a řádek v seznamu.
export function igChannelRefreshed(doc, state, text, now = Date.now()) {
  const data = igParseChannelResponse(text);
  if (!data) return false;
  const win = doc.defaultView;
  const store = igLoadChannels(win);
  if (!igRememberChannel(store, data, { now })) return false;
  igSaveChannels(win, store);
  igChannelListSync(doc, state, now);
  return true;
}

// Přijme odpověď z hooku (detail = text odpovědi) a uloží ji do stavu.
export function igChannelReceive(doc, state, text, now = Date.now()) {
  const data = igParseChannelResponse(text);
  if (!data) return false;
  state.channel = { key: data.threadId + ':' + data.items.map((i) => i.id).join(','), data, at: now };
  igChannelSync(doc, state, now);
  return true;
}

export function igChannelInit(win, state, { list = false } = {}) {
  const doc = win.document;
  state.channelList = list;
  const on = (name, fn) =>
    doc.addEventListener(name, (e) => {
      try {
        if (typeof e.detail === 'string') fn(e.detail);
      } catch (err) {
        logError('instagram.channel', err);
      }
    });
  on(IG_CHANNEL_HOOK.data, (text) => igChannelReceive(doc, state, text));
  if (list) {
    on(IG_CHANNEL_HOOK.docId, (docId) => {
      if (!/^\d+$/.test(docId)) return;
      const store = igLoadChannels(win);
      if (store.docId === docId) return;
      store.docId = docId;
      igSaveChannels(win, store);
    });
    on(IG_CHANNEL_HOOK.refreshed, (text) => igChannelRefreshed(doc, state, text));
  }
  igInstallPageHook(doc);
}
