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

// ── Content scripts must carry their own Buffer polyfill ─────────────────────
//
// A content script gets no `Buffer`: `shared/buffer-shim` is imported by the
// service worker and the two UI entry points, and `vite.config.ts` aliases the
// `buffer` MODULE without installing a global. Vendor code that reads a bare
// global `Buffer` — the Beacon SDK does so in 36 places — then throws a
// ReferenceError deep inside a promise chain that swallows it, and the feature
// wedges silently for the life of the page.
//
// THE UNIT SUITES CANNOT CATCH THIS. `vitest.config.ts` sets
// `environment: 'node'`, where `Buffer` is a global, so every such path passes
// by accident; and deleting the global to prove otherwise takes Vitest's own
// worker down with it. The build artifact is the only place the truth is
// visible, so the check lives here — where CI's `build-wallet` job runs it.

const USES_BUFFER   = /\bBuffer\s*\.\s*(?:from|concat|alloc|allocUnsafe|isBuffer)\b/;
const INSTALLS_BUFFER = /globalThis\s*\.\s*Buffer\s*=/;

/** Every chunk reachable from `entry`, following static, dynamic and Vite-preload edges. */
function reachableChunks(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name == null || seen.has(name)) continue;
    let source;
    try {
      source = readFileSync(`dist/${name}`, 'utf8');
    } catch {
      continue; // not an emitted chunk (an .html or a stale manifest entry)
    }
    seen.add(name);
    const edges = [
      ...source.matchAll(/from\s*["'`](\.\/[^"'`]+)["'`]/g),      // static
      ...source.matchAll(/import\(\s*["'`](\.\/[^"'`]+)["'`]\s*\)/g), // dynamic
      ...source.matchAll(/["'`](\.\/[^"'`]+\.js)["'`]/g),         // __vite__mapDeps
      ...source.matchAll(/getURL\(\s*["'`]([^"'`]+\.js)["'`]/g),  // crxjs loader
    ];
    const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
    for (const [, ref] of edges) {
      queue.push(ref.startsWith('./') ? dir + ref.slice(2) : ref);
    }
  }
  return seen;
}

const failures = [];
for (const entry of (m.content_scripts ?? []).flatMap((cs) => cs.js ?? [])) {
  const graph = [...reachableChunks(entry)].map((name) => ({
    name,
    source: readFileSync(`dist/${name}`, 'utf8'),
  }));
  const needs = graph.filter((c) => USES_BUFFER.test(c.source));
  if (needs.length === 0) continue;
  if (graph.some((c) => INSTALLS_BUFFER.test(c.source))) continue;
  failures.push(
    `  ${entry}\n` +
    `    reads a bare global Buffer in: ${needs.map((c) => c.name).join(', ')}\n` +
    `    but no chunk in its graph assigns globalThis.Buffer.`,
  );
}

if (failures.length > 0) {
  console.error(
    '[postbuild] FAIL — content script(s) read a global Buffer that will not exist:\n' +
    failures.join('\n') +
    "\n\n  Fix: add `import '@tezosx/wallet-core/shared/buffer-shim';` as the FIRST\n" +
    '  import of the module that pulls the Buffer-using dependency in. Put it in the\n' +
    '  lazily-imported module where there is one, so the polyfill stays out of the\n' +
    '  chunk that loads on every page.',
  );
  process.exit(1);
}
console.log(`[postbuild] content-script Buffer check passed (${(m.content_scripts ?? []).flatMap((cs) => cs.js ?? []).length} entries)`);