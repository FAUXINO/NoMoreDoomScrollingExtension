// Instagram: kanály v seznamu chatů – úložiště, řazení podle času, řádky jako klon řádku Instagramu.
// Data jsou vymyšlená.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import {
  igParseRelativeTime,
  igFormatShortTime,
  igRememberChannel,
  igVisibleChannels,
  igChannelsToRefresh,
  igSyncChannelRows,
  igFindInboxList,
  igLoadChannels,
  igSaveChannels,
  igChannelCodeFromPath,
  IG_CHANNEL_REFRESH_MS,
} from '../src/sites/instagram-channel-list.js';
import { igChannelReceive, igChannelRefreshed, igChannelListSync } from '../src/sites/instagram-channel.js';
import { ROOT } from './helpers.mjs';

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);
const H = 3600000;

test('seznam kanálů: relativní čas EN/CZ', () => {
  assert.equal(igParseRelativeTime('14 minutes ago', NOW), NOW - 14 * 60000);
  assert.equal(igParseRelativeTime('a day ago', NOW), NOW - 24 * H);
  assert.equal(igParseRelativeTime('an hour ago', NOW), NOW - H);
  assert.equal(igParseRelativeTime('2 weeks ago', NOW), NOW - 14 * 24 * H);
  assert.equal(igParseRelativeTime('3 months ago', NOW), NOW - 90 * 24 * H);
  assert.equal(igParseRelativeTime('před 2 dny', NOW), NOW - 48 * H);
  assert.equal(igParseRelativeTime('před minutou', NOW), NOW - 60000);
  assert.equal(igParseRelativeTime('před 3 hodinami', NOW), NOW - 3 * H);
  assert.equal(igParseRelativeTime('14m', NOW), NOW - 14 * 60000);
  assert.equal(igParseRelativeTime('1d', NOW), NOW - 24 * H);
  assert.equal(igParseRelativeTime('2w', NOW), NOW - 14 * 24 * H);
  assert.equal(igParseRelativeTime('just now', NOW), NOW);
  assert.equal(igParseRelativeTime('', NOW), null);
  assert.equal(igParseRelativeTime('Active', NOW), null);
  assert.equal(igFormatShortTime(NOW - 5 * H, NOW), '5h');
  assert.equal(igFormatShortTime(NOW - 5 * H, NOW, true), '5 h');
  assert.equal(igFormatShortTime(NOW - 20 * 24 * H, NOW), '2w');
});

test('seznam kanálů: kód kanálu z URL', () => {
  assert.equal(igChannelCodeFromPath('/channel/Abc_12-3/'), 'Abc_12-3');
  assert.equal(igChannelCodeFromPath('/channel/'), null);
  assert.equal(igChannelCodeFromPath('/direct/inbox/'), null);
});

const parsed = (threadId, lastIso, extra = {}) => ({
  threadId,
  title: 'Kanál ' + threadId,
  image: 'https://x.fbcdn.net/' + threadId + '.jpg',
  members: 5,
  items: [{ id: 'm', type: 'TEXT', time: new Date(lastIso), sender: 'kamarad', text: 'Nová zpráva  na\ndva řádky', media: [], link: null, share: null, action: null }],
  ...extra,
});

test('seznam kanálů: zapamatování, obnova podle threadId, odebrání', () => {
  const store = { version: 1, docId: null, channels: {} };
  const a = igRememberChannel(store, parsed('111', '2026-11-21T10:00:00Z'), { code: 'AAA', now: NOW, opened: true });
  assert.equal(a.lastText, 'Nová zpráva na dva řádky');
  assert.equal(a.lastTime, Date.parse('2026-11-21T10:00:00Z'));
  assert.equal(igRememberChannel(store, parsed('999', '2026-11-21T10:00:00Z'), { now: NOW }), null, 'neznámý kanál z obnovy se nepřidá');

  igRememberChannel(store, parsed('222', '2026-11-20T10:00:00Z'), { code: 'BBB', now: NOW });
  assert.deepEqual(igVisibleChannels(store).map((c) => c.code), ['AAA', 'BBB'], 'nejnovější první');

  igRememberChannel(store, parsed('222', '2026-11-21T11:00:00Z'), { now: NOW });
  assert.deepEqual(igVisibleChannels(store).map((c) => c.code), ['BBB', 'AAA'], 'obnova posune kanál nahoru');

  assert.deepEqual(igChannelsToRefresh(store, NOW + 1000), [], 'čerstvé kanály se neobnovují');
  assert.equal(igChannelsToRefresh(store, NOW + IG_CHANNEL_REFRESH_MS + 1).length, 2);

  store.channels.AAA.hidden = true;
  assert.deepEqual(igVisibleChannels(store).map((c) => c.code), ['BBB']);
});

