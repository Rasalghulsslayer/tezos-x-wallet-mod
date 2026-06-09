import type { BrowserContext } from '@playwright/test';

interface UnlockResponse {
  ok?:    boolean;
  code?:   number;
  message?: string;
}

/**
 * Send an UNLOCK message to the service worker from a transient
 * extension page. We cannot send it from `sw.evaluate()` because
 * `chrome.runtime.sendMessage` originating in the SW does not trigger
 * its own `chrome.runtime.onMessage` listener — the message must come
 * from another extension context.
 */
export async function unlockProgrammatically(
  context: BrowserContext,
  extensionId: string,
  password: string,
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForFunction(() => typeof chrome !== 'undefined' && chrome.runtime != null);
    const result = await page.evaluate(async (pwd: string) => {
      return await chrome.runtime.sendMessage({ type: 'UNLOCK', password: pwd });
    }, password);
    const r = result as UnlockResponse | undefined;
    if (r != null && r.ok === false) {
      throw new Error(`UNLOCK failed (code ${r.code ?? '?'}): ${r.message ?? 'unknown'}`);
    }
  } finally {
    await page.close();
  }
}
