import type { BrowserContext, Page } from '@playwright/test';

export type PendingKind = 'connect' | 'transaction' | 'signature' | 'unknown';

export class ApprovePage {
  private constructor(public readonly page: Page) {}

  /** Waits for the next chrome.windows.create-spawned approve popup. */
  static async waitForOpen(context: BrowserContext, timeoutMs = 15_000): Promise<ApprovePage> {
    const page = await context.waitForEvent('page', {
      predicate: (p) => p.url().includes('approve.html'),
      timeout:   timeoutMs,
    });
    // Wait for the React tree to mount before allowing interactions.
    await page.waitForSelector('.tx-approval', { timeout: 10_000 });
    return new ApprovePage(page);
  }

  /** Inspect which sub-view rendered (connect / transaction / signature). */
  async readPendingKind(): Promise<PendingKind> {
    return this.page.evaluate(() => {
      if (document.body.innerText.includes('Connection request')) return 'connect';
      if (document.body.innerText.includes('Transaction request') || document.querySelector('.tx-lane') != null) return 'transaction';
      if (document.body.innerText.includes('Signature request')   || document.body.innerText.includes('Sign message')) return 'signature';
      return 'unknown';
    });
  }

  async clickPrimary(): Promise<void> {
    // The primary action button (Connect / Approve / Sign) is the last
    // button in the action bar regardless of label.
    await this.page.locator('.tx-action-bar button').last().click();
  }

  async clickReject(): Promise<void> {
    // Reject is consistently the first button in the action bar.
    await this.page.locator('.tx-action-bar button').first().click();
  }

  /**
   * Send RESOLVE_PENDING straight to the SW from the approve page's context.
   * Playwright click()s on chromium-popup windows have proven flaky in
   * headless mode (the popup loses its lifecycle as soon as the test thread
   * tries to interact); going through chrome.runtime.sendMessage keeps the
   * full SW message-routing path under test and bypasses the click flake.
   */
  async resolveViaMessage(decision: 'approve' | 'reject'): Promise<void> {
    const requestId = new URL(this.page.url()).searchParams.get('requestId') ?? '';
    if (requestId === '') throw new Error('Approve page has no requestId query param');
    await this.page.evaluate(async ([rid, d]) => {
      await chrome.runtime.sendMessage({ type: 'RESOLVE_PENDING', requestId: rid, decision: d });
    }, [requestId, decision] as const);
  }

  async waitForClose(timeoutMs = 5_000): Promise<void> {
    await this.page.waitForEvent('close', { timeout: timeoutMs });
  }

  async expectIframeBlocked(): Promise<boolean> {
    return this.page.locator('.tx-err-card').filter({ hasText: /cannot be embedded/i }).isVisible();
  }
}
