import type { BrowserContext } from '@playwright/test';

interface ListPendingResponse {
  ok:    boolean;
  data?: { requestId: string }[];
}

/**
 * Resolve the most recently enqueued dApp approval from a transient popup.html
 * page. We can't send chrome.runtime messages from the chrome.windows.create
 * approve popup itself — that window has a flaky lifecycle in headless
 * Chromium, gets closed before our evaluation lands, and races with the SW's
 * `chrome.windows.onRemoved` reject hook. The wallet's own popup.html is a
 * stable extension context that can sendMessage to the SW without surprises.
 */
export async function resolveLatestApproval(
  context:     BrowserContext,
  extensionId: string,
  decision:    'approve' | 'reject',
): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForFunction(() => typeof chrome !== 'undefined' && chrome.runtime != null);

    const pending = await page.evaluate(async () =>
      chrome.runtime.sendMessage({ type: 'LIST_PENDING' }),
    ) as ListPendingResponse;

    if (pending.ok !== true || !Array.isArray(pending.data) || pending.data.length === 0) {
      throw new Error(`No pending approvals found (response: ${JSON.stringify(pending)})`);
    }
    const requestId = pending.data[pending.data.length - 1].requestId;

    await page.evaluate(
      async ([rid, d]) => chrome.runtime.sendMessage({ type: 'RESOLVE_PENDING', requestId: rid, decision: d }),
      [requestId, decision] as const,
    );

    return requestId;
  } finally {
    await page.close();
  }
}
