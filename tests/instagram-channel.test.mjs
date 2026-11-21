// Instagram: čtení kanálu (/channel/…) z odpovědi PolarisChannelLinkRootQuery.
// Data jsou vymyšlená, struktura odpovídá skutečné odpovědi (HAR 2026-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  igParseChannelResponse,
  igChannelReceive,
  igChannelSync,
  igChannelPageHook,
  igIsChannelPath,
} from '../src/sites/instagram-channel.js';

const us = (iso) => String(new Date(iso).getTime() * 1000);
const sender = { username: 'kamarad', id: '1', full_name: 'Kamarád', profile_pic_url: 'https://x.fbcdn.net/p.jpg' };

function item(type, iso, full, text = null) {
  return {
    __typename: 'XFBIGDChannelPreviewItem',
    item_type: type,
    message_id: 'mid.' + type + iso,
    full_item_dict: JSON.stringify({ item_type: type, ...full }),
    timestamp: us(iso),
    user_igid: '1',
    text,
    sender,
    replied_to_user: null,
  };
}

// Pořadí jako ze serveru: nejnovější první.
const ITEMS = [
  item('LINK', '2026-11-20T10:00:00Z', {
    link: {
      text: 'https://example.com/stream',
      link_context: {
        link_url: 'https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fstream&e=abc',
        link_title: 'Stream',
        link_summary: 'Živě teď',
        link_image_url: 'https://external.fbcdn.net/obr.jpg',
      },
    },
  }),
  item('ACTION_LOG', '2026-11-19T10:00:00Z', { action_log: { description: 'nekdo se přidal ke kanálu' } }),
  item('TEXT', '2026-11-18T10:00:00Z', { text: '<img src=x onerror=alert(1)>' }, '<img src=x onerror=alert(1)>'),
  item('MEDIA_SHARE', '2026-11-17T10:00:00Z', {
    direct_media_share: {
      media: {
        code: 'ABC_123',
        product_type: 'feed',
        media_type: 1,
        user: { username: 'nekdo' },
        caption: { text: 'Popisek' },
        image_versions2: { candidates: [{ url: 'https://x.fbcdn.net/share.jpg' }] },
      },
    },
  }),
  item('MEDIA', '2026-11-16T10:00:00Z', {
    media: {
      media_type: 2,
      image_versions2: { candidates: [{ url: 'https://x.fbcdn.net/poster.jpg' }] },
      video_versions: [{ url: 'https://x.fbcdn.net/video.mp4' }],
    },
  }),
  item('MEDIA', '2026-11-15T10:00:00Z', {
    media: { media_type: 1, image_versions2: { candidates: [{ url: 'javascript:alert(1)' }, { url: 'https://x.fbcdn.net/foto.jpg' }] } },
  }),
  item('VOICE_MEDIA', '2026-11-14T10:00:00Z', {}),
  item('TEXT', '2026-11-13T10:00:00Z', { text: 'Ahoj všichni\ndruhý řádek' }, 'Ahoj všichni\ndruhý řádek'),
];

const RESPONSE = JSON.stringify({
  data: {
    xfb_igd_channel_web_preview: {
      channel_preview: {
        thread_igid: '123456',
        items: ITEMS,
        creator: { username: 'kamarad' },
        number_of_members: 42,
        title: 'Testovací kanál',
      },
    },
  },
  extensions: { is_final: true },
});

test('kanál: cesta /channel/KÓD/', () => {
  assert.ok(igIsChannelPath('/channel/AbcDef123/'));
  assert.ok(igIsChannelPath('/channel/AbcDef123'));
  assert.ok(!igIsChannelPath('/channel/'));
  assert.ok(!igIsChannelPath('/direct/inbox/'));
});

test('kanál: rozbor odpovědi – pořadí, typy, bezpečné URL', () => {
  const data = igParseChannelResponse(RESPONSE);
  assert.equal(data.title, 'Testovací kanál');
  assert.equal(data.members, 42);
  assert.equal(data.items.length, ITEMS.length);
  assert.deepEqual(
    data.items.map((i) => i.type),
    ['TEXT', 'VOICE_MEDIA', 'MEDIA', 'MEDIA', 'MEDIA_SHARE', 'TEXT', 'ACTION_LOG', 'LINK'],
    'od nejstarší po nejnovější',
  );
  const [first, voice, photo, video, share, , action, link] = data.items;
  assert.equal(first.text, 'Ahoj všichni\ndruhý řádek');
  assert.equal(first.sender, 'Kamarád');
  assert.equal(voice.media.length, 0);
  assert.deepEqual(photo.media, [{ image: 'https://x.fbcdn.net/foto.jpg', video: null }], 'javascript: URL se zahodí');
  assert.deepEqual(video.media, [{ image: 'https://x.fbcdn.net/poster.jpg', video: 'https://x.fbcdn.net/video.mp4' }]);
  assert.deepEqual(share.share, {
    href: '/p/ABC_123/',
    kind: 'Příspěvek',
    author: 'nekdo',
    caption: 'Popisek',
    image: 'https://x.fbcdn.net/share.jpg',
  });
  assert.equal(action.action, 'nekdo se přidal ke kanálu');
  assert.equal(link.text, 'https://example.com/stream');
  assert.equal(link.link.url, 'https://example.com/stream', 'přesměrování l.instagram.com se rozbalí');
});

