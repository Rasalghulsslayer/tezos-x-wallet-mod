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

// ── Dead weight in content scripts ───────────────────────────────────────────
//
// Content scripts run on the user's pages, so anything reachable from one is
// weight the user pays for. Two dependencies of octez.connect are pure dApp-side
// baggage for a WALLET, and neither can be tree-shaken: no octez.connect package
// declares `sideEffects: false`, and the wallet package's barrel does
// `export * from '@tezos-x/octez.connect-transport-matrix'`.
//
// Together they were 145 kB of a 244 kB chunk. They are excluded by
// `src/shared/beacon/matrix-transport-stub.ts` and
// `src/shared/beacon/wallet-registry-stub.ts`, wired in `vite.config.ts` — and
// BOTH interventions are invisible to the type checker and to every unit suite,
// because they are resolution-time substitutions. A dependency bump that renames
// a path would silently restore the weight with nothing failing. So the artifact
// is checked, for the same reason the Buffer gate above checks it.
const DEAD_WEIGHT = [
  {
    // A key on every entry of the generated wallet directory. Structural rather
    // than a wallet's name, so a renamed wallet does not silently disable the
    // check. Verified absent from this repo's own sources.
    marker: /supportedInteractionStandards/,
    what:   "octez.connect's 116 kB bundled wallet registry (a directory of OTHER wallets)",
    fix:    'check that vite.config.ts\'s `stubBeaconWalletRegistry` plugin still matches the\n' +
            '    SDK\'s import path for `data/bundled-wallet-registry`',
  },
  {
    marker: /beacon-node-\d\.octez\.io/,
    what:   "the Matrix P2P transport's default node list",
    fix:    'check that the `@tezos-x/octez.connect-transport-matrix` alias in vite.config.ts\n' +
            '    still resolves to src/shared/beacon/matrix-transport-stub.ts',
  },
];

// Generous on purpose: the largest content-script graph today is ~142 kB, and
// either regression above would add 116 kB or 31 kB. This catches the cliff
// without failing on ordinary growth — and when it does fail, raising it should
// be a deliberate edit with a reason, not a reflex.
const CONTENT_SCRIPT_BUDGET_BYTES = 200 * 1024;

const weightFailures = [];
for (const entry of (m.content_scripts ?? []).flatMap((cs) => cs.js ?? [])) {
  const graph = [...reachableChunks(entry)];
  const sources = graph.map((name) => ({ name, source: readFileSync(`dist/${name}`, 'utf8') }));

  for (const { marker, what, fix } of DEAD_WEIGHT) {
    const hit = sources.filter((c) => marker.test(c.source));
    if (hit.length === 0) continue;
    weightFailures.push(
      `  ${entry}\n` +
      `    pulls in ${what}\n` +
      `    found in: ${hit.map((c) => c.name).join(', ')}\n` +
      `    Fix: ${fix}`,
    );
  }

  const bytes = sources.reduce((total, c) => total + Buffer.byteLength(c.source), 0);
  if (bytes > CONTENT_SCRIPT_BUDGET_BYTES) {
    weightFailures.push(
      `  ${entry}\n` +
      `    reachable graph is ${(bytes / 1024).toFixed(1)} kB across ${graph.length} chunks, over the ` +
      `${(CONTENT_SCRIPT_BUDGET_BYTES / 1024).toFixed(0)} kB budget.\n` +
      `    Fix: find what grew before raising the budget — this runs on the user's pages.`,
    );
  }
}

if (weightFailures.length > 0) {
  console.error(
    '[postbuild] FAIL — content script(s) carry dead weight:\n' + weightFailures.join('\n'),
  );
  process.exit(1);
}
console.log('[postbuild] content-script weight check passed (no dApp-side baggage, all graphs under budget)');