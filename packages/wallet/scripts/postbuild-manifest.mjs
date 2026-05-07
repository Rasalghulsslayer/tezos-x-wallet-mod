import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'dist/manifest.json';
const m = JSON.parse(readFileSync(PATH, 'utf8'));

if (Array.isArray(m.web_accessible_resources)) {
  const before = JSON.stringify(m.web_accessible_resources);
  m.web_accessible_resources = m.web_accessible_resources
    .map((entry) => ({
      ...entry,
      resources: (entry.resources ?? []).filter((r) => r !== '*' && !r.endsWith('.html')),
    }))
    .filter((entry) => entry.resources.length > 0);

  if (m.web_accessible_resources.length === 0) delete m.web_accessible_resources;
  if (JSON.stringify(m.web_accessible_resources ?? []) !== before) {
    console.log('[postbuild] sanitized web_accessible_resources (HTML pages stripped)');
  }
}

writeFileSync(PATH, JSON.stringify(m, null, 2) + '\n');
console.log('[postbuild] manifest.json sanitized');