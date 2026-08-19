/**
 * ChromeUiPorts tracks the long-lived ports wallet views open, and is the
 * approval presenter's authority on "is a trusted view visible?". These tests
 * pin the trust filter (port name + extension-page sender), the
 * visibility-gated presence signal, the broadcast fan-out, and the
 * last-disconnect callback.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChromeUiPorts } from '../chrome-ui-ports';

interface FakePort {
  name:         string;
  sender?:      { url?: string };
  posted:       unknown[];
  postMessage:  (msg: unknown) => void;
  onMessage:    { addListener: (fn: (msg: unknown) => void) => void };
  onDisconnect: { addListener: (fn: () => void) => void };
  disconnect:   () => void;
  setVisible:   (visible: boolean) => void;
}

let onConnect: ((port: FakePort) => void) | undefined;

function makePort(name: string, url?: string): FakePort {
  let onDisc: (() => void) | undefined;
  let onMsg:  ((msg: unknown) => void) | undefined;
  const port: FakePort = {
    name,
    sender: url != null ? { url } : undefined,
    posted: [],
    postMessage(msg: unknown) { this.posted.push(msg); },
    onMessage:    { addListener: (fn) => { onMsg = fn; } },
    onDisconnect: { addListener: (fn) => { onDisc = fn; } },
    disconnect: () => onDisc?.(),
    setVisible: (visible) => onMsg?.({ type: 'VIEW_VISIBILITY', visible }),
  };
  return port;
}

function connectVisiblePort(): FakePort {
  const port = makePort('tezosx-ui', 'chrome-extension://ext-id/popup.html');
  onConnect?.(port);
  port.setVisible(true);
  return port;
}

beforeEach(() => {
  onConnect = undefined;
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (p: string) => `chrome-extension://ext-id/${p}`,
      onConnect: { addListener: (fn: (port: FakePort) => void) => { onConnect = fn; } },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('ChromeUiPorts', () => {
  it('counts an extension-page port as an open view once it reports visible', () => {
    const ports = new ChromeUiPorts();
    expect(ports.hasOpenView()).toBe(false);
    const port = makePort('tezosx-ui', 'chrome-extension://ext-id/popup.html');
    onConnect?.(port);
    // Connected but not yet visible — a background tab must not count.
    expect(ports.hasOpenView()).toBe(false);
    port.setVisible(true);
    expect(ports.hasOpenView()).toBe(true);
  });

  it('a view that reports hidden stops counting as open', () => {
    const ports = new ChromeUiPorts();
    const port = connectVisiblePort();
    expect(ports.hasOpenView()).toBe(true);
    port.setVisible(false);
    expect(ports.hasOpenView()).toBe(false);
  });

  it('ignores ports with a different name', () => {
    const ports = new ChromeUiPorts();
    const port = makePort('other-port', 'chrome-extension://ext-id/popup.html');
    onConnect?.(port);
    port.setVisible(true);
    expect(ports.hasOpenView()).toBe(false);
  });

  it('ignores ports from non-extension senders (content script spoof)', () => {
    const ports = new ChromeUiPorts();
    const a = makePort('tezosx-ui', 'https://evil.example/dapp');
    const b = makePort('tezosx-ui', undefined);
    onConnect?.(a);
    onConnect?.(b);
    a.setVisible(true);
    b.setVisible(true);
    expect(ports.hasOpenView()).toBe(false);
  });

  it('broadcasts to every registered port, visible or not', () => {
    const ports = new ChromeUiPorts();
    const a = connectVisiblePort();
    const b = makePort('tezosx-ui', 'chrome-extension://ext-id/popup.html?mode=side');
    onConnect?.(b);   // stays hidden — must still hear pushes to stay current
    ports.broadcast({ type: 'PENDING_CHANGED' });
    expect(a.posted).toEqual([{ type: 'PENDING_CHANGED' }]);
    expect(b.posted).toEqual([{ type: 'PENDING_CHANGED' }]);
  });

  it('fires the all-disconnected callback only when the last port drops', () => {
    const ports = new ChromeUiPorts();
    let fired = 0;
    ports.setOnAllDisconnected(() => { fired++; });
    const a = connectVisiblePort();
    const b = connectVisiblePort();

    a.disconnect();
    expect(fired).toBe(0);
    expect(ports.hasOpenView()).toBe(true);

    b.disconnect();
    expect(fired).toBe(1);
    expect(ports.hasOpenView()).toBe(false);
  });
});
