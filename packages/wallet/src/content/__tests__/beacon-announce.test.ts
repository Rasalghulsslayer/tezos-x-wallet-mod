/**
 * The synchronous half of the Beacon content script.
 *
 * This file exists because `beacon-announce.ts` is import-free BY NECESSITY — it
 * must be emitted as a synchronous IIFE so its `window` listener is registered
 * before page script runs, and @crxjs only does that for a fully self-contained
 * file. Self-contained means it re-states three literals that
 * `shared/beacon/page-frames.ts` also owns, so those copies are pinned here
 * against the shared module, and `page-frames.test.ts` pins that module against
 * the real SDK enum. A rename in the SDK therefore fails a test rather than
 * silently making the wallet invisible.
 *
 * It is a script with no exports, so it is exercised by importing it for its side
 * effects against a stubbed `window` and `chrome`.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  BEACON_HANDOFF_KEY,
  BEACON_WALLET_NAME,
  TO_EXTENSION,
  TO_PAGE,
  buildPongFrame,
} from '../../shared/beacon/page-frames';

const EXTENSION_ID = 'abcdefghijklmnopqrstuvwxyzabcdef';
const ORIGIN       = 'https://maps.example';
/** Must match `beacon-announce.ts`'s WALLET_ICON. */
const WALLET_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E" +
  "%3Crect width='100' height='100' rx='22' fill='%237c5cff'/%3E" +
  "%3Ctext x='50' y='70' font-size='58' text-anchor='middle' fill='white' font-family='Arial%2C sans-serif' font-weight='bold'%3ET%3C/text%3E" +
  '%3C/svg%3E';

interface Posted { data: unknown; targetOrigin: string }

/** A window stand-in that records what the script does to it. */
function makeWindow() {
  const listeners: ((event: MessageEvent) => void)[] = [];
  const posted: Posted[] = [];
  const win = {
    location:         { origin: ORIGIN },
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => { listeners.push(fn); },
    postMessage:      (data: unknown, targetOrigin: string) => { posted.push({ data, targetOrigin }); },
  } as unknown as Window & typeof globalThis;
  return { win, listeners, posted };
}

/** Deliver a frame as the page would: same window, same origin, unless overridden. */
function send(
  env:  ReturnType<typeof makeWindow>,
  data: unknown,
  over: { source?: unknown; origin?: string } = {},
): void {
  const event = {
    source: 'source' in over ? over.source : env.win,
    origin: over.origin ?? ORIGIN,
    data,
  } as unknown as MessageEvent;
  for (const fn of env.listeners) fn(event);
}

async function loadAnnounce(env: ReturnType<typeof makeWindow>): Promise<void> {
  vi.stubGlobal('window', env.win);
  vi.stubGlobal('chrome', { runtime: { id: EXTENSION_ID } });
  vi.resetModules();
  // @ts-expect-error — `beacon-announce.ts` is deliberately a SCRIPT, not a
  // module: @crxjs emits a synchronous IIFE only for a file with no imports AND
  // no exports, and that IIFE is what registers the window listener before page
  // script runs. TS therefore refuses to `import` it. Loaded here for its side
  // effects only — and if someone ever adds an export, this line starts failing,
  // which is exactly the warning we want.
  await import('../beacon-announce');
}

