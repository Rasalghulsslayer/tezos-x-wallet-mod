import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const WALLET_ROOT     = resolve(__dirname, '..');
const DIST_DIR        = resolve(WALLET_ROOT, 'dist');
const DIST_MANIFEST   = resolve(DIST_DIR, 'manifest.json');
const PACKAGE_JSON    = resolve(WALLET_ROOT, 'package.json');

interface DistManifest {
  version:                   string;
  web_accessible_resources?: ReadonlyArray<{ resources?: ReadonlyArray<string> }>;
  host_permissions?:         ReadonlyArray<string>;
}

interface PackageJson {
  version: string;
}

function fail(msg: string): never {
  throw new Error(`[e2e global-setup] ${msg}`);
}

export default function globalSetup(): void {
  if (!existsSync(DIST_DIR) || !existsSync(DIST_MANIFEST)) {
    fail(`Wallet dist not found at ${DIST_DIR}. Run \`npm run build -w @tezosx/wallet\` first.`);
  }

  const manifest = JSON.parse(readFileSync(DIST_MANIFEST, 'utf-8')) as DistManifest;
  const pkg      = JSON.parse(readFileSync(PACKAGE_JSON,  'utf-8')) as PackageJson;

  if (manifest.version !== pkg.version) {
    fail(`Manifest version (${manifest.version}) does not match package.json (${pkg.version}). Rebuild required.`);
  }

  for (const entry of manifest.web_accessible_resources ?? []) {
    for (const r of entry.resources ?? []) {
      if (r === '*' || r.endsWith('.html')) {
        fail(`Manifest exposes "${r}" via web_accessible_resources. The postbuild strip script must remove HTML pages — re-run \`npm run build\` and check scripts/postbuild-manifest.mjs.`);
      }
    }
  }
}
