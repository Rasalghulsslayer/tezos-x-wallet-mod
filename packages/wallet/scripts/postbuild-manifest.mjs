import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'dist/manifest.json';
const m = JSON.parse(readFileSync(PATH, 'utf8'));

if (m.web_accessible_resources) {
  console.log(
    '[postbuild] stripping web_accessible_resources injected by @crxjs ' +
    `(${m.web_accessible_resources.length} entries)`,
  );
  delete m.web_accessible_resources;
}

writeFileSync(PATH, JSON.stringify(m, null, 2) + '\n');
console.log('[postbuild] manifest.json sanitized');
