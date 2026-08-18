import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext, type Worker } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const WALLET_ROOT = resolve(__dirname, '../..');
export const DIST_DIR = resolve(WALLET_ROOT, 'dist');

export interface ExtensionHandles {
  context:     BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  userDataDir: string;
}

export async function launchExtensionContext(): Promise<ExtensionHandles> {
  const userDataDir = mkdtempSync(resolve(tmpdir(), 'tezosx-wallet-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (serviceWorker == null) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  // A no-op evaluate ensures the SW top-level (including buffer-shim) has run.
  await serviceWorker.evaluate(() => true);

  const extensionId = parseExtensionIdFromSwUrl(serviceWorker.url());

  return { context, serviceWorker, extensionId, userDataDir };
}

/**
 * Stop the extension's service worker over CDP — real MV3 eviction semantics.
 * Chrome respawns a fresh instance on the next extension event (e.g. the
 * popup's first chrome.runtime.sendMessage), and the replacement re-runs the
 * SW top level, so a spec can inject storage first and then exercise the boot
 * path against it (e.g. the boot-time alias-cache hydration, which reads
 * chrome.storage once, at startup). Note that chrome.runtime.reload() is NOT
 * usable for this — it permanently unloads a --load-extension extension
 * instead of reloading it.
 */
export async function evictServiceWorker(context: BrowserContext, current: Worker): Promise<void> {
  const browser = context.browser();
  if (browser == null) throw new Error('No Browser handle available for a CDP session');

  const session = await browser.newBrowserCDPSession();
  try {
    const { targetInfos } = (await session.send('Target.getTargets')) as {
      targetInfos: Array<{ targetId: string; type: string; url: string }>;
    };
    const swTarget = targetInfos.find((t) => t.type === 'service_worker' && t.url === current.url());
    if (swTarget == null) throw new Error(`No service_worker target found for ${current.url()}`);
    await session.send('Target.closeTarget', { targetId: swTarget.targetId });
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function closeExtensionContext(handles: ExtensionHandles): Promise<void> {
  await handles.context.close();
  rmSync(handles.userDataDir, { recursive: true, force: true });
}

function parseExtensionIdFromSwUrl(url: string): string {
  const m = /^chrome-extension:\/\/([a-z]+)\//.exec(url);
  if (m == null) throw new Error(`Cannot parse extension id from SW URL: ${url}`);
  return m[1];
}