// Kostra seznamu chatů podle snapshotu mobilního webu (2026-11): řádky jsou div[role=button]
// bez odkazů, čas v <abbr aria-label="… ago">, nahoře lišta poznámek (ul > li).
function row(id, name, label, short, { pinned = false } = {}) {
  const time = label ? `<span dir="auto"><span><abbr aria-label="${label}"><span>${short}</span></abbr></span></span>` : '';
  return `<div id="${id}"><div><div style="opacity: 1;"><div role="button" tabindex="0"><div>
    <span style="height: 56px; width: 56px;"><img src="https://x.fbcdn.net/${id}.jpg" srcset="https://x.fbcdn.net/${id}.jpg 2x"></span>
    <div><span dir="auto"><span>${name}</span></span>${pinned ? '<svg role="img" aria-label="Pinned"><title>Pinned</title></svg>' : ''}
    <div><span dir="auto"><span>${label ? 'kamarad poslal video.' : 'Active 1m ago'}</span></span>${label ? '<span aria-hidden="true">·</span>' : ''}${time}</div></div>
  </div></div></div></div></div>`;
}

const INBOX = `<!doctype html><html lang="en"><body><div data-pagelet="IGDInboxThreadListScrollableAreaPagelet"><div>
  <ul><li><div role="button"><img src="https://x.fbcdn.net/n1.jpg"></div></li><li><div role="button"><img src="https://x.fbcdn.net/n2.jpg"></div></li></ul>
  <div id="list">
    ${row('A', 'kamarad', '14 minutes ago', '14m', { pinned: true })}
    ${row('B', 'nekdo', '2 hours ago', '2h')}
    ${row('C', 'kamaradka', null)}
    ${row('D', 'skupina', 'a day ago', '1d')}
    ${row('E', 'nekdo jiny', '2 weeks ago', '2w')}
    <div class="placeholder"></div>
    <div><div role="button" aria-label="Loading..."></div></div>
  </div>
</div></div></body></html>`;

const chan = (code, hoursAgo, extra = {}) => ({ code, threadId: code.length + '1', title: 'Kanál ' + code, image: null, lastText: 'Ahoj ' + code, lastTime: NOW - hoursAgo * H, ...extra });
const order = (doc) => [...doc.getElementById('list').children].map((c) => c.getAttribute('data-noshorts-channel-row') || c.id || c.className || '?');

test('seznam kanálů: najde seznam konverzací (bez lišty poznámek)', () => {
  const doc = new JSDOM(INBOX).window.document;
  const list = igFindInboxList(doc);
  assert.equal(list.container.id, 'list');
  assert.deepEqual(list.rows.map((r) => r.id), ['A', 'B', 'C', 'D', 'E']);
});

test('seznam kanálů: řádky mezi konverzacemi podle času (připnuté a bez času se přeskočí)', () => {
  const doc = new JSDOM(INBOX).window.document;
  const channels = [chan('NOVY', 0.02), chan('PET', 5), chan('STARY', 24 * 30)];
  assert.equal(igSyncChannelRows(doc, channels, NOW), 3);
  assert.deepEqual(order(doc), ['A', 'NOVY', 'B', 'C', 'PET', 'D', 'E', 'STARY', 'placeholder', '?']);
});

