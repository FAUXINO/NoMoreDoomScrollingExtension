// Práce s textem (popisky v UI – podporujeme češtinu i angličtinu).

export function normText(s) {
  return (s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function labelSet(labels) {
  return new Set(labels.map(normText));
}

const LABEL_SELECTOR = 'span, h1, h2, h3, h4, [role="heading"]';
const MAX_LABEL_LENGTH = 60;

// Najde elementy, jejichž celý text přesně odpovídá některému z popisků.
// Hledá jen v krátkých textech (nadpisy, štítky), ne v obsahu příspěvků.
export function findLabelElements(root, labels, selector = LABEL_SELECTOR) {
  const out = [];
  if (!root || root.nodeType !== 1) return out;
  const check = (el) => {
    const t = el.textContent;
    if (t && t.length <= MAX_LABEL_LENGTH && labels.has(normText(t))) out.push(el);
  };
  if (root.matches(selector)) check(root);
  for (const el of root.querySelectorAll(selector)) check(el);
  return out;
}
