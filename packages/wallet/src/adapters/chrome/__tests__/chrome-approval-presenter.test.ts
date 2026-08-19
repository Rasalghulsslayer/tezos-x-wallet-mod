/**
 * ChromeApprovalPresenter owns both approval surfaces: the chrome.windows
 * popup (approve.html) when no wallet view is open — including the
 * windows.onRemoved → reject mapping — and the in-view path when a UI port
 * is connected. These tests pin the mapping, the idempotence of close(), the
 * surface selection, and the last-view-closed → reject semantics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChromeApprovalPresenter } from '../chrome-approval-presenter';
import type { ChromeUiPorts } from '../chrome-ui-ports';
import type { UiPortPush } from '@tezosx/wallet-core/shared/messages';

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

/** Minimal stand-in for ChromeUiPorts, controllable per test. */
function stubUiPorts(open: boolean) {
  const pushes: UiPortPush[] = [];
  let onAllDisconnected: (() => void) | null = null;
  const stub = {
    hasOpenView: () => open,
    broadcast:   (p: UiPortPush) => { pushes.push(p); },
    setOnAllDisconnected: (cb: () => void) => { onAllDisconnected = cb; },
  };
  return {
    ports: stub as unknown as ChromeUiPorts,
    pushes,
    setOpen: (v: boolean) => { open = v; },
    fireAllDisconnected: () => onAllDisconnected?.(),
  };
}

describe('ChromeApprovalPresenter — windowed surface (no view open)', () => {
  beforeEach(() => stubChrome(7));
  afterEach(() => vi.unstubAllGlobals());

  it('opens approve.html with the request id and returns a window handle', async () => {
    const presenter = new ChromeApprovalPresenter(stubUiPorts(false).ports);
    const handle = await presenter.open('req-1', () => {});
    expect(handle).toEqual({ kind: 'window', windowId: 7 });
    expect(created[0].url).toBe('chrome-extension://ext-id/approve.html?requestId=req-1');
  });

  it('invokes onDismiss when the user closes the approval window', async () => {
    const presenter = new ChromeApprovalPresenter(stubUiPorts(false).ports);
    let dismissed = 0;
    await presenter.open('req-1', () => { dismissed++; });

    onRemoved?.(7); // user closed the popup
    expect(dismissed).toBe(1);
  });

  it('does not invoke onDismiss for an unrelated window close', async () => {
    const presenter = new ChromeApprovalPresenter(stubUiPorts(false).ports);
    let dismissed = 0;
    await presenter.open('req-1', () => { dismissed++; });

    onRemoved?.(999); // some other window
    expect(dismissed).toBe(0);
  });

  it('close() removes the window and stops a later onRemoved from rejecting', async () => {
    const ui = stubUiPorts(false);
    const presenter = new ChromeApprovalPresenter(ui.ports);
    let dismissed = 0;
    const handle = await presenter.open('req-1', () => { dismissed++; });

    presenter.close(handle);
    expect(removed).toEqual([7]);
    // A view opened after the window may mirror the request from LIST_PENDING;
    // the resolution must reach it.
    expect(ui.pushes).toEqual([{ type: 'PENDING_CHANGED' }]);

    // The programmatic remove fires onRemoved; the mapping is already cleared,
    // so it must NOT re-trigger the dismiss (which would double-reject).
    onRemoved?.(7);
    expect(dismissed).toBe(0);
  });

  it('close() is a no-op for a malformed handle', () => {
    const presenter = new ChromeApprovalPresenter(stubUiPorts(false).ports);
    presenter.close(undefined);
    presenter.close('not-a-handle');
    expect(removed).toEqual([]);
  });

  it('tolerates a window that could not be created (no id)', async () => {
    stubChrome(undefined);
    const presenter = new ChromeApprovalPresenter(stubUiPorts(false).ports);
    const handle = await presenter.open('req-1', () => {});
    expect(handle).toEqual({ kind: 'window', windowId: -1 });
    // No mapping was stored, so a stray onRemoved does nothing, and closing
    // the sentinel handle must not call chrome.windows.remove(-1).
    expect(() => onRemoved?.(7)).not.toThrow();
    presenter.close(handle);
    expect(removed).toEqual([]);
  });
});

describe('ChromeApprovalPresenter — in-view surface (a wallet view is open)', () => {
  beforeEach(() => stubChrome(7));
  afterEach(() => vi.unstubAllGlobals());

  it('presents in-view without opening a window, and pushes PENDING_CHANGED', async () => {
    const ui = stubUiPorts(true);
    const presenter = new ChromeApprovalPresenter(ui.ports);
    const handle = await presenter.open('req-1', () => {});
    expect(handle).toEqual({ kind: 'view', requestId: 'req-1' });
    expect(created).toEqual([]);
    expect(ui.pushes).toEqual([{ type: 'PENDING_CHANGED' }]);
  });

  it('close() on a view handle pushes a refresh and never touches windows', async () => {
    const ui = stubUiPorts(true);
    const presenter = new ChromeApprovalPresenter(ui.ports);
    const handle = await presenter.open('req-1', () => {});
    presenter.close(handle);
    expect(removed).toEqual([]);
    expect(ui.pushes).toEqual([{ type: 'PENDING_CHANGED' }, { type: 'PENDING_CHANGED' }]);
  });

  it('rejects in-view approvals when the last wallet view disconnects', async () => {
    const ui = stubUiPorts(true);
    const presenter = new ChromeApprovalPresenter(ui.ports);
    let dismissed = 0;
    await presenter.open('req-1', () => { dismissed++; });
    await presenter.open('req-2', () => { dismissed++; });

    ui.fireAllDisconnected();
    expect(dismissed).toBe(2);

    // Already dismissed — a second disconnect must not double-reject.
    ui.fireAllDisconnected();
    expect(dismissed).toBe(2);
  });

  it('close() clears the dismiss mapping so a later disconnect is a no-op', async () => {
    const ui = stubUiPorts(true);
    const presenter = new ChromeApprovalPresenter(ui.ports);
    let dismissed = 0;
    const handle = await presenter.open('req-1', () => { dismissed++; });
    presenter.close(handle);

    ui.fireAllDisconnected();
    expect(dismissed).toBe(0);
  });

  it('falls back to a window once the views are gone', async () => {
    const ui = stubUiPorts(true);
    const presenter = new ChromeApprovalPresenter(ui.ports);
    ui.setOpen(false);
    const handle = await presenter.open('req-1', () => {});
    expect(handle).toEqual({ kind: 'window', windowId: 7 });
    expect(created).toHaveLength(1);
  });
});
