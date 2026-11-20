// Build: spojí moduly ze src/ do jednoho souboru no-shorts.user.js (+ no-shorts.meta.js).
// Bez závislostí. Pravidla pro zdrojáky: importy jen na jednom řádku, žádné default exporty,
// názvy top-level proměnných musí být napříč soubory unikátní (vše skončí v jedné funkci).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const CORE_ORDER = ['log.js', 'registry.js', 'text.js', 'dom.js', 'style.js', 'blockScreen.js', 'watch.js'];
const sitesDir = join(src, 'sites');
const siteFiles = (existsSync(sitesDir) ? readdirSync(sitesDir) : []).filter((f) => f.endsWith('.js')).sort();

const files = [
  'config.js',
  ...CORE_ORDER.map((f) => 'core/' + f),
  ...siteFiles.map((f) => 'sites/' + f),
  'main.js',
];

function strip(code, file) {
  const out = [];
  for (const line of code.split('\n')) {
    if (/^\s*import\s/.test(line)) {
      if (!/;\s*$/.test(line)) throw new Error(`${file}: víceřádkový import není podporovaný`);
      continue;
    }
    if (/^\s*export\s+default\b/.test(line)) throw new Error(`${file}: export default není podporovaný`);
    out.push(line.replace(/^export\s+/, ''));
  }
  return out.join('\n').trim();
}

const meta = readFileSync(join(src, 'meta.txt'), 'utf8').replace('{{version}}', pkg.version).trim();
const body = files.map((f) => `// ---- src/${f} ----\n` + strip(readFileSync(join(src, f), 'utf8'), f)).join('\n\n');

const script = `${meta}

(function () {
  'use strict';

${body
  .split('\n')
  .map((l) => (l ? '  ' + l : l))
  .join('\n')}

  boot(window);
})();
`;

writeFileSync(join(root, 'no-shorts.user.js'), script);
writeFileSync(join(root, 'no-shorts.meta.js'), meta + '\n');
console.log(`Hotovo: no-shorts.user.js v${pkg.version} (${files.length} modulů)`);
