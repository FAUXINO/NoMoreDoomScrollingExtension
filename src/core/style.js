// Vložení CSS co nejdřív (document-start) a hlídání, aby ho stránka neodstranila.

export function rulesToCss(rules) {
  return rules.map((r) => r.css + '{display:none!important}').join('\n');
}

export function ensureStyle(doc, id, cssText) {
  let style = doc.getElementById(id);
  if (style && style.isConnected) return style;
  style = doc.createElement('style');
  style.id = id;
  style.textContent = cssText;
  // Na document-start ještě nemusí existovat <head> – pak rovnou do <html>.
  (doc.head || doc.documentElement).appendChild(style);
  return style;
}

const FLAGS_ATTR = 'data-noshorts';

// Příznaky stránky na <html> (např. "yt-home"), pro CSS typu html[data-noshorts~="yt-home"].
export function setPageFlags(doc, flags) {
  const html = doc.documentElement;
  const value = flags.join(' ');
  if (value) {
    if (html.getAttribute(FLAGS_ATTR) !== value) html.setAttribute(FLAGS_ATTR, value);
  } else if (html.hasAttribute(FLAGS_ATTR)) {
    html.removeAttribute(FLAGS_ATTR);
  }
}

export function flagSel(flag) {
  return 'html[' + FLAGS_ATTR + '~="' + flag + '"]';
}
