import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext, Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const TEST_DAPP_DIR = resolve(__dirname, '../../test-dapp');

const DAPP_ORIGIN = 'http://localhost:3000';

export async function installDappRoute(context: BrowserContext): Promise<void> {
  await context.route(`${DAPP_ORIGIN}/**`, async (route) => {
    const url      = new URL(route.request().url());
    const fileName = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const filePath = resolve(TEST_DAPP_DIR, fileName);
    if (!existsSync(filePath)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    const body = readFileSync(filePath, 'utf-8');
    const contentType = fileName.endsWith('.html') ? 'text/html; charset=utf-8'
                      : fileName.endsWith('.js')   ? 'application/javascript; charset=utf-8'
                      : 'text/plain; charset=utf-8';
    await route.fulfill({ status: 200, contentType, body });
  });
}

export interface DappCallResult<T = unknown> {
  ok:       boolean;
  code?:    number | null;
  message?: string;
  result?:  T;
}

export class DappPage {
  private constructor(public readonly page: Page) {}

  static async open(context: BrowserContext): Promise<DappPage> {
    const page = await context.newPage();
    await page.goto(`${DAPP_ORIGIN}/`);
    // Make sure the injected provider has been wired up before any test driver
    // invokes window.dapp.* — the MAIN-world script needs window.ethereum.
    await page.waitForFunction(() => typeof window.ethereum !== 'undefined', { timeout: 10_000 });
    return new DappPage(page);
  }

  /** Trigger `window.dapp.connect()` in the page and return the eventual result. */
  connect(): Promise<DappCallResult<string[]>> {
    return this.page.evaluate(() => window.dapp.connect());
  }

  accounts(): Promise<DappCallResult<string[]>> {
    return this.page.evaluate(() => window.dapp.accounts());
  }

  sendTx(args: { from: string; to: string; value: string; data?: string }): Promise<DappCallResult<string>> {
    return this.page.evaluate((a) => window.dapp.sendTx(a), args);
  }

  signMsg(message: string, address: string): Promise<DappCallResult<string>> {
    return this.page.evaluate(([m, a]) => window.dapp.signMsg(m, a), [message, address] as const);
  }
}

declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown }) => Promise<unknown> };
    dapp: {
      connect:  () => Promise<DappCallResult<string[]>>;
      accounts: () => Promise<DappCallResult<string[]>>;
      sendTx:   (a: { from: string; to: string; value: string; data?: string }) => Promise<DappCallResult<string>>;
      signMsg:  (m: string, a: string) => Promise<DappCallResult<string>>;
    };
  }
}
