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

export async function closeExtensionContext(handles: ExtensionHandles): Promise<void> {
  await handles.context.close();
  rmSync(handles.userDataDir, { recursive: true, force: true });
}

function parseExtensionIdFromSwUrl(url: string): string {
  const m = /^chrome-extension:\/\/([a-z]+)\//.exec(url);
  if (m == null) throw new Error(`Cannot parse extension id from SW URL: ${url}`);
  return m[1];
}
