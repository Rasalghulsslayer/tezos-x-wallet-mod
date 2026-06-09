import { chromium, type BrowserContext } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = dirname(__filename);
const WALLET_ROOT = resolve(__dirname, '../..');
const DIST_DIR    = resolve(WALLET_ROOT, 'dist');

interface CheckResult { name: string; ok: boolean; details: string }
const results: CheckResult[] = [];

function record(name: string, ok: boolean, details: string): void {
  results.push({ name, ok, details });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`\n[${tag}] ${name}\n  ${details.replaceAll('\n', '\n  ')}`);
}

async function checkKeyringImport(): Promise<void> {
  try {
    const keyring = await import('../../src/background/keyring.ts');
    const exportedNames = Object.keys(keyring).sort();
    if (!exportedNames.includes('Keyring')) {
      record(
        'keyring-imports-under-tsx',
        false,
        `keyring.ts imported but Keyring class is not exported.\nAll exports: ${exportedNames.join(', ')}`,
      );
      return;
    }
    record(
      'keyring-imports-under-tsx',
      true,
      `keyring.ts imported under tsx (Node ${process.version}). Exports: ${exportedNames.join(', ')}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    record(
      'keyring-imports-under-tsx',
      false,
      `Import failed. Fallback: standalone vault generator via Node Web Crypto.\nError: ${msg}`,
    );
  }
}

async function checkExtensionAndInterception(): Promise<void> {
  if (!existsSync(DIST_DIR) || !existsSync(resolve(DIST_DIR, 'manifest.json'))) {
    record(
      'preflight-dist-exists',
      false,
      `Wallet dist not found at ${DIST_DIR}. Run \`npm run build -w @tezosx/wallet\` first.`,
    );
    return;
  }

  const userDataDir = mkdtempSync(resolve(tmpdir(), 'tezosx-spike-'));
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
      ],
    });

    let sw = context.serviceWorkers()[0];
    if (sw == null) {
      try {
        sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
      } catch {
        record(
          'channel-chromium-loads-extension',
          false,
          'No service worker exposed by context within 10s. channel: "chromium" + --load-extension may not be loading the MV3 extension as expected.',
        );
        return;
      }
    }
    record(
      'channel-chromium-loads-extension',
      true,
      `Service worker exposed at ${sw.url()}`,
    );

    const TEST_URL = 'https://api.previewnet.tezosx.tzkt.io/v1/head';
    let interceptCount = 0;
    await context.route('**', async (route, request) => {
      if (request.url() === TEST_URL) {
        interceptCount += 1;
        await route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify({ level: 999_999, hash: 'spike-mock' }),
        });
        return;
      }
      await route.continue();
    });

    interface SwReturn {
      ok:     boolean;
      status?: number;
      body?:   { level?: number; hash?: string };
      error?:  string;
    }
    const swReturned = (await sw.evaluate(async (url) => {
      try {
        const res  = await fetch(url);
        const body = (await res.json()) as { level?: number; hash?: string };
        return { ok: true, status: res.status, body };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }, TEST_URL)) as SwReturn;

    const intercepted     = interceptCount > 0;
    const bodyMatchesMock = swReturned.ok && swReturned.body?.hash === 'spike-mock';

    if (intercepted && bodyMatchesMock) {
      record(
        'context-route-intercepts-sw-fetch',
        true,
        `context.route('**') intercepted SW fetch (${interceptCount} hits) AND the SW received the mocked body.`,
      );
    } else if (!intercepted) {
      record(
        'context-route-intercepts-sw-fetch',
        false,
        `SW fetch returned ${JSON.stringify(swReturned)} but context.route handler was NOT invoked. Fallback required: adapter injection via composition root.`,
      );
    } else {
      record(
        'context-route-intercepts-sw-fetch',
        false,
        `Handler invoked (${interceptCount}x) but SW received different body. swReturned=${JSON.stringify(swReturned)}.`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    record('extension-and-interception-unexpected', false, msg);
  } finally {
    if (context != null) await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log('── E2E feasibility checks ───────────────────────────────────');
  console.log(`  Node:      ${process.version}`);
  console.log(`  Platform:  ${process.platform}`);
  console.log(`  Wallet:    ${WALLET_ROOT}`);
  console.log(`  Dist:      ${DIST_DIR}`);

  await checkKeyringImport();
  await checkExtensionAndInterception();

  console.log('\n── Summary ──────────────────────────────────────────────────');
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);
  const allOk = results.every((r) => r.ok);
  console.log(`\nResult: ${allOk ? 'ALL PASS' : 'FAILURES — see details above'}\n`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
