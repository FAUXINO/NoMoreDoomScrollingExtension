// Sledování změn URL (SPA) a nového obsahu (MutationObserver s omezením frekvence).
//
// Skript běží v izolovaném světě content scriptu (kvůli CSP Mety), takže nemůže
// přepsat history.pushState stránky. Změnu URL proto zjišťujeme:
//  - levným porovnáním location.href při každé dávce mutací (SPA navigace vždy mění DOM),
//  - událostmi popstate/hashchange,
//  - Navigation API (currententrychange), pokud ho prohlížeč má,
//  - krátce po kliknutí (navigace odkazem).
export function watchUrl(win, onChange) {
  let last = win.location.href;
  const check = () => {
    const now = win.location.href;
    if (now !== last) {
      last = now;
      onChange(now);
    }
  };
  win.addEventListener('popstate', check);
  win.addEventListener('hashchange', check);
  try {
    if (win.navigation && win.navigation.addEventListener) {
      win.navigation.addEventListener('currententrychange', check);
    }
  } catch (e) {
    /* Navigation API není k dispozici */
  }
  win.document.addEventListener('click', () => win.setTimeout(check, 60), true);
  return check;
}

const MAX_PENDING = 400;

// Sleduje přidané uzly a předává je dávkově (nejvýš jednou za `delay` ms).
// Když je stránka na pozadí (document.hidden), skenování se odkládá – šetří baterii.
export function watchMutations(win, { onMutation, onBatch, delay = 300 }) {
  const doc = win.document;
  let pending = new Set();
  let full = false;
  let timer = null;

  const flush = () => {
    timer = null;
    if (doc.hidden) return;
    const roots = full ? [doc.body || doc.documentElement] : [...pending];
    pending = new Set();
    full = false;
    onBatch(roots.filter((n) => n.isConnected));
  };
  const schedule = () => {
    if (!timer && !doc.hidden && (full || pending.size)) timer = win.setTimeout(flush, delay);
  };

  const mo = new win.MutationObserver((records) => {
    onMutation();
    if (!full) {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1) pending.add(n);
          else if (n.nodeType === 3 && n.parentElement) pending.add(n.parentElement);
        }
      }
      if (pending.size > MAX_PENDING) {
        full = true;
        pending = new Set();
      }
    }
    schedule();
  });
  mo.observe(doc.documentElement, { childList: true, subtree: true });
  doc.addEventListener('visibilitychange', schedule);
  return mo;
}