test('seznam kanálů: řádek vypadá jako řádek Instagramu (klon), obsah je z kanálu', () => {
  const doc = new JSDOM(INBOX).window.document;
  igSyncChannelRows(doc, [chan('PET', 5, { image: 'https://x.fbcdn.net/kanal.jpg', lastText: '<b>tučně</b>' })], NOW);
  const r = doc.querySelector('[data-noshorts-channel-row="PET"]');
  const tpl = doc.getElementById('B');
  assert.equal(r.querySelectorAll('*').length, tpl.querySelectorAll('*').length, 'stejná struktura jako šablona');
  assert.equal(r.querySelector('img').getAttribute('src'), 'https://x.fbcdn.net/kanal.jpg');
  assert.equal(r.querySelector('img').hasAttribute('srcset'), false);
  const texts = [...r.querySelectorAll('span[dir="auto"]')].map((s) => s.textContent);
  assert.equal(texts[0], 'Kanál PET');
  assert.equal(texts[1], '<b>tučně</b>', 'text zprávy jako text');
  assert.equal(r.querySelector('b'), null);
  assert.equal(r.querySelector('abbr').textContent, '5h');
  assert.equal(r.querySelector('svg[aria-label="Pinned"]'), null);
  assert.equal(r.querySelector('[id]'), null, 'žádná duplicitní id');
  assert.match(r.querySelector('[role="button"]').getAttribute('aria-label'), /Kanál PET/);
});

test('seznam kanálů: bez fotky písmeno, idempotentní, po smazání Reactem se vrátí, odebraný zmizí', async () => {
  const win = new JSDOM(INBOX).window;
  const doc = win.document;
  const channels = [chan('PET', 5)];
  igSyncChannelRows(doc, channels, NOW);
  assert.match(doc.querySelector('[data-noshorts-channel-row="PET"] img').getAttribute('src'), /^data:image\/svg\+xml,/);

  const records = [];
  const mo = new win.MutationObserver((r) => records.push(...r));
  mo.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true });
  igSyncChannelRows(doc, channels, NOW);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(records.length, 0, 'druhé volání nemění DOM');
  mo.disconnect();

  doc.querySelector('[data-noshorts-channel-row="PET"]').remove(); // React překreslil seznam
  doc.getElementById('list').append(doc.getElementById('B')); // a přeskládal řádky
  igSyncChannelRows(doc, channels, NOW);
  const o = order(doc);
  assert.ok(o.indexOf('PET') === o.indexOf('D') - 1, 'kanál zase před řádkem se starším časem');

  igSyncChannelRows(doc, [], NOW);
  assert.equal(doc.querySelector('[data-noshorts-channel-row]'), null);
});

test('seznam kanálů: otevřený kanál se zapamatuje, tlačítko v panelu ho odebere a vrátí', () => {
  const RESP = JSON.stringify({ data: { x: { channel_preview: { thread_igid: '777', title: 'Kanál', group_image_uri: 'https://x.fbcdn.net/g.jpg', number_of_members: 3,
    items: [{ item_type: 'TEXT', message_id: 'm1', timestamp: String((NOW - H) * 1000), text: 'Ahoj', sender: { username: 'kamarad' }, full_item_dict: '{}' }] } } } });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.instagram.com/channel/KOD123/' });
  const win = dom.window;
  const state = { channelList: true };
  igChannelReceive(win.document, state, RESP, NOW);
  const saved = igLoadChannels(win).channels.KOD123;
  assert.equal(saved.threadId, '777');
  assert.equal(saved.image, 'https://x.fbcdn.net/g.jpg');
  assert.equal(saved.lastText, 'Ahoj');

  const btn = win.document.querySelector('#noshorts-ig-channel .ns-toggle');
  assert.equal(btn.textContent, 'Odebrat ze zpráv');
  btn.click();
  assert.equal(igLoadChannels(win).channels.KOD123.hidden, true);
  assert.equal(btn.textContent, 'Přidat do zpráv');
  btn.click();
  assert.equal(igLoadChannels(win).channels.KOD123.hidden, false);
  dom.window.close();
});

