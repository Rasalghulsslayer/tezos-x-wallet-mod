/**
 * ChromeApprovalPresenter owns the chrome.windows side of the approval flow,
 * including the windows.onRemoved → reject mapping that used to live in the
 * service worker. These tests pin that mapping and the idempotence of close().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChromeApprovalPresenter } from '../chrome-approval-presenter';

let onRemoved: ((windowId: number) => void) | undefined;
let created: Array<{ url?: string }>;
let removed: number[];

function stubChrome(createId: number | undefined): void {
  onRemoved = undefined;
  created = [];
  removed = [];
  vi.stubGlobal('chrome', {
    runtime: { getURL: (p: string) => `chrome-extension://ext-id/${p}` },
    windows: {
      create: async (opts: { url?: string }) => { created.push(opts); return createId == null ? undefined : { id: createId }; },
      remove: async (id: number) => { removed.push(id); },
      onRemoved: { addListener: (fn: (id: number) => void) => { onRemoved = fn; } },
    },
  });
}

describe('ChromeApprovalPresenter', () => {
  beforeEach(() => stubChrome(7));
  afterEach(() => vi.unstubAllGlobals());

  it('opens approve.html with the request id and returns the window id as handle', async () => {
    const presenter = new ChromeApprovalPresenter();
    const handle = await presenter.open('req-1', () => {});
    expect(handle).toBe(7);
    expect(created[0].url).toBe('chrome-extension://ext-id/approve.html?requestId=req-1');
  });

  it('invokes onDismiss when the user closes the approval window', async () => {
    const presenter = new ChromeApprovalPresenter();
    let dismissed = 0;
    await presenter.open('req-1', () => { dismissed++; });

    onRemoved?.(7); // user closed the popup
    expect(dismissed).toBe(1);
  });

  it('does not invoke onDismiss for an unrelated window close', async () => {
    const presenter = new ChromeApprovalPresenter();
    let dismissed = 0;
    await presenter.open('req-1', () => { dismissed++; });

    onRemoved?.(999); // some other window
    expect(dismissed).toBe(0);
  });

  it('close() removes the window and stops a later onRemoved from rejecting', async () => {
    const presenter = new ChromeApprovalPresenter();
    let dismissed = 0;
    const handle = await presenter.open('req-1', () => { dismissed++; });

    presenter.close(handle);
    expect(removed).toEqual([7]);

    // The programmatic remove fires onRemoved; the mapping is already cleared,
    // so it must NOT re-trigger the dismiss (which would double-reject).
    onRemoved?.(7);
    expect(dismissed).toBe(0);
  });

  it('close() is a no-op for a non-window handle', () => {
    const presenter = new ChromeApprovalPresenter();
    presenter.close(undefined);
    presenter.close('not-a-window');
    expect(removed).toEqual([]);
  });

  it('tolerates a window that could not be created (no id)', async () => {
    stubChrome(undefined);
    const presenter = new ChromeApprovalPresenter();
    const handle = await presenter.open('req-1', () => {});
    expect(handle).toBeUndefined();
    // No mapping was stored, so a stray onRemoved does nothing.
    expect(() => onRemoved?.(7)).not.toThrow();
  });
});