describe('beacon-announce — the synchronous half', () => {
  let env: ReturnType<typeof makeWindow>;

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    env = makeWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers its listener during module evaluation, with nothing awaited', async () => {
    // The whole reason this file is separate: on an IIFE-emitted content script
    // the listener must exist by the time page script runs. Beacon's discovery
    // ping is posted exactly once and never retried.
    await loadAnnounce(env);
    expect(env.listeners).toHaveLength(1);
  });

  it('answers the discovery ping with a FLAT pong carrying sender metadata', async () => {
    await loadAnnounce(env);
    send(env, { target: TO_EXTENSION, payload: 'ping' });

    expect(env.posted).toHaveLength(1);
    const frame = env.posted[0].data as Record<string, unknown>;
    // `listenForExtensions` reads event.data.payload and event.data.sender.
    expect(frame.payload).toBe('pong');
    expect(frame.target).toBe(TO_PAGE);
    expect('message' in frame).toBe(false);
    expect(frame.sender).toMatchObject({ id: EXTENSION_ID, name: BEACON_WALLET_NAME });
    expect(env.posted[0].targetOrigin).toBe(ORIGIN);
  });

  it('emits exactly what page-frames builds — the duplication is checked, not just commented', () => {
    // `beacon-announce.ts` cannot import `buildPongFrame` (it must stay
    // import-free to be emitted as a synchronous IIFE), so this equality is what
    // keeps the hand-copied shape from drifting.
    expect(buildPongFrame({
      id: EXTENSION_ID, name: BEACON_WALLET_NAME, iconUrl: WALLET_ICON,
    })).toEqual({ target: TO_PAGE, payload: 'pong', sender: {
      id: EXTENSION_ID, name: BEACON_WALLET_NAME, iconUrl: WALLET_ICON,
    } });
  });

  it('sends NO shortName, so the pairing modal shows the full wallet name', async () => {
    // beacon-ui renders an extension as `shortName ?? name ?? ''`. A shortName
    // makes the modal say something other than the name the user was told.
    await loadAnnounce(env);
    send(env, { target: TO_EXTENSION, payload: 'ping' });
    const sender = (env.posted[0].data as { sender: Record<string, unknown> }).sender;
    expect('shortName' in sender).toBe(false);
    expect(sender.name).toBe('TezosX Wallet');
  });

  it('answers the ping without needing the SDK half', async () => {
    // No hand-off consumer installed, nothing imported: still pongs.
    await loadAnnounce(env);
    send(env, { target: TO_EXTENSION, payload: 'ping' });
    expect(env.posted).toHaveLength(1);
    expect(env.win[BEACON_HANDOFF_KEY]?.buffered).toHaveLength(0);
  });

  it('uses the same hand-off key the SDK half reads', async () => {
    // The literal is duplicated on purpose (the file cannot import it); this is
    // the assertion that keeps the two copies honest.
    await loadAnnounce(env);
    expect(env.win[BEACON_HANDOFF_KEY]).toBeDefined();
  });

  it('buffers pairing and message frames until the SDK half arrives', async () => {
    await loadAnnounce(env);
    send(env, { target: TO_EXTENSION, payload: 'serialized-pairing' });
    send(env, { target: TO_EXTENSION, encryptedPayload: 'deadbeef' });

    const buffered = env.win[BEACON_HANDOFF_KEY]?.buffered ?? [];
    expect(buffered).toHaveLength(2);
    // Order matters: a pairing must reach the transport before the frames that
    // follow it.
    expect(buffered[0]).toMatchObject({ payload: 'serialized-pairing' });
    expect(buffered[1]).toMatchObject({ encryptedPayload: 'deadbeef' });
    // Buffering is not answering: nothing went back to the page.
    expect(env.posted).toHaveLength(0);
  });

  it('hands frames straight to onFrame once the SDK half installs it', async () => {
    await loadAnnounce(env);
    const seen: unknown[] = [];
    env.win[BEACON_HANDOFF_KEY]!.onFrame = (data) => { seen.push(data); };

    send(env, { target: TO_EXTENSION, encryptedPayload: 'aa' });
    expect(seen).toHaveLength(1);
    // and stops buffering, so nothing is delivered twice
    expect(env.win[BEACON_HANDOFF_KEY]?.buffered).toHaveLength(0);
  });

  it('caps the buffer instead of letting a looping page grow it without bound', async () => {
    await loadAnnounce(env);
    for (let i = 0; i < 200; i++) {
      send(env, { target: TO_EXTENSION, encryptedPayload: `frame-${i}` });
    }
    const buffered = env.win[BEACON_HANDOFF_KEY]?.buffered ?? [];
    expect(buffered.length).toBeLessThanOrEqual(32);
    expect(buffered.length).toBeGreaterThan(0);
  });

  it('ignores frames from another window or another origin', async () => {
    await loadAnnounce(env);
    send(env, { target: TO_EXTENSION, payload: 'ping' }, { source: { not: 'our window' } });
    send(env, { target: TO_EXTENSION, payload: 'ping' }, { origin: 'https://evil.example' });
    expect(env.posted).toHaveLength(0);
    expect(env.win[BEACON_HANDOFF_KEY]?.buffered).toHaveLength(0);
  });

  it('ignores the EIP-1193 bridge traffic sharing this window', async () => {
    await loadAnnounce(env);
    send(env, { type: 'TEZOSX_WALLET_REQUEST', requestId: 'x', args: { method: 'eth_chainId' } });
    send(env, { type: 'TEZOSX_WALLET_RESPONSE', requestId: 'x', ok: true });
    expect(env.posted).toHaveLength(0);
    expect(env.win[BEACON_HANDOFF_KEY]?.buffered).toHaveLength(0);
  });

  it('ignores its own outbound frames and the SDK\'s non-object posts', async () => {
    await loadAnnounce(env);
    send(env, { target: TO_PAGE, payload: 'pong', sender: { id: EXTENSION_ID } });
    for (const data of ['extensionsUpdated', null, undefined, 42, []]) send(env, data);
    expect(env.posted).toHaveLength(0);
    expect(env.win[BEACON_HANDOFF_KEY]?.buffered).toHaveLength(0);
  });

  it('reuses an existing hand-off object rather than replacing it', async () => {
    // Script order in the manifest puts announce first, but a reload or an
    // injection race must not orphan frames the other half is already watching.
    const existing = { buffered: [{ pre: 'existing' }] };
    (env.win as unknown as Record<string, unknown>)[BEACON_HANDOFF_KEY] = existing;
    await loadAnnounce(env);
    send(env, { target: TO_EXTENSION, encryptedPayload: 'aa' });
    expect(env.win[BEACON_HANDOFF_KEY]).toBe(existing);
    expect(existing.buffered).toHaveLength(2);
  });
});
