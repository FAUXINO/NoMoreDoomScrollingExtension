// Debug logování. Zapíná se přes CONFIG.debug.
let DEBUG = false;

export function setDebug(value) {
  DEBUG = !!value;
}

export function isDebug() {
  return DEBUG;
}

export function logInfo(...args) {
  if (DEBUG) console.info('[no-shorts]', ...args);
}

export function logError(where, err) {
  console.error('[no-shorts] chyba v', where, err);
}

// Krátký popis elementu pro log: tag, aria-label, href.
export function describeEl(el) {
  if (!el || el.nodeType !== 1) return String(el);
  let s = '<' + el.tagName.toLowerCase();
  const label = el.getAttribute('aria-label');
  if (label) s += ' aria-label="' + label.slice(0, 40) + '"';
  const href = el.getAttribute('href');
  if (href) s += ' href="' + href.slice(0, 60) + '"';
  return s + '>';
}