test('kanál: odpověď s prefixem for (;;); a víc řádky; cizí odpověď = null', () => {
  const data = igParseChannelResponse('for (;;);{"data":{}}\n' + RESPONSE);
  assert.equal(data.items.length, ITEMS.length);
  assert.equal(igParseChannelResponse('{"data":{"user":{}}}'), null);
  assert.equal(igParseChannelResponse('channel_preview, ale ne JSON'), null);
});

function channelDom(path) {
  return new JSDOM('<!doctype html><html><head></head><body><main>Use the Instagram app</main></body></html>', {
    url: 'https://www.instagram.com' + path,
  });
}

test('kanál: panel se zprávami – text jako text (ne HTML), odkazy, video bez autoplay', () => {
  const dom = channelDom('/channel/AbcDef123/');
  const doc = dom.window.document;
  const state = {};
  assert.ok(igChannelReceive(doc, state, RESPONSE));
  const panel = doc.getElementById('noshorts-ig-channel');
  assert.ok(panel, 'panel je vidět');
  assert.equal(panel.parentElement, doc.documentElement);
  assert.match(panel.querySelector('.ns-title').textContent, /Testovací kanál/);
  assert.match(panel.querySelector('.ns-sub').textContent, /42 členů/);

  const msgs = [...panel.querySelectorAll('.ns-msg')];
  assert.equal(msgs.length, ITEMS.length);
  assert.equal(panel.querySelectorAll('img[src="x"]').length, 0, 'HTML ze zprávy se nevykreslí');
  assert.ok(panel.textContent.includes('<img src=x onerror=alert(1)>'));

  const link = panel.querySelector('[data-type="LINK"] a.ns-card');
  assert.equal(link.getAttribute('href'), 'https://example.com/stream');
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer');

  const video = panel.querySelector('video');
  assert.equal(video.getAttribute('src'), 'https://x.fbcdn.net/video.mp4');
  assert.ok(video.controls);
  assert.ok(!video.autoplay);

  assert.equal(panel.querySelector('[data-type="MEDIA_SHARE"] a').getAttribute('href'), '/p/ABC_123/');
  assert.match(panel.querySelector('[data-type="VOICE_MEDIA"]').textContent, /jen v aplikaci/);
  assert.match(panel.querySelector('.ns-note').textContent, /Posledních 8 zpráv/);
  dom.window.close();
});

test('kanál: odchod z kanálu panel odstraní, staré data se po navigaci nepoužijí', () => {
  const dom = channelDom('/channel/AbcDef123/');
  const doc = dom.window.document;
  const state = {};
  igChannelReceive(doc, state, RESPONSE, 1000);
  assert.ok(doc.getElementById('noshorts-ig-channel'));

  dom.window.history.pushState({}, '', '/direct/inbox/');
  igChannelSync(doc, state, 60000);
  assert.equal(doc.getElementById('noshorts-ig-channel'), null);
  assert.equal(state.channel, null);

  dom.window.history.pushState({}, '', '/channel/Jiny456/');
  igChannelSync(doc, state, 61000);
  assert.equal(doc.getElementById('noshorts-ig-channel'), null, 'jiný kanál bez dat = stránka Instagramu');
  dom.window.close();
});

test('kanál: data stažená těsně před navigací (po kliknutí) se použijí', () => {
  const dom = channelDom('/direct/t/1/');
  const doc = dom.window.document;
  const state = {};
  igChannelReceive(doc, state, RESPONSE, 1000);
  assert.equal(doc.getElementById('noshorts-ig-channel'), null, 've zprávách se panel neukáže');
  dom.window.history.pushState({}, '', '/channel/AbcDef123/');
  igChannelSync(doc, state, 2500);
  assert.ok(doc.getElementById('noshorts-ig-channel'));
  dom.window.close();
});

test('kanál: hook ve stránce pošle odpověď dotazu na kanál (XHR i fetch), jiné ne', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.instagram.com/direct/inbox/',
    runScripts: 'outside-only',
  });
  const win = dom.window;
  win.__resp = RESPONSE;
  win.eval(`
    class FakeXHR extends EventTarget {
      constructor() { super(); this.responseType = ''; this.responseText = ''; }
      send(body) { this.responseText = window.__resp; this.dispatchEvent(new Event('load')); }
    }
    window.XMLHttpRequest = FakeXHR;
    window.fetch = async () => ({ clone: () => ({ text: async () => window.__resp }) });
  `);
  win.eval(`(${igChannelPageHook.toString()})('ev-test', 'data-hook-test')`);
  win.eval(`(${igChannelPageHook.toString()})('ev-test', 'data-hook-test')`); // podruhé nic nepřebalí
  assert.ok(win.document.documentElement.hasAttribute('data-hook-test'));

  const got = [];
  win.document.addEventListener('ev-test', (e) => got.push(e.detail));
  const send = (body) => new win.XMLHttpRequest().send(body);

  send('fb_api_req_friendly_name=PolarisChannelLinkRootQuery&variables=%7B%7D');
  assert.equal(got.length, 1, 'XHR dotaz na kanál');
  assert.equal(got[0], RESPONSE);

  send('fb_api_req_friendly_name=PolarisFeedTimelineRootV2Query');
  assert.equal(got.length, 1, 'jiný dotaz se ignoruje');

  await win.fetch('/api/graphql', { body: new win.URLSearchParams('fb_api_req_friendly_name=PolarisChannelLinkRootQuery') });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(got.length, 2, 'fetch dotaz na kanál');
  win.close();
});
