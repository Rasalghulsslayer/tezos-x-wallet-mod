/**
 * classifyChromeSender holds the chrome side of the #75 sender guard: it turns
 * the raw url/tab/origin facts of a chrome MessageSender into the channel the
 * router enforces policy on. The sw-wiring tests exercise the policy given a
 * channel; this suite pins the classification, so the two together cover the
 * #75 truth table end-to-end. A regression here (e.g. a foreign extension id
 * mis-classified as trusted-ui) would silently defeat the privileged guard.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classifyChromeSender } from '../chrome-message-source';

const OWN_EXT_ID = 'own-ext-id';
const OWN_BASE   = `chrome-extension://${OWN_EXT_ID}/`;

const sender = (s: Partial<chrome.runtime.MessageSender>) => s as chrome.runtime.MessageSender;

describe('classifyChromeSender', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: { id: OWN_EXT_ID, getURL: (p: string) => OWN_BASE + p },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("classifies the extension's own pages as trusted-ui", () => {
    expect(classifyChromeSender(sender({ url: `${OWN_BASE}popup.html` }))).toEqual({ channel: 'trusted-ui' });
    expect(classifyChromeSender(sender({ url: `${OWN_BASE}approve.html` }))).toEqual({ channel: 'trusted-ui' });
  });

  it('classifies a content-script tab as the dapp channel, carrying the verified origin', () => {
    expect(classifyChromeSender(sender({ tab: { id: 1 } as chrome.tabs.Tab, origin: 'https://dapp.example' })))
      .toEqual({ channel: 'dapp', verifiedOrigin: 'https://dapp.example' });
  });

  it('classifies a tab with no attested origin as dapp with undefined origin', () => {
    expect(classifyChromeSender(sender({ tab: { id: 1 } as chrome.tabs.Tab })))
      .toEqual({ channel: 'dapp', verifiedOrigin: undefined });
  });

  it('rejects a foreign extension id (no url, no tab) as unrecognized (null)', () => {
    expect(classifyChromeSender(sender({ id: 'malicious-extension' }))).toBeNull();
  });

  it('rejects a bare web-page URL as unrecognized (null)', () => {
    expect(classifyChromeSender(sender({ url: 'https://evil.example/page' }))).toBeNull();
  });

  it('rejects an empty sender as unrecognized (null)', () => {
    expect(classifyChromeSender(sender({}))).toBeNull();
  });

  it('does not treat a look-alike extension URL of another id as trusted-ui', () => {
    // startsWith own base only — a different extension id must not pass.
    expect(classifyChromeSender(sender({ url: 'chrome-extension://other-ext-id/popup.html' }))).toBeNull();
  });

  it('prefers trusted-ui over dapp when a sender is both an own page and tab-bearing', () => {
    // Theoretical (chrome does not produce this), but pin the documented tie-break:
    // the privileged URL check wins, so such a sender can never act as a dApp.
    expect(classifyChromeSender(sender({ url: `${OWN_BASE}popup.html`, tab: { id: 1 } as chrome.tabs.Tab })))
      .toEqual({ channel: 'trusted-ui' });
  });
});