test('seznam kanálů: v seznamu chatů požádá hook o obnovu (1× za 10 min) a odpověď promítne do řádku', () => {
  const dom = new JSDOM(INBOX, { url: 'https://www.instagram.com/direct/inbox/' });
  const win = dom.window;
  const doc = win.document;
  igSaveChannels(win, { version: 1, docId: '999', channels: { PET: { ...chan('PET', 5), threadId: '555', refreshedAt: NOW - IG_CHANNEL_REFRESH_MS - 1 } } });
  const asked = [];
  doc.addEventListener('noshorts-ig-channel-refresh', (e) => asked.push(JSON.parse(e.detail)));
  const state = { channelList: true };
  igChannelListSync(doc, state, NOW);
  igChannelListSync(doc, state, NOW + 1000);
  assert.deepEqual(asked, [{ docId: '999', threadIds: ['555'] }], 'jen jednou');
  assert.ok(doc.querySelector('[data-noshorts-channel-row="PET"]'));

  const RESP = JSON.stringify({ data: { x: { channel_preview: { thread_igid: '555', title: 'Kanál PET', items: [
    { item_type: 'TEXT', message_id: 'm9', timestamp: String((NOW - 60000) * 1000), text: 'Čerstvá zpráva', sender: {}, full_item_dict: '{}' }] } } } });
  assert.ok(igChannelRefreshed(doc, state, RESP, NOW));
  const r = doc.querySelector('[data-noshorts-channel-row="PET"]');
  assert.equal([...r.querySelectorAll('span[dir="auto"]')][1].textContent, 'Čerstvá zpráva');
  assert.deepEqual(order(doc).slice(0, 3), ['A', 'PET', 'B'], 'kanál se posunul nahoru');
  dom.window.close();
});

test('seznam kanálů: bez doc_id (kanál ještě nebyl otevřen po aktualizaci) se nic neposílá', () => {
  const dom = new JSDOM(INBOX, { url: 'https://www.instagram.com/direct/inbox/' });
  const win = dom.window;
  igSaveChannels(win, { version: 1, docId: null, channels: { PET: { ...chan('PET', 5), threadId: '555' } } });
  let asked = 0;
  win.document.addEventListener('noshorts-ig-channel-refresh', () => asked++);
  igChannelListSync(win.document, { channelList: true }, NOW);
  assert.equal(asked, 0);
  assert.ok(win.document.querySelector('[data-noshorts-channel-row="PET"]'), 'řádek z uložených dat je vidět i tak');
  dom.window.close();
});

const REAL_INBOX = join(ROOT, 'fixtures', 'instagram', 'direct-inbox.html');
test('seznam kanálů: skutečný snapshot seznamu chatů', { skip: !existsSync(REAL_INBOX) && 'chybí fixtures/instagram/direct-inbox.html' }, () => {
  const doc = new JSDOM(readFileSync(REAL_INBOX, 'utf8')).window.document;
  const list = igFindInboxList(doc);
  assert.ok(list, 'seznam konverzací nalezen');
  assert.ok(list.rows.length >= 2);
  assert.ok(!list.rows.some((r) => r.closest('ul')), 'bez lišty poznámek');
  igSyncChannelRows(doc, [{ code: 'TEST', threadId: '1', title: 'Testovací kanál', image: 'https://x.fbcdn.net/k.jpg', lastText: 'Ahoj', lastTime: Date.now() - 5 * H }]);
  const r = doc.querySelector('[data-noshorts-channel-row="TEST"]');
  assert.ok(r);
  assert.equal(r.parentElement, list.container);
  assert.match(r.textContent, /Testovací kanál/);
  assert.match(r.textContent, /Ahoj/);
  assert.equal(r.querySelector('img').getAttribute('src'), 'https://x.fbcdn.net/k.jpg');
  assert.ok(r.querySelector('[role="button"]'));
  // Před kanálem žádný nepřipnutý řádek s časem starším než 5 h.
  for (let p = r.previousElementSibling; p; p = p.previousElementSibling) {
    const abbr = p.querySelector('abbr[aria-label]');
    if (!abbr || p.querySelector('svg[aria-label="Pinned"]')) continue;
    assert.ok(!/day|week|month|year/.test(abbr.getAttribute('aria-label')), 'starší řádek před kanálem');
  }
});
