// Skrývání elementů a hledání kontejnerů (příspěvek ve feedu apod.).
import { logInfo, describeEl } from './log.js';

export const HIDDEN_ATTR = 'data-noshorts-hidden';
export const BASE_CSS = '[' + HIDDEN_ATTR + ']{display:none!important}';

// Skryje element a zapíše důvod do atributu (vidět v inspektoru i v debug logu).
export function hideEl(el, reason) {
  if (!el || el.nodeType !== 1 || el.hasAttribute(HIDDEN_ATTR)) return false;
  if (el === el.ownerDocument.documentElement || el === el.ownerDocument.body) return false;
  el.setAttribute(HIDDEN_ATTR, reason);
  logInfo('skryto:', reason, describeEl(el));
  return true;
}

export function isHiddenByScript(el) {
  return !!el.closest('[' + HIDDEN_ATTR + ']');
}

// Aplikuje statická pravidla i přes JS (pro debug log a testy; vizuálně je skryje už CSS).
export function applyRules(root, rules, hide) {
  if (!root || root.nodeType !== 1) return;
  for (const rule of rules) {
    try {
      if (root.matches(rule.css)) hide(root, rule.reason);
      for (const el of root.querySelectorAll(rule.css)) hide(el, rule.reason);
    } catch (e) {
      // Nepodporovaný selektor (např. :has() ve starém prohlížeči) – přeskočit.
    }
  }
}

const STOP_SELECTOR = 'html, body, main, nav, [role="main"], [role="navigation"], [role="banner"]';

// Najde „jednotku“ (příspěvek) obsahující el:
// 1) nejbližší předek odpovídající unitSel,
// 2) jinak přímý potomek kontejneru feedu (feedSel).
// Pokud nic nenajde, vrátí null (raději nic neskrýt než skrýt půl stránky).
export function findUnit(el, { unitSel, feedSel, maxUp = 40 }) {
  if (unitSel) {
    const unit = el.closest(unitSel);
    if (unit) return unit;
  }
  if (!feedSel) return null;
  let cur = el;
  for (let i = 0; cur && i < maxUp; i++) {
    const parent = cur.parentElement;
    if (!parent) return null;
    if (parent.matches(feedSel)) return cur;
    if (parent.matches(STOP_SELECTOR)) return null;
    cur = parent;
  }
  return null;
}

// Vystoupá od el nahoru až těsně pod předka, který obsahuje `boundarySel`
// (např. 'article' – tedy blok vedle příspěvků ve feedu). Pokud takový předek
// do maxUp úrovní neexistuje, vrátí null (konzervativní – nic neskrýt).
export function climbBelow(el, boundarySel, maxUp = 8) {
  let cur = el;
  for (let i = 0; i < maxUp; i++) {
    const parent = cur.parentElement;
    if (!parent || parent.matches(STOP_SELECTOR)) return null;
    if (parent.querySelector(boundarySel)) return cur === el ? null : cur;
    cur = parent;
  }
  return null;
}

// Vrátí „větev“ elementu el vzhledem k anchor: potomka nejbližšího společného předka,
// který obsahuje el (ne anchor). Typicky sousední položka seznamu (další reel ve vieweru).
export function siblingBranch(anchor, el) {
  if (!anchor || !el || anchor === el || anchor.contains(el) || el.contains(anchor)) return null;
  let cur = el;
  while (cur.parentElement && !cur.parentElement.contains(anchor)) cur = cur.parentElement;
  return cur.parentElement ? cur : null;
}

export function unhideEl(el) {
  if (el && el.removeAttribute) el.removeAttribute(HIDDEN_ATTR);
}

// Je element v navigaci / liště záložek? (tam nechceme skrývat celé „jednotky“)
export function inNavigation(el) {
  return !!el.closest('nav, [role="navigation"], [role="tablist"], [role="banner"]');
}
